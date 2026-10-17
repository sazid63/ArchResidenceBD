# S1 — shell spike scripts (Tauri vs Electron)

Evidence: `docs/spikes/S1-shell.md` · decision: `docs/adr/0005-desktop-shell-tauri.md`.

- `measure.ps1` — launches an exe, polls every 40 ms until any process in its
  tree owns a top-level window, waits 4 s (settle), sums the working set of the
  whole process tree, prints one line, kills the tree:

```
./measure.ps1 -Exe .\tauri-hello\src-tauri\target\release\s1-hello.exe -Name tauri
./measure.ps1 -Exe .\electron-hello\node_modules\electron\dist\electron.exe -Name electron -ArgumentLine "." -WorkDir .\electron-hello
```

- `make_icon.py` — minimal valid 32×32 `.ico`; `tauri-build` requires
  `src-tauri/icons/icon.ico` for the Windows resource file (not in the repo).

Scaffolds live in `data/spikes/s1/` (gitignored): `tauri-hello/` (Tauri 2,
static frontend) and `electron-hello/` (Electron 44).

GNU-toolchain build recipe (fallback; canonical is MSVC once Build Tools are
installed — owner list): PATH += `<mingw>/mingw64/bin` + `%USERPROFILE%\.cargo\bin`,
then in `data/spikes/s1/tauri-hello/src-tauri`:

```
cargo +stable-x86_64-pc-windows-gnu build --release
# binary: src-tauri/target/release/s1-hello.exe
```
