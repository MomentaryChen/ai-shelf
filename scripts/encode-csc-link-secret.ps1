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
$base64 = [Convert]::ToBase64String($bytes)

Write-Host ''
Write-Host 'Copy the single line below into the GitHub CSC_LINK secret (no quotes, no line breaks):'
Write-Host ''
Write-Host $base64
Write-Host ''
Write-Host "Set CSC_KEY_PASSWORD to the same export password used for: $pfxPath"
