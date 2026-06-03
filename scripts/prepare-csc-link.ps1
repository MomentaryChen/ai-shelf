#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string]$Link,

    [string]$OutputPath,

    [string]$Password
)

$ErrorActionPreference = 'Stop'

function Test-DerPkcs12Bytes {
    param([byte[]]$Bytes)
    return $Bytes.Length -ge 4 -and $Bytes[0] -eq 0x30
}

function Get-BytesHeaderHex {
    param([byte[]]$Bytes)
    $count = [Math]::Min(4, $Bytes.Length)
    ($Bytes[0..($count - 1)] | ForEach-Object { '{0:X2}' -f $_ }) -join ' '
}

function ConvertFrom-Base64Payload {
    param([string]$Payload)
    $normalized = ($Payload -replace '\s', '')
    try {
        return [Convert]::FromBase64String($normalized)
    } catch {
        throw "CSC_LINK is not a file path or valid base64: $($_.Exception.Message)"
    }
}

function ConvertTo-SignToolPfxBytes {
    param(
        [byte[]]$Bytes,
        [string]$Password
    )

    $plain = $Password.Trim()
    $collection = [System.Security.Cryptography.X509Certificates.X509Certificate2Collection]::new()
    $flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable `
        -bor [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
    $collection.Import($Bytes, $plain, $flags)
    return $collection.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pkcs12, $plain)
}

function Resolve-CscLinkBytes {
    param([string]$Link)

    $payload = $Link.Trim()
    if ($payload -match '^data:[^;]+;base64,(.+)$') {
        $payload = $Matches[1]
    }

    $bytes = ConvertFrom-Base64Payload $payload
    if (Test-DerPkcs12Bytes $bytes) {
        Write-Host "CSC_LINK decoded to PKCS#12 ($($bytes.Length) bytes, header $(Get-BytesHeaderHex $bytes))"
        return $bytes
    }

    $text = [Text.Encoding]::UTF8.GetString($bytes).Trim()
    if ($text -match '^-----BEGIN') {
        throw @"
CSC_LINK decodes to PEM text, not a binary PFX.
Export a password-protected .pfx (with private key) and run:
  ./scripts/encode-csc-link-secret.ps1 -PfxPath <path> -Password <password>
"@
    }

    if ($text -match '^[A-Za-z0-9+/]+=*$') {
        Write-Host "CSC_LINK looks base64-encoded twice (header $(Get-BytesHeaderHex $bytes)); decoding inner payload..."
        $inner = ConvertFrom-Base64Payload $text
        if (Test-DerPkcs12Bytes $inner) {
            Write-Host "Inner payload is PKCS#12 ($($inner.Length) bytes, header $(Get-BytesHeaderHex $inner))"
            return $inner
        }
        $bytes = $inner
    }

    throw @"
Decoded CSC_LINK is not a PKCS#12 PFX (expected DER header 30 82, got $(Get-BytesHeaderHex $bytes); $($bytes.Length) bytes).
Store base64 of the raw .pfx file bytes — not a file path, PEM, or base64-of-base64 text.
Regenerate with: ./scripts/encode-csc-link-secret.ps1 -PfxPath <.pfx> -Password <password>
"@
}

$Link = $Link.Trim()

if (Test-Path -LiteralPath $Link) {
    Write-Output (Resolve-Path -LiteralPath $Link).Path
    exit 0
}

if (-not $OutputPath) {
    if ($env:RUNNER_TEMP) {
        $OutputPath = Join-Path $env:RUNNER_TEMP 'repo-codesign.pfx'
    } else {
        $OutputPath = Join-Path (Get-Location) '.codesign/repo-codesign.pfx'
        New-Item -ItemType Directory -Force -Path (Split-Path $OutputPath) | Out-Null
    }
}

$bytes = Resolve-CscLinkBytes -Link $Link
if ($bytes.Length -lt 100) {
    throw "Resolved CSC_LINK is too small ($($bytes.Length) bytes) to be a valid PFX."
}

if ($Password) {
    $bytes = ConvertTo-SignToolPfxBytes -Bytes $bytes -Password $Password
    Write-Host "Normalized PKCS#12 for SignTool ($($bytes.Length) bytes)."
}

[IO.File]::WriteAllBytes($OutputPath, $bytes)
Write-Host "Wrote signing PFX: $OutputPath ($($bytes.Length) bytes)"

if ($Password) {
    $assertArgs = @{
        Path     = $OutputPath
        Password = $Password
    }
    if ($env:GITHUB_ACTIONS -eq 'true') {
        $assertArgs.SignToolPreflight = $true
    }
    & "$PSScriptRoot/assert-signing-pfx.ps1" @assertArgs
}

Write-Output $OutputPath
