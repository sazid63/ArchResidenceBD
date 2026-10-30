#!/usr/bin/env pwsh
# Create a self-signed code-signing certificate for DEVELOPMENT/TESTING ONLY
# NOT VALID FOR PUBLIC DISTRIBUTION - use a commercial CA for production

$ErrorActionPreference = "Stop"

$certSubject = "CN=ArchResidenceBD Development, O=ArchResidenceBD, C=BD"
$certPath = "src-tauri\dev-certificate.pfx"
$certPassword = "DevTestOnly123!" # Change for production!

Write-Host "Creating self-signed code-signing certificate..." -ForegroundColor Cyan
Write-Warning "This certificate is for DEVELOPMENT ONLY. Do not use for public distribution."

# Create self-signed cert
$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $certSubject `
    -KeyUsage DigitalSignature `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -CertStoreLocation "Cert:\CurrentUser\My"

Write-Host "Certificate created: $($cert.Thumbprint)" -ForegroundColor Green
Write-Host "Subject: $($cert.Subject)" -ForegroundColor Green

# Export to PFX
$securePassword = ConvertTo-SecureString -String $certPassword -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $certPath -Password $securePassword

Write-Host "`nCertificate exported to: $certPath" -ForegroundColor Green
Write-Host "Password: $certPassword" -ForegroundColor Yellow
Write-Warning "Store the PFX securely. Delete after testing if not needed."

Write-Host "`nTo use for signing:" -ForegroundColor Cyan
Write-Host "  .\src-tauri\sign-release.ps1 -CertificateThumbprint $($cert.Thumbprint)" -ForegroundColor White

Write-Host "`nTo install in Trusted Root (for local testing only):" -ForegroundColor Cyan
Write-Host "  Import-PfxCertificate -FilePath $certPath -CertStoreLocation Cert:\LocalMachine\Root -Password (ConvertTo-SecureString -String '$certPassword' -Force -AsPlainText)" -ForegroundColor White