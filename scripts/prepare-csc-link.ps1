#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string]$Link,

    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

if (Test-Path -LiteralPath $Link) {
    Write-Output $Link
    exit 0
}

if (-not $OutputPath) {
    if ($env:RUNNER_TEMP) {
        $OutputPath = Join-Path $env:RUNNER_TEMP 'repo-codesign.pfx'
    } else {
        $OutputPath = Join-Path (Get-Location) '.codesign/repo-codesign.pfx'
        New-Item -ItemType Directory -Force -Path (Split-Path $OutputPath) | Out-Null
    }
}

$normalized = ($Link -replace '\s', '')
try {
    $bytes = [Convert]::FromBase64String($normalized)
} catch {
    throw "CSC_LINK is not a file path or valid base64 PFX: $($_.Exception.Message)"
}

[IO.File]::WriteAllBytes($OutputPath, $bytes)
Write-Host "Decoded CSC_LINK base64 to: $OutputPath"
Write-Output $OutputPath
