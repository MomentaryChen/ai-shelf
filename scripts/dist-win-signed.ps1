#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

& "$PSScriptRoot/new-selfsigned-codesign.ps1"
$env:CSC_LINK = Join-Path (Get-Location) ".codesign/ai-shelf-selfsign.pfx"
$env:CSC_KEY_PASSWORD = "ai-shelf-selfsign"
pnpm dist:win
