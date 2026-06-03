#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$Value
)

$ErrorActionPreference = 'Stop'

if (-not $env:GITHUB_ENV) {
    throw 'GITHUB_ENV is not set; use this script only in GitHub Actions.'
}

# Avoid UTF-8 BOM and special-character breakage from inline KEY=value lines.
$delimiter = "${Name}_$([guid]::NewGuid().ToString('N'))"
Add-Content -Path $env:GITHUB_ENV -Value "${Name}<<${delimiter}"
Add-Content -Path $env:GITHUB_ENV -Value $Value
Add-Content -Path $env:GITHUB_ENV -Value $delimiter
