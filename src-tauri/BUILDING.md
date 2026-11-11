# Building the Windows desktop app

## Prerequisites

1. **Rust** (rustup, stable, MSVC toolchain) and the **Visual Studio Build Tools** with the C++ workload.
2. **Node 20 or newer**, then `npm ci` in the repository root (the Tauri CLI is a dev dependency).
3. WebView2 comes with Windows 10/11; the installers bootstrap it if it is missing.

## Commands

| Task | Command |
|------|---------|
| Run the desktop app in dev | `npx tauri dev` (starts `npm run dev` on port 3000 for you) |
| Web build only | `npm run build` (also writes the service worker) |
| Installers | `npx tauri build --bundles nsis,msi` |

Output: `src-tauri/target/release/bundle/nsis/*.exe` (end users) and `bundle/msi/*.msi` (enterprise).

## Releases

Push a tag that matches the version in `package.json` (`git tag v2.6.0 && git push origin v2.6.0`). The **Release** workflow (`.github/workflows/release.yml`) checks types and tests, builds the web app, runs the bundle-size and offline checks, builds both installers on `windows-latest` and attaches them to a **draft** GitHub release. The workflow signs the installers when the repository secrets `WINDOWS_CERT_PFX_BASE64` and `WINDOWS_CERT_PASSWORD` are set (`sign-release.ps1` does the signing and verifies each signature); without them the build is unsigned and Windows SmartScreen warns on first run. `create-dev-cert.ps1` makes a throw-away self-signed certificate for local testing only.

## What the build enforces

- `npm run check:bundle`: first-load script 160 KB gzip, any one chunk 50 KB, all JavaScript 380 KB (screens load on demand).
- `npm run test:offline`: the service worker precaches every built file and answers offline; the manifest icons exist; the desktop CSP is set (same origin, no eval, no inline scripts); the Tauri dev URL matches `npm run dev`.
- The desktop shell does not register the service worker: the installer already contains every file.

## Customisation

- **Icon**: edit `assets/icon.svg`, then `node scripts/make-icons.mjs` (renders with Edge: the 1024 px source and the PWA icons) and `npx tauri icon assets/icon-1024.png` (the desktop set). Delete the generated `src-tauri/icons/android` and `ios` folders; only the desktop icons are used.
- **Build config and CSP**: `src-tauri/tauri.conf.json`. To try the CSP in a browser, serve the build with `node scripts/tests/serve-dist.mjs 4199 --csp`.

## Notes

- The NSIS installer is English only (Bengali is not in the default NSIS language set); the app itself is fully bilingual.
- The Rust side is a stub (`src/lib.rs`: `get_app_info`); all application logic runs in the web view.
