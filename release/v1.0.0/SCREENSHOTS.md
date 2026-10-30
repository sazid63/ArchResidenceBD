# Screenshot Guide — ArchResidenceBD v1.0.0

## 📸 **Screenshots included in this release**

| Screenshot | Description |
|------------|-------------|
| **app-shell.png** | Main window with sidebar collapsed, header, and active screen (design:final) |
| **sidebar-expanded.png** | Full sidebar with 16 navigation items (phases, design, BOQ, assets, compliance, formwork, pour, rebar, connections, daylight, unit-mix, column-grid, documents, fleet, windows, units) |
| **design-phase.png** | Phase Chat Screen with AI (Bengali/English) |
| **design-final.png** | NativeCAD 3D viewport with parametric building mesh, model tree, parameter panel |
| **boq-screen.png** | BOQ screen with phase tabs, cost meter, unpriced lines table |
| **compliance-screen.png** | Compliance audit report with deviation register, FAR, setback, height limits |
| **daylight-screen.png** | Daylight Analysis per room, floor summary, perforation ratio, compliance rate |
| **unit-mix-screen.png** | Unit Mix Optimizer with room-size validation, efficiency score, target mix slider |
| **column-grid-screen.png** | Column Grid Optimizer with span/slenderness/beam-column checks, grid config selector |
| **windows-installer-screen.png** | Windows Installer Screen with Inno Setup script, PowerShell build script, download buttons |
| **pwa-install-prompt.png** | PWA install prompt (bottom-right) for browser users |
| **bengali-toggle.png** | Language toggle (বাং / EN) in sidebar footer |

## 📁 **Screenshot files location**

Screenshots should be placed in `release/v1.0.0/screenshots/` and follow the naming convention above.

## 🎨 **Visual design notes**

- **Theme:** Light (default), Dark, High Contrast (toggled via ☾/⬤/☀)
- **Language:** Bangla (`বাং`) and English (`EN`) toggle in sidebar footer
- **Currency:** Taka (৳) with Bengali numerals option
- **Floor labels:** إن�جليزيإن�جليزيإن�جليزيإن�جليزي إن�جليزي إن�جليزيإن�جليزي إن�جليزيإن�جليزيإن (Ground Floor) for EN, `(নিচতলা, ১ম তলা, ২য় তলা…)` for BN
- **Cost formatting:** `৳ ১,২৩,৪৫,৬৭৮` (Bengali) / `৳ 1,23,45,678` (English) — note: 1 lakh = 100,000
- **Density:** Compact UI, 16px base font, 4px grid

## 🖼 **How to capture (if needed)**

```bash
# Using native Windows tools:
Win + Shift + S  # Snip & Sketch
# Or: PrintScreen → Paint → Save

# Save as:
app-shell.png
sidebar-expanded.png
design-phase.png
# etc.
```

## ⚠️ **Release asset note**

Screenshots are *not* bundled with the installer. They are release documentation only.
