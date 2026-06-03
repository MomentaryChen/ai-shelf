#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string]$Password
)

$ErrorActionPreference = 'Stop'

if (-not $env:RUNNER_TEMP) {
    throw 'RUNNER_TEMP is not set; write-csc-password-file.ps1 is for CI runners only.'
}

$plain = $Password.Trim()
if (-not $plain) {
    throw 'CSC_KEY_PASSWORD is empty after trimming whitespace.'
}

$file = Join-Path $env:RUNNER_TEMP 'csc-key-password.txt'
[System.IO.File]::WriteAllText($file, $plain, [Text.UTF8Encoding]::new($false))

if ($env:GITHUB_ENV) {
    Add-Content -Path $env:GITHUB_ENV -Value "CSC_KEY_PASSWORD_FILE=$file"
}

Write-Host "Stored CSC_KEY_PASSWORD in runner temp file (value not logged)."
