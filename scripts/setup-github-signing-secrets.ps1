#Requires -Version 5.1
param(
    [string]$Password,
    [string]$PfxPath = ".codesign/ai-shelf-selfsign.pfx"
)

$ErrorActionPreference = 'Stop'

if (-not $Password) {
    $Password = Read-Host "PFX export password (used for CSC_KEY_PASSWORD secret)"
}

& "$PSScriptRoot/new-selfsigned-codesign.ps1" -OutputPath $PfxPath -Password $Password

Write-Host ''
Write-Host '=== GitHub Actions secrets ===' -ForegroundColor Cyan
Write-Host 'Name: CSC_KEY_PASSWORD'
Write-Host "Value: $Password"
Write-Host ''
Write-Host 'Name: CSC_LINK'
Write-Host 'Value: (copy the single base64 line below)'
Write-Host ''

& "$PSScriptRoot/encode-csc-link-secret.ps1" -PfxPath $PfxPath -Password $Password
