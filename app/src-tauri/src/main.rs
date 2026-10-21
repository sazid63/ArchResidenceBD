// The desktop shell's entry point (W5.1).
//
// The engine's name belongs in the licence notice, never in the branding (ADR-0004) -
// nothing here names a bundled component.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    archres_app_lib::run()
}
