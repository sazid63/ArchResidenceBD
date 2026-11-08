/**
 * The app version. package.json is the only place it is written down: Vite and Vitest inject it
 * as `__APP_VERSION__`, Tauri reads it via `"version": "../package.json"`, and
 * tests/version.test.ts fails if Cargo.toml or the README drift from it.
 */
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
