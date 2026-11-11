#!/usr/bin/env pwsh
# Code-signing script for the ArchResidenceBD Windows installers.
# Requires the Windows SDK (signtool.exe) and a code-signing certificate in the current user's store.
# Signs every installer it finds (the version is not part of the name), then verifies each signature.
# Used by .github/workflows/release.yml when the certificate secrets are set, and locally:
#   .\src-tauri\sign-release.ps1 -CertificateThumbprint <thumbprint>

param(
    [Parameter(Mandatory = $true)]
    [string]$CertificateThumbprint,

    [Parameter(Mandatory = $false)]
    [string]$TimestampServer = "http://timestamp.digicert.com",

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = "src-tauri\target\release\bundle"
)

$ErrorActionPreference = "Stop"

# Locate signtool.exe: the newest one under the Windows SDK, then the older fixed paths.
$signtool = $null
$sdk = "C:\Program Files (x86)\Windows Kits\10\bin"
if (Test-Path $sdk) {
    $signtool = Get-ChildItem -Path $sdk -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -match "\\x64\\" } |
        Sort-Object FullName -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $signtool) {
    foreach ($path in @("C:\Program Files (x86)\Windows Kits\8.1\bin\x64\signtool.exe", "C:\Program Files (x86)\Microsoft SDKs\Windows\v7.1A\Bin\signtool.exe")) {
        if (Test-Path $path) { $signtool = $path; break }
    }
}
if (-not $signtool) {
    Write-Error "signtool.exe not found. Install the Windows SDK: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/"
    exit 1
}
Write-Host "Using signtool: $signtool" -ForegroundColor Cyan

$files = @()
$files += Get-ChildItem -Path (Join-Path $OutputDir "nsis") -Filter "*.exe" -ErrorAction SilentlyContinue
$files += Get-ChildItem -Path (Join-Path $OutputDir "msi") -Filter "*.msi" -ErrorAction SilentlyContinue
if ($files.Count -eq 0) {
    Write-Error "No installers found under $OutputDir (build them first: npx tauri build --bundles nsis,msi)"
    exit 1
}

foreach ($file in $files) {
    Write-Host "Signing: $($file.FullName)" -ForegroundColor Yellow
    & $signtool sign /fd SHA256 /tr $TimestampServer /td SHA256 /sha1 $CertificateThumbprint /v $file.FullName
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Signing failed for $($file.FullName)"
        exit 1
    }
    & $signtool verify /pa $file.FullName
    if ($LASTEXITCODE -ne 0) {
        Write-Error "The signature on $($file.FullName) did not verify"
        exit 1
    }
    Write-Host "  signed and verified" -ForegroundColor Green
}

Write-Host "`nCode-signing complete." -ForegroundColor Green
