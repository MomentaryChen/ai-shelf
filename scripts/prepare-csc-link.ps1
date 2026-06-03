#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string]$Link,

    [string]$OutputPath,

    [string]$Password
)

$ErrorActionPreference = 'Stop'

$Link = $Link.Trim()

if (Test-Path -LiteralPath $Link) {
    Write-Output (Resolve-Path -LiteralPath $Link).Path
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

$payload = $Link
if ($payload -match '^data:[^;]+;base64,(.+)$') {
    $payload = $Matches[1]
}

$normalized = ($payload -replace '\s', '')
try {
    $bytes = [Convert]::FromBase64String($normalized)
} catch {
    throw "CSC_LINK is not a file path or valid base64 PFX: $($_.Exception.Message)"
}

if ($bytes.Length -lt 100) {
    throw "Decoded CSC_LINK is too small ($($bytes.Length) bytes) to be a valid PFX."
}

[IO.File]::WriteAllBytes($OutputPath, $bytes)
Write-Host "Decoded CSC_LINK base64 to: $OutputPath ($($bytes.Length) bytes)"

if ($Password) {
    & "$PSScriptRoot/assert-signing-pfx.ps1" -Path $OutputPath -Password $Password
}

Write-Output $OutputPath
