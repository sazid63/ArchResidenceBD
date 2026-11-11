#!/usr/bin/env pwsh
# Create a self-signed code-signing certificate for DEVELOPMENT/TESTING ONLY.
# NOT VALID FOR PUBLIC DISTRIBUTION: buy a certificate from a commercial CA (or use Azure Trusted Signing) for releases.
# The password is random each run and is printed once; the PFX is written under src-tauri\ and ignored by git.

$ErrorActionPreference = "Stop"

$certSubject = "CN=ArchResidenceBD Development, O=ArchResidenceBD, C=BD"
$certPath = "src-tauri\dev-certificate.pfx"

# A random password (24 characters), never a fixed one.
$bytes = New-Object byte[] 18
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$certPassword = [Convert]::ToBase64String($bytes)

Write-Host "Creating self-signed code-signing certificate..." -ForegroundColor Cyan
Write-Warning "This certificate is for DEVELOPMENT ONLY. Do not use it for public distribution."

$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $certSubject `
    -KeyUsage DigitalSignature `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -CertStoreLocation "Cert:\CurrentUser\My"

Write-Host "Certificate created: $($cert.Thumbprint)" -ForegroundColor Green

$securePassword = ConvertTo-SecureString -String $certPassword -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $certPath -Password $securePassword | Out-Null

Write-Host "`nCertificate exported to: $certPath" -ForegroundColor Green
Write-Host "PFX password (shown once, not saved): $certPassword" -ForegroundColor Yellow
Write-Warning "Delete the PFX after testing."

Write-Host "`nTo sign a local build with it:" -ForegroundColor Cyan
Write-Host "  .\src-tauri\sign-release.ps1 -CertificateThumbprint $($cert.Thumbprint)" -ForegroundColor White
