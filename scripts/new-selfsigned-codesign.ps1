#Requires -Version 5.1
param(
    [string]$OutputPath,
    [string]$Password = "ai-shelf-selfsign",
    [switch]$ForCi
)

$ErrorActionPreference = 'Stop'

if (-not $OutputPath) {
    if ($env:RUNNER_TEMP) {
        $OutputPath = Join-Path $env:RUNNER_TEMP "ai-shelf-codesign.pfx"
    } else {
        $OutputPath = Join-Path (Get-Location) ".codesign/ai-shelf-selfsign.pfx"
        New-Item -ItemType Directory -Force -Path (Split-Path $OutputPath) | Out-Null
    }
}

if (Test-Path -LiteralPath $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force
}

$securePassword = ConvertTo-SecureString -String $Password -Force -AsPlainText

$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject "CN=AI Shelf (Self-Signed), O=AI Shelf" `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -NotAfter (Get-Date).AddYears(5) `
    -CertStoreLocation "Cert:\CurrentUser\My"

Export-PfxCertificate -Cert $cert -FilePath $OutputPath -Password $securePassword | Out-Null

Write-Host "Self-signed code signing certificate exported: $OutputPath"
Write-Host "Publisher: $($cert.Subject)"
Write-Host "SmartScreen: self-signed certs are not trusted — users may still see warnings."

if ($ForCi) {
    if (-not $env:GITHUB_ENV) {
        throw "GITHUB_ENV is not set; use -ForCi only in GitHub Actions."
    }
    Add-Content -Path $env:GITHUB_ENV -Value "CSC_LINK=$OutputPath"
    & "$PSScriptRoot/write-csc-password-file.ps1" -Password $Password
}
