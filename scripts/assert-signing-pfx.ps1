#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Password,

    [string]$ExpectedPublisherName
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Path)) {
    throw "Signing certificate not found: $Path"
}

$passwordPlain = $Password.Trim()
if (-not $passwordPlain) {
    throw 'CSC_KEY_PASSWORD is empty after trimming whitespace.'
}

$securePassword = ConvertTo-SecureString -String $passwordPlain -AsPlainText -Force

try {
    $pfx = Get-PfxData -FilePath $Path -Password $securePassword
} catch {
    throw @"
Failed to open PFX at '$Path' with CSC_KEY_PASSWORD.
Common causes: wrong password, corrupt base64 in CSC_LINK, or PFX exported without a private key.
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
