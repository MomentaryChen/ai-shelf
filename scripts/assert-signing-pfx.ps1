#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Password,

    [string]$ExpectedPublisherName,

    [switch]$SignToolPreflight
)

$ErrorActionPreference = 'Stop'

function Get-WindowsSdkSignToolPath {
    $kits = @(
        "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe",
        "${env:ProgramFiles}\Windows Kits\10\bin\*\x64\signtool.exe"
    )
    foreach ($pattern in $kits) {
        $found = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue |
            Sort-Object { $_.FullName } -Descending |
            Select-Object -First 1
        if ($found) {
            return $found.FullName
        }
    }
    return $null
}

function Test-SignToolLoadsPfx {
    param(
        [string]$PfxPath,
        [string]$Password
    )

    $signtool = Get-WindowsSdkSignToolPath
    if (-not $signtool) {
        Write-Host 'SignTool preflight skipped: Windows SDK signtool.exe not found on PATH.'
        return
    }

    $stamp = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
    $testExe = Join-Path $stamp 'ai-shelf-signtool-preflight.exe'
    Copy-Item -LiteralPath (Get-Command pwsh).Source -Destination $testExe -Force

    $args = @(
        'sign',
        '/f', $PfxPath,
        '/p', $Password,
        '/fd', 'sha256',
        '/tr', 'http://timestamp.digicert.com',
        '/td', 'sha256',
        '/d', 'AI Shelf SignTool preflight',
        '/debug',
        $testExe
    )

    Write-Host "SignTool preflight: $signtool"
    & $signtool @args
    if ($LASTEXITCODE -ne 0) {
        throw @"
SignTool could not sign with this PFX/password (same failure electron-builder uses).
Check CSC_KEY_PASSWORD, re-run encode-csc-link-secret.ps1, and ensure publisherName matches the cert CN.
"@
    }

    Remove-Item -LiteralPath $testExe -Force -ErrorAction SilentlyContinue
    Write-Host 'SignTool preflight OK.'
}

if (-not (Test-Path -LiteralPath $Path)) {
    throw "Signing certificate not found: $Path"
}

$passwordPlain = $Password.Trim()
if (-not $passwordPlain) {
    throw 'CSC_KEY_PASSWORD is empty after trimming whitespace.'
}

$bytes = [IO.File]::ReadAllBytes($Path)
if ($bytes.Length -lt 4 -or $bytes[0] -ne 0x30) {
    $header = ($bytes[0..([Math]::Min(3, $bytes.Length - 1))] | ForEach-Object { '{0:X2}' -f $_ }) -join ' '
    throw @"
File at '$Path' is not PKCS#12 DER (expected header 30 82, got $header).
CSC_LINK is likely double-base64 or not raw .pfx bytes — re-run encode-csc-link-secret.ps1.
"@
}

$securePassword = ConvertTo-SecureString -String $passwordPlain -AsPlainText -Force

try {
    $pfx = Get-PfxData -FilePath $Path -Password $securePassword
} catch {
    $hint = if ($_.Exception.Message -match 'not a valid PFX') {
        'PFX structure looks valid; check CSC_KEY_PASSWORD matches the export password (no extra quotes or newlines).'
    } else {
        'Check CSC_KEY_PASSWORD and that the PFX was exported with an exportable private key.'
    }
    throw @"
Failed to open PFX at '$Path' with CSC_KEY_PASSWORD. $hint
Original error: $($_.Exception.Message)
"@
}

$signingCerts = @($pfx.EndEntityCertificates | Where-Object {
        $_.HasPrivateKey -and $_.EnhancedKeyUsageList.ObjectId -contains '1.3.6.1.5.5.7.3.3'
    })

if ($signingCerts.Count -eq 0) {
    $subjects = @($pfx.EndEntityCertificates | ForEach-Object { $_.Subject })
    throw "PFX does not contain a code-signing certificate with a private key. Found: $($subjects -join '; ')"
}

$cert = $signingCerts[0]
Write-Host "PFX OK: $($cert.Subject)"
Write-Host "Thumbprint: $($cert.Thumbprint)"

if ($ExpectedPublisherName) {
    $cn = ($cert.Subject -split ',\s*' | Where-Object { $_ -like 'CN=*' } | Select-Object -First 1) -replace '^CN=', ''
    if ($cn -ne $ExpectedPublisherName) {
        throw @"
Certificate CN '$cn' does not match build.win.signtoolOptions.publisherName '$ExpectedPublisherName'.
Update package.json publisherName or re-export a cert with matching CN.
"@
    }
}

if ($SignToolPreflight) {
    Test-SignToolLoadsPfx -PfxPath $Path -Password $passwordPlain
}
