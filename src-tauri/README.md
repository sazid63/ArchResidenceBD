# ArchResidenceBD — Desktop Packaging

## Tauri Build Setup (Windows .msi / .nsis .exe)

### Prerequisites

1. **Rust toolchain** (`rustup`)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **Tauri CLI** (global or as devDependency)
   ```bash
   npm install -D @tauri-apps/cli
   ```

3. **WebView2 Runtime** — bundled via NSIS installer; end users get it automatically.

4. **Build tools** (Windows):
   - Visual Studio C++ Build Tools
   - Windows SDK 10.0.18362.0 or later
   - Inno Setup 6 (optional, for custom NSIS)

### Build commands

| Task | Command |
|------|---------|
| Dev server (frontend) | `npm run dev` |
| Production build (Vite) | `npm run build` |
| Tauri dev (with hot reload) | `npx tauri dev` |
| Tauri build (Windows) | `npx tauri build --target x86_64-pc-windows-msvc` |

### Output

```
src-tauri\target\release\bundle\
├── msi\ArchResidenceBD_1.0.0_x64.msi          (Enterprise deploy)
├── nsis\ArchResidenceBD_1.0.0_x64-setup.exe    (End-user single-click)
└── portable\ArchResidenceBD_1.0.0_x64.zip      (Zip for extraction-only)
```

### Installer behavior

- **single .exe** via NSIS `oneClick: false`, `allowToChangeInstallationDirectory: true`
- Embedded Python 3.11 runtime in `src-tauri\bundle-resources\runtime\`
- AI models in `src-tauri\bundle-resources\models\` (downloaded from HuggingFace)
- NativeCAD engine in `src-tauri\bundle-resources\bin\nativecad\`
- PWD rates database in `src-tauri\bundle-resources\data\`

### Updating the build scripts

If the Vite build command changes, update `tauri.conf.json` → `build.beforeBuildCommand`.
