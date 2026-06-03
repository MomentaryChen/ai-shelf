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

if ($env:GITHUB_ACTIONS -eq 'true' -and -not $env:SIGNTOOL_PATH) {
    $kits = @(
        "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe",
        "${env:ProgramFiles}\Windows Kits\10\bin\*\x64\signtool.exe"
    )
    foreach ($pattern in $kits) {
        $sdk = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue |
            Sort-Object { $_.FullName } -Descending |
            Select-Object -First 1
        if ($sdk) {
            $env:SIGNTOOL_PATH = $sdk.FullName
            if ($env:GITHUB_ENV) {
                Add-Content -Path $env:GITHUB_ENV -Value "SIGNTOOL_PATH=$($sdk.FullName)"
            }
            Write-Host "Using Windows SDK SignTool for electron-builder: $($sdk.FullName)"
            break
        }
    }
}
