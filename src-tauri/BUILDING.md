# Building the Windows Desktop App

## Prerequisites

1. **Rust toolchain** (via rustup)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   rustup default stable-x86_64-pc-windows-msvc
   ```

2. **Tauri CLI**
   ```bash
   npm install -D @tauri-apps/cli@^2
   ```

3. **Visual Studio Build Tools** (with C++ workload)
   - [Download Build Tools](https://visualstudio.microsoft.com/downloads/)

4. **WebView2 Runtime** — automatically bundled with NSIS installer

## Build Commands

| Task | Command |
|------|---------|
| Dev mode (hot reload) | `npx tauri dev` |
| Production build (Vite) | `npm run build` |
| Tauri production build | `npx tauri build --target x86_64-pc-windows-msvc` |
| MS only | `npx tauri build --target x86_64-pc-windows-msvc --bundle msi` |
| NSIS only | `npx tauri build --target x86_64-pc-windows-msvc --bundle nsis` |

## Output

```
src-tauri/target/x86_64-pc-windows-msvc/debug/bundle/
├── msi/ArchResidenceBD_1.0.0_x64_en-US.msi        (Enterprise)
├── nsis/ArchResidenceBD_1.0.0_x64-setup.exe        (End-user)
└── portable/ArchResidenceBD_1.0.0_x64.zip          (Extractable)
```

## Architecture

- **Frontend**: Vite + React + TypeScript (builds to `dist/`)
- **Runtime**: Tauri 2 + WebView2 (Windows 10/11)
- **Rust**: Core logic, file I/O, process management
- **Installer**: NSIS (single .exe) + MSI (enterprise)

## Customization

- **App icon**: `src-tauri/icons/` (32/128/256px PNG + ICO + ICNS)
- **Build config**: `src-tauri/tauri.conf.json`
- **Bundle resources**: Add to `src-tauri/tauri.conf.json > bundle > resources`
- **External binaries**: `src-tauri/tauri.conf.json > bundle > externalBin`

## Notes

- The NSIS installer uses English only (Bengali language file not in default NSIS distribution)
- The app itself supports full Bengali i18n via `src/i18n.tsx`
- Vite's `build.chunkSizeWarningLimit` is left at default; main bundle is 708kB (gzip 200kB) — acceptable for desktop