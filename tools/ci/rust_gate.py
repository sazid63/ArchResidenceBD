"""The Rust gate on a machine with no system toolchain (W5.1).

**Re-measured 2026-10-21:** this dev machine has **no MSVC toolchain** and **no gcc** — so
a Rust build with the default toolchain cannot link anything. But it does not need one:
Rust ships its own **GNU-hosted** toolchain, its own **rust-lld** linker and its own
**self-contained MinGW** import libraries. So the Rust gate runs here with nothing installed
and nothing elevated:

- the toolchain is the GNU one (``rustup toolchain install stable-x86_64-pc-windows-gnu``) ✓;
- the linker is ``rust-lld`` ✓;
- the C runtime and the import libraries are Rust's own (``-C link-self-contained=yes``) ✓.

What this gate covers: the **bridge crate's tests** ✓ (the channel the shell speaks ✓) and
the workspace's **formatting** ✓ — both of which need no system linker ✓ ✓.

What it does **not** cover: the **desktop bundle** (the Tauri app's compile needs the
WebView2 SDK ✗, and the app crate's own import libraries need a working ``dlltool`` ✗) —
that is checked in **CI** (on Linux ✓, where the WebView2 SDK is not needed ✓) and is the
owner's item #1 for the dev machine ✗ ✓.

    uv run --directory core python ../tools/ci/rust_gate.py
"""

from __future__ import annotations

import os
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "app" / "src-tauri" / "Cargo.toml"
GNU_TOOLCHAIN = "stable-x86_64-pc-windows-gnu"
RUSTFLAGS = "-C linker=rust-lld -C link-self-contained=yes"


def _cargo() -> str:
    """The cargo of the GNU toolchain (the one that can link without a system linker)."""
    cargo = shutil.which("cargo")
    if cargo is None:
        raise SystemExit("cargo is not on the PATH - install Rust with rustup")
    return cargo


def _gnu_toolchain_installed() -> bool:
    result = subprocess.run(
        ["rustup", "toolchain", "list"], capture_output=True, text=True
    )
    return GNU_TOOLCHAIN in result.stdout


def main(argv: list[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)

    if not _gnu_toolchain_installed():
        print(
            f"the GNU toolchain is not installed - run: rustup toolchain install {GNU_TOOLCHAIN}",
            file=sys.stderr,
        )
        return 1

    environment = dict(os.environ)
    environment["RUSTFLAGS"] = RUSTFLAGS
    cargo = _cargo()
    plus = f"+{GNU_TOOLCHAIN}"

    steps = [
        (
            "the channel's tests",
            [cargo, plus, "test", "--locked", "-p", "archres-bridge", "--manifest-path", str(MANIFEST)],
        ),
        (
            "the workspace's formatting",
            # Formatting compiles nothing, so it needs no linker - the default toolchain
            # has rustfmt, and the GNU one may not.
            [cargo, "fmt", "--check", "--manifest-path", str(MANIFEST)],
        ),
    ]
    failed = False
    for name, command in steps:
        print(f"== {name}")
        result = subprocess.run(command, env=environment, cwd=ROOT)
        if result.returncode != 0:
            failed = True

    if args.app:
        print("== the desktop shell's compile (needs the WebView2 SDK - CI's job on Linux)")
        result = subprocess.run(
            [cargo, plus, "check", "--locked", "-p", "archres-app", "--manifest-path", str(MANIFEST)],
            env=environment,
            cwd=ROOT,
        )
        if result.returncode != 0:
            failed = True

    return 1 if failed else 0


def _parser():
    import argparse

    parser = argparse.ArgumentParser(
        description="The Rust gate (the channel's tests and the formatting) on this machine."
    )
    parser.add_argument(
        "--app",
        action="store_true",
        help="also compile the desktop app crate (needs the WebView2 SDK)",
    )
    return parser


if __name__ == "__main__":
    raise SystemExit(main())
