#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string]$PfxPath,

    [Parameter(Mandatory = $true)]
    [string]$Password
)

$ErrorActionPreference = 'Stop'

$pfxPath = (Resolve-Path -LiteralPath $PfxPath).Path
& "$PSScriptRoot/assert-signing-pfx.ps1" -Path $pfxPath -Password $Password

$bytes = [IO.File]::ReadAllBytes($pfxPath)
$header = ($bytes[0..3] | ForEach-Object { '{0:X2}' -f $_ }) -join ' '
if ($bytes[0] -ne 0x30) {
    throw "Input is not a PKCS#12 PFX (DER header $header). Export a .pfx with private key."
}

$base64 = [Convert]::ToBase64String($bytes)

Write-Host "PFX size: $($bytes.Length) bytes (DER header $header)"
Write-Host "CSC_LINK base64 length: $($base64.Length) characters (must match GitHub secret exactly)"
Write-Host ''
Write-Host 'Copy the single line below into the GitHub CSC_LINK secret (no quotes, no line breaks):'
Write-Host ''
Write-Host $base64
Write-Host ''
Write-Host "Set CSC_KEY_PASSWORD to the same export password used for: $pfxPath"
