#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [switch]$RequireSigned,

    [switch]$RequireTrusted
)

if (-not (Test-Path -LiteralPath $Path)) {
    Write-Error "File not found: $Path"
    exit 1
}

$sig = Get-AuthenticodeSignature -FilePath $Path
$subject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { "(none)" }

Write-Host "File: $Path"
Write-Host "Status: $($sig.Status)"
Write-Host "Signer: $subject"

if ($RequireSigned -or $RequireTrusted) {
    if (-not $sig.SignerCertificate) {
        Write-Error "File is not Authenticode-signed."
        exit 1
    }

    if ($RequireTrusted -and $sig.Status -ne 'Valid') {
        Write-Error "Expected a trusted Authenticode signature, got: $($sig.Status). $($sig.StatusMessage)"
        exit 1
    }

    if ($sig.Status -eq 'Valid') {
        Write-Host "Authenticode signature verified (trusted)."
    } else {
        Write-Host "Authenticode signature present (self-signed / untrusted): $($sig.Status)"
    }
    exit 0
}

if ($sig.Status -eq 'Valid') {
    Write-Host "Authenticode signature verified (trusted)."
    exit 0
}

if ($sig.SignerCertificate) {
    Write-Host "Authenticode signature present (self-signed / untrusted): $($sig.Status)"
    exit 0
}

if ($sig.Status -eq 'NotSigned') {
    Write-Host "Installer is unsigned."
    exit 0
}

Write-Error "Unexpected signature status: $($sig.Status). $($sig.StatusMessage)"
exit 1
