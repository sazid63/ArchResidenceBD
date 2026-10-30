#!/usr/bin/env pwsh
# Code-signing script for ArchResidenceBD Windows installers
# Requires: Windows SDK (signtool.exe) + valid code-signing certificate

param(
    [Parameter(Mandatory=$true)]
    [string]$CertificateThumbprint,
    
    [Parameter(Mandatory=$false)]
    [string]$TimestampServer = "http://timestamp.digicert.com",
    
    [Parameter(Mandatory=$false)]
    [string]$OutputDir = "target\x86_64-pc-windows-msvc\release\bundle"
)

$ErrorActionPreference = "Stop"

# Locate signtool.exe (Windows SDK)
$signtoolPaths = @(
    "C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe",
    "C:\Program Files (x86)\Windows Kits\8.1\bin\x64\signtool.exe",
    "C:\Program Files (x86)\Microsoft SDKs\Windows\v7.1A\Bin\signtool.exe"
)

$signtool = $null
foreach ($path in $signtoolPaths) {
    if (Test-Path $path) {
        $signtool = $path
        break
    }
}

if (-not $signtool) {
    Write-Error "signtool.exe not found. Install Windows SDK from: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/"
    exit 1
}

Write-Host "Using signtool: $signtool" -ForegroundColor Cyan

# Files to sign
$filesToSign = @(
    (Join-Path $OutputDir "nsis\ArchResidenceBD_1.0.0_x64-setup.exe"),
    (Join-Path $OutputDir "msi\ArchResidenceBD_1.0.0_x64_en-US.msi"),
    (Join-Path $OutputDir "archresidencebd.exe")
)

foreach ($file in $filesToSign) {
    if (Test-Path $file) {
        Write-Host "Signing: $file" -ForegroundColor Yellow
        
        & $signtool sign `
            /fd SHA256 `
            /tr $TimestampServer `
            /td SHA256 `
            /sha1 $CertificateThumbprint `
            /v $file
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Signed successfully" -ForegroundColor Green
        } else {
            Write-Error "  ✗ Signing failed for $file"
            exit 1
        }
    } else {
        Write-Warning "File not found: $file (skipping)"
    }
}

Write-Host "`nCode-signing complete!" -ForegroundColor Green
Write-Host "To verify: signtool verify /pa /v <file>" -ForegroundColor Cyan
