<#
.SYNOPSIS
  Build the custom installer against the stub payload (safe on a dev machine).

.DESCRIPTION
  The stub registers under HKCU\Software\com.ai-shelf.stub and never touches a real
  AI Shelf install. Use -Payload to embed a real NSIS setup instead — only run that
  build inside a VM or Windows Sandbox: it replaces the installed AI Shelf.

.EXAMPLE
  ./installer/scripts/build-dev.ps1
  ./installer/scripts/build-dev.ps1 -Release
  ./installer/scripts/build-dev.ps1 -Payload release/AI-Shelf-Setup-4.4.0.exe -Version 4.4.0 -Release
#>
param(
  [string]$Payload,
  [string]$Version = "0.0.0-dev",
  [switch]$Release
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  $profileArgs = @()
  if ($Release) { $profileArgs = @("--release") }
  $outDir = if ($Release) { "release" } else { "debug" }

  if (-not $Payload) {
    cargo build -p stub-setup --release
    if ($LASTEXITCODE -ne 0) { throw "stub-setup build failed" }
    $Payload = Join-Path $root "target/release/stub-setup.exe"
    $env:AISHELF_REGISTRY_KEY = "com.ai-shelf.stub"
    # Separate folder + exe name, so the stub never overwrites or closes a real AI Shelf.
    $env:AISHELF_APP_DIR_NAME = "AI Shelf Stub"
  } else {
    if (-not $PSBoundParameters.ContainsKey("Version")) {
      throw "-Version is required with -Payload (setup verifies the installed version against it)."
    }
    $Payload = (Resolve-Path $Payload).Path
    Remove-Item Env:AISHELF_REGISTRY_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:AISHELF_APP_DIR_NAME -ErrorAction SilentlyContinue
  }

  $env:AISHELF_PAYLOAD = $Payload
  $env:AISHELF_PAYLOAD_VERSION = $Version
  cargo build -p ai-shelf-setup @profileArgs
  if ($LASTEXITCODE -ne 0) { throw "installer build failed" }

  $exe = Join-Path $root "target/$outDir/ai-shelf-setup.exe"
  Write-Host "Built $exe (payload: $Payload, version: $Version, key: $($env:AISHELF_REGISTRY_KEY ?? 'com.ai-shelf'))"
} finally {
  Pop-Location
}
