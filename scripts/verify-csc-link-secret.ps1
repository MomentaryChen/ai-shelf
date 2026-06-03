#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string]$Base64File,

    [Parameter(Mandatory = $true)]
    [string]$Password,

    [int]$ExpectedPfxBytes = 0
)

$ErrorActionPreference = 'Stop'

$base64 = (Get-Content -LiteralPath $Base64File -Raw).Trim()
if (-not $base64) {
    throw "File is empty: $Base64File"
}

Write-Host "Base64 characters: $($base64.Length)"
$bytes = [Convert]::FromBase64String($base64)
Write-Host "Decoded PKCS#12 bytes: $($bytes.Length)"

if ($ExpectedPfxBytes -gt 0 -and $bytes.Length -ne $ExpectedPfxBytes) {
    throw "Decoded size $($bytes.Length) does not match expected PFX size $ExpectedPfxBytes — secret file is truncated or wrong."
}

$temp = [IO.Path]::Combine([IO.Path]::GetTempPath(), 'verify-csc-link.pfx')
[IO.File]::WriteAllBytes($temp, $bytes)
try {
    & "$PSScriptRoot/prepare-csc-link.ps1" -Link $base64 -Password $Password | Out-Null
    Write-Host 'verify-csc-link-secret: OK — safe to paste this file into GitHub CSC_LINK.'
} finally {
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
}
