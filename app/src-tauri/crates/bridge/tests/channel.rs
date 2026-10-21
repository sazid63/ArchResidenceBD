//! The channel, end to end: the Rust side spawning the **real** core.
//!
//! The Python side of the channel is proven by the core's own tests ✓ and the Rust side by
//! this crate's unit tests ✓ — but nothing proved the two **together** ✓, and the two
//! together are the product ✓ (the shell talks to the core ✓).
//!
//! So this test spawns the core ✓ and speaks to it ✓ — the same call the Tauri command
//! makes ✓ — and it checks the two things that break silently: an **error** comes back as
//! an envelope ✓ (not a dead channel ✓), and the **channel survives** a bad request ✓ ✓.

use std::path::PathBuf;
use std::process::Command;

use archres_bridge::{Bridge, Request};

/// The repository's root (the test runs from the crate's directory ✓).
fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..")
}

/// The Python that runs the core ✓ — the interpreter on this machine ✓ ✓.
///
/// The name differs by machine ✓ (Windows says `python` ✓, Linux says `python3` ✓), so
/// the first one that exists is used ✓ — and `ARCHRES_PYTHON` overrides both ✓ ✓.
fn python() -> String {
    if let Ok(python) = std::env::var("ARCHRES_PYTHON") {
        return python;
    }
    for name in ["python3", "python"] {
        let found = Command::new(name)
            .arg("--version")
            .output()
            .map(|out| out.status.success())
            .unwrap_or(false);
        if found {
            return name.to_string();
        }
    }
    "python".to_string()
}

/// Is there a core to talk to ✓?
///
/// A machine that cannot run the core **cannot verify the channel** ✓ — and the channel is
/// the product ✓ — so this **fails** rather than skipping ✓: a skipped test is a silent
/// gap ✓, and the repo's law is that there are no silent gaps ✓ ✓.
fn core_available() -> Result<(), String> {
    let source = repo_root().join("core").join("src");
    let output = Command::new(python())
        .arg("-c")
        .arg("import archres_core.bridge")
        .env("PYTHONPATH", &source)
        .output()
        .map_err(|error| format!("python could not be run: {error}"))?;
    if output.status.success() {
        return Ok(());
    }
    Err(format!(
        "the core could not be imported ({}): {}",
        python(),
        String::from_utf8_lossy(&output.stderr).trim()
    ))
}

/// The core, or a clear failure ✓ ✓ — and the failure says **why** ✓ ✓.
fn core_or_fail() {
    if let Err(reason) = core_available() {
        panic!(
            "{reason} - the channel cannot be verified, and a skipped test is a silent gap. \
             Install Python and the core's dependencies, or set ARCHRES_PYTHON."
        );
    }
}

#[test]
fn the_channel_carries_a_ping_to_the_real_core() {
    core_or_fail();
    let mut bridge = Bridge::start(&python(), &repo_root()).expect("the core starts");
    let reply = bridge.ping().expect("the core answers");
    assert!(
        reply.is_ok(),
        "the ping came back as an error: {:?}",
        reply.error
    );
    let result = reply.unwrap_result().expect("the ping has a result");
    assert_eq!(result["name"], "archres-core");
    assert_eq!(result["protocolVersion"], "0.1.0");
    bridge.shutdown().expect("the core stops");
}

#[test]
fn an_unknown_method_comes_back_as_an_error_and_the_channel_survives() {
    core_or_fail();
    let mut bridge = Bridge::start(&python(), &repo_root()).expect("the core starts");

    let bad = bridge
        .call(&Request::new("r1", "nope"))
        .expect("the core answers");
    assert!(
        !bad.is_ok(),
        "an unknown method must not look like a success"
    );
    let error = bad.error.expect("the error is there");
    assert_eq!(error.code, "invalid_params");
    assert!(error.message.contains("nope"), "the error names the method");

    // the channel is still alive ✓
    let good = bridge.ping().expect("the core still answers");
    assert!(good.is_ok());
    bridge.shutdown().expect("the core stops");
}

#[test]
fn a_malformed_line_is_an_error_and_the_channel_survives() {
    core_or_fail();
    let mut bridge = Bridge::start(&python(), &repo_root()).expect("the core starts");
    // a line that is not JSON at all ✓ - the core answers with an envelope ✓ ✓
    let raw = bridge
        .call_raw("this is not json\n")
        .expect("the core answers");
    let reply: serde_json::Value =
        serde_json::from_str(raw.trim()).expect("the core's answer is JSON");
    assert_eq!(reply["error"]["code"], "invalid_params");

    let good = bridge.ping().expect("the core still answers");
    assert!(good.is_ok());
    bridge.shutdown().expect("the core stops");
}
