# ArchResidenceBD v1.0.0 — Windows Desktop Release

**Release date:** 2026-10-29
**Build:** Tauri 2.12.5 · Windows x64 (Windows 10/11)
**Status:** Ready for internal distribution

## 📦 What's in this release

The complete ArchResidenceBD desktop application — your AI civil engineer for
Bangladeshi residential buildings. Everything runs locally: no internet,
no cloud, no subscription.

### Engineering features
- **4-phase design flow** — Site & Excavation, Foundation, Roof & Boundary, Common Services
- **NativeCAD 3D preview** — parametric building mesh, orbitable view, per-phase + combined master
- **BOQ by phase** — BDT 2025 PWD rates, live cost meter, unpriced-line register
- **Rebar cutting schedule** — BNBC 2020 / ACI 318 Bar Bending Schedule
- **Connection detailing** — lap lengths, anchorage, joint detailing
- **Daylight analysis** — BNBC 2020 §4.4 daylight factor per room & floor
- **Unit mix optimizer** — flat layouts with BNBC minimum room-size compliance
- **Column grid optimizer** — span / slenderness / beam-column ratio checks
- **Formwork & scaffold** — shuttering quantities per BNBC 2020
- **Pour sequence** — concrete pour ordering, curing times, logistics
- **Compliance audit** — FAR, ground coverage, setbacks, seismic zone auto-verified

### Localization
- Full **Bangla + English** interface (`বাং / EN` toggle in sidebar)
- Bengali numerals, Taka (৳) formatting, native floor naming (নিচতলা, ১ম তলা…)

### Platform
- **Windows 10/11 x64** — desktop app built on Tauri 2 + WebView2
- PWA installable in browsers (manifest + service worker)
- All computation local — projects persist in the app's storage

## 🚀 Installation

### Option A — Setup installer (recommended)
1. Run `ArchResidenceBD_1.0.0_x64-setup.exe`
2. Choose install location → Finish
3. Launch from Start menu

### Option B — MSI (enterprise / GPO deployment)
```powershell
msiexec /i ArchResidenceBD_1.0.0_x64_en-US.msi /qn
```

### Requirements
- Windows 10 21H2+ or Windows 11, x64
- WebView2 Runtime (bundled in the installer; auto-installed if absent)
- ~300 MB free disk space

## 📝 Known limitations
- First launch after install may prompt for WebView2 update (~30 s)
- NSIS installer language: English (in-app language: Bangla + English)
- AI model fleet download (Hugging Face) is a separate first-run step,
  see in-app **AI Fleet** screen

## 🔐 Integrity
SHA-256 hashes for all artifacts are in `SHA256SUMS.txt` (same folder).
Verify with:
```powershell
Get-FileHash ArchResidenceBD_1.0.0_x64-setup.exe -Algorithm SHA256
```

## 📄 License
MIT — see `LICENSE` in the repository.

## ⏮ Changelog (v1.0.0)
- Phase 1–4 core: project flow, phases, BOQ, compliance, documents
- Phase 5: daylight analysis, unit mix optimizer, column grid optimizer
- Phase 6: Windows installer tooling, Bengali i18n completion, audits
- Phase 7: Tauri 2 desktop packaging (NSIS .exe + MSI)
