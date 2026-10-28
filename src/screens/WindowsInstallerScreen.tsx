import { useState } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Callout, Card, PageHeader } from "../ui/kit";

const INNO_SETUP_SCRIPT = `; ArchResidenceBD — Inno Setup 6 Script
; Generates a single standalone ArchResidenceBD-Setup-v1.0.exe installer for Windows 10/11 x64

#define MyAppName "ArchResidenceBD"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Sazid Hossain"
#define MyAppURL "https://github.com/sazid63/ArchResidenceBD"
#define MyAppExeName "ArchResidenceBD.exe"

[Setup]
AppId={{5E4B2819-3A0F-4D02-9842-ARCHRESBD2026}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\\{#MyAppName}
DisableProgramGroupPage=yes
LicenseFile=LICENSE
OutputDir=dist-installer
OutputBaseFilename=ArchResidenceBD-Setup-v1.0
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; 1. Tauri Frontend Desktop Application Executable
Source: "src-tauri\\target\\release\\ArchResidenceBD.exe"; DestDir: "{app}"; Flags: ignoreversion

; 2. Embedded Python Core Engine Runtime
Source: "runtime\\python\\*"; DestDir: "{app}\\runtime\\python"; Flags: ignoreversion recursesubdirs createallsubdirs

; 3. NativeCAD Engine (FreeCAD Headless CAD Runtime)
Source: "bin\\nativecad\\*"; DestDir: "{app}\\bin\\nativecad"; Flags: ignoreversion recursesubdirs createallsubdirs

; 4. llama.cpp Server (GPU/CPU Local Inference Engine)
Source: "bin\\llama\\*"; DestDir: "{app}\\bin\\llama"; Flags: ignoreversion recursesubdirs createallsubdirs

; 5. Bundled Fine-tuned AI Fleet (Hugging Face GGUF weights)
Source: "models\\*.gguf"; DestDir: "{app}\\models"; Flags: ignoreversion

; 6. Specifications, Flow Books & PWD Rates Database
Source: "data\\*"; DestDir: "{app}\\data"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\\{#MyAppName}"; Filename: "{app}\\{#MyAppExeName}"
Name: "{autodesktop}\\{#MyAppName}"; Filename: "{app}\\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
`;

const POWERSHELL_BUILD_SCRIPT = `# build-windows-installer.ps1
# Automates compiling the desktop frontend, pulling models, and creating ArchResidenceBD-Setup.exe

Write-Host "=== ArchResidenceBD Windows Installer Builder ===" -ForegroundColor Cyan

# 1. Check Pre-requisites
$innoPath = "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe"
if (-not (Test-Path $innoPath)) {
    Write-Warning "Inno Setup 6 compiler not found at standard path. Please install Inno Setup 6."
}

# 2. Build Tauri Desktop Frontend
Write-Host "Building Tauri Windows Application..." -ForegroundColor Yellow
npm run build
npm run tauri build

# 3. Download AI Fleet from Hugging Face if not present
Write-Host "Verifying Hugging Face Model Fleet in models/ ..." -ForegroundColor Yellow
if (-not (Test-Path "models\\archie-chat-v0-Q4_K_M.gguf")) {
    Write-Host "Downloading models from sazid63/archresidencebd-models..."
    huggingface-cli download sazid63/archresidencebd-models --local-dir models/
}

# 4. Compile Inno Setup Script
Write-Host "Compiling standalone Windows Setup .exe..." -ForegroundColor Green
& "$innoPath" "ArchResidenceBD-Setup.iss"

Write-Host "SUCCESS! Setup installer generated in dist-installer\\ArchResidenceBD-Setup-v1.0.exe" -ForegroundColor Green
`;

export function WindowsInstallerScreen() {
  const { t } = useI18n();
  const [copiedIss, setCopiedIss] = useState(false);
  const [copiedPs, setCopiedPs] = useState(false);

  const downloadIssFile = () => {
    const blob = new Blob([INNO_SETUP_SCRIPT], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ArchResidenceBD-Setup.iss";
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyIss = () => {
    navigator.clipboard.writeText(INNO_SETUP_SCRIPT);
    setCopiedIss(true);
    setTimeout(() => setCopiedIss(false), 2000);
  };

  const copyPs = () => {
    navigator.clipboard.writeText(POWERSHELL_BUILD_SCRIPT);
    setCopiedPs(true);
    setTimeout(() => setCopiedPs(false), 2000);
  };

  return (
    <div className="screen">
      <PageHeader
        title={t("windowsTitle")}
        subtitle={t("windowsSubtitle")}
        actions={
          <Button variant="primary" onClick={downloadIssFile}>
            Download ArchResidenceBD-Setup.iss
          </Button>
        }
      />

      <Callout title="All-In-One Windows Installation Bundle">
        <span>
          When users run <code>ArchResidenceBD-Setup-v1.0.exe</code>, everything needed is installed:
          the Windows Desktop App, the 4 local Hugging Face AI models, the NativeCAD FreeCAD engine, and the PWD
          rates database. No terminal, Python install, or localhost setup is ever needed by the end user.
        </span>
      </Callout>

      <div className="grid-2">
        <div className="stack">
          <Card className="stack">
            <h3>Installation Package Manifest</h3>
            <div className="stack" style={{ gap: "8px" }}>
              <div className="row-between">
                <span>ArchResidenceBD Desktop GUI</span>
                <Badge tone="sage">Tauri / WebView2 (~15 MB)</Badge>
              </div>
              <div className="row-between">
                <span>Embedded Python Civil Engine</span>
                <Badge tone="sky">Standalone Python 3.11 (~48 MB)</Badge>
              </div>
              <div className="row-between">
                <span>NativeCAD FreeCAD 3D Kernel</span>
                <Badge tone="sky">Portable Headless (~180 MB)</Badge>
              </div>
              <div className="row-between">
                <span>llama.cpp Multi-Model Runner</span>
                <Badge tone="neutral">CUDA / AVX2 (~35 MB)</Badge>
              </div>
              <div className="row-between">
                <span>4 Fine-Tuned GGUF AI Models</span>
                <Badge tone="amber">Hugging Face Fleet (~6.04 GB)</Badge>
              </div>
              <div className="row-between">
                <span>BNBC 2020 & PWD Rates Data</span>
                <Badge tone="neutral">JSON Corpus (~12 MB)</Badge>
              </div>
            </div>

            <div
              style={{
                marginTop: "12px",
                paddingTop: "12px",
                borderTop: "1px solid var(--border)",
              }}
              className="row-between"
            >
              <strong>Total Bundled Setup Size:</strong>
              <strong className="font-mono">~6.33 GB</strong>
            </div>
          </Card>

          <Card className="stack">
            <div className="row-between">
              <h3>Automated Build Script (PowerShell)</h3>
              <Button variant="soft" onClick={copyPs}>
                {copiedPs ? "✓ Copied" : "Copy Script"}
              </Button>
            </div>
            <pre
              style={{
                background: "var(--surface-sunken)",
                padding: "12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontFamily: "var(--font-mono)",
                whiteSpace: "pre-wrap",
                overflowX: "auto",
                maxHeight: "260px",
              }}
            >
              {POWERSHELL_BUILD_SCRIPT}
            </pre>
          </Card>
        </div>

        <div className="stack">
          <Card className="stack">
            <div className="row-between">
              <h3>Inno Setup 6 Script (ArchResidenceBD-Setup.iss)</h3>
              <div className="row">
                <Button variant="soft" onClick={copyIss}>
                  {copiedIss ? "✓ Copied" : "Copy"}
                </Button>
                <Button variant="primary" onClick={downloadIssFile}>
                  Download .iss
                </Button>
              </div>
            </div>
            <pre
              style={{
                background: "var(--surface-sunken)",
                padding: "12px",
                borderRadius: "6px",
                fontSize: "12px",
                fontFamily: "var(--font-mono)",
                whiteSpace: "pre-wrap",
                overflowX: "auto",
                maxHeight: "520px",
              }}
            >
              {INNO_SETUP_SCRIPT}
            </pre>
          </Card>
        </div>
      </div>
    </div>
  );
}
