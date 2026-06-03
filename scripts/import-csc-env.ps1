#Requires -Version 5.1
# Dot-source in CI steps: . ./scripts/import-csc-env.ps1

$ErrorActionPreference = 'Stop'

if ($env:CSC_KEY_PASSWORD_FILE) {
    if (-not (Test-Path -LiteralPath $env:CSC_KEY_PASSWORD_FILE)) {
        throw "CSC_KEY_PASSWORD_FILE not found: $($env:CSC_KEY_PASSWORD_FILE)"
    }
    $env:CSC_KEY_PASSWORD = ([IO.File]::ReadAllText($env:CSC_KEY_PASSWORD_FILE)).Trim()
}

if (-not $env:CSC_KEY_PASSWORD) {
    throw 'CSC_KEY_PASSWORD is not set. Configure GitHub secrets or use the fallback self-signed cert step.'
}

if (-not $env:CSC_LINK) {
    throw 'CSC_LINK is not set.'
}

if (-not (Test-Path -LiteralPath $env:CSC_LINK)) {
    throw "Signing PFX not found at CSC_LINK path: $($env:CSC_LINK)"
}
