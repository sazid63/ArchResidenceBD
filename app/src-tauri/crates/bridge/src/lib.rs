//! The channel the desktop shell speaks to the core (W5.1).
//!
//! The core is a sidecar: the shell spawns it and talks to it over **stdio, one JSON
//! object per line**. There is no socket, no port and no discovery - the shell already
//! knows the process it started.
//!
//! The framing is the whole contract, and it is deliberately small:
//!
//! - a **request** is `{"id", "method", "params"}`;
//! - a **response** is `{"id", "result"}` or `{"id", "error": {"code", "message"}}`;
//! - the **error codes** are the job protocol's frozen ones, so the app speaks one
//!   vocabulary (`invalid_params`, `internal`, `timeout`, ...).
//!
//! This crate carries no Tauri dependency on purpose: the channel is testable on its own,
//! and the Tauri glue is a thin layer on top of it.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The channel's version - the shell checks it before it trusts the core.
pub const PROTOCOL_VERSION: &str = "0.1.0";

/// A request: one method, one id.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Request {
    /// The shell's id for this request; the response echoes it.
    pub id: String,
    /// The method to call (`ping`, `version`, `session.respond`, ...).
    pub method: String,
    /// The method's parameters.
    #[serde(default)]
    pub params: Value,
}

impl Request {
    /// A request with no parameters.
    pub fn new(id: impl Into<String>, method: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            method: method.into(),
            params: Value::Object(serde_json::Map::new()),
        }
    }

    /// A request with parameters.
    pub fn with_params(id: impl Into<String>, method: impl Into<String>, params: Value) -> Self {
        Self {
            id: id.into(),
            method: method.into(),
            params,
        }
    }
}

/// An error the core reported.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BridgeError {
    /// The frozen error code (`invalid_params`, `internal`, `timeout`, ...).
    pub code: String,
    /// What went wrong, in words a person can read.
    pub message: String,
}

/// A response: exactly one of `result` and `error`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Response {
    /// The request's id, echoed.
    pub id: String,
    /// The result, when the call succeeded.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    /// The error, when it did not.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<BridgeError>,
}

impl Response {
    /// Whether the call succeeded.
    pub fn is_ok(&self) -> bool {
        self.error.is_none()
    }

    /// The result, or the error's message - never a panic on a missing field.
    pub fn unwrap_result(&self) -> Result<&Value, String> {
        match (&self.result, &self.error) {
            (Some(value), _) => Ok(value),
            (None, Some(error)) => Err(format!("{}: {}", error.code, error.message)),
            (None, None) => Err("the core sent neither a result nor an error".to_string()),
        }
    }
}

/// The core, as a running sidecar.
pub struct Bridge {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    counter: u64,
}

impl Bridge {
    /// Start the core as a sidecar.
    ///
    /// `python` is the interpreter that runs the core (the installer's job is to point this
    /// at the bundled runtime), and `root` is the install root the core reads from. When the
    /// root carries the core's sources (`core/src`), that path is put on `PYTHONPATH` so the
    /// dev tree runs without an install.
    pub fn start(python: &str, root: &std::path::Path) -> std::io::Result<Self> {
        let mut command = Command::new(python);
        command
            .arg("-m")
            .arg("archres_core.bridge")
            .arg("--root")
            .arg(root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());
        let mut sources = root.join("runtime").join("core");
        if !sources.is_dir() {
            // the dev tree: the core sits in the repo, not in an install folder
            let dev = root.join("core").join("src");
            if dev.is_dir() {
                sources = dev;
            }
        }
        if sources.is_dir() {
            if let Ok(existing) = std::env::var("PYTHONPATH") {
                if !existing.is_empty() {
                    command.env("PYTHONPATH", format!("{};{}", sources.display(), existing));
                }
            } else {
                command.env("PYTHONPATH", sources.display().to_string());
            }
        }
        let mut child = command.spawn()?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| std::io::Error::other("the core's stdin was not piped"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| std::io::Error::other("the core's stdout was not piped"))?;
        Ok(Self {
            child,
            stdin: Some(stdin),
            stdout: BufReader::new(stdout),
            counter: 0,
        })
    }

    /// The next request id (`r1`, `r2`, ...).
    pub fn next_id(&mut self) -> String {
        self.counter += 1;
        format!("r{}", self.counter)
    }

    /// Send a request and read its response.
    ///
    /// A line that is not JSON is an error the caller sees, not a panic: the channel's
    /// contract is that a bad line never takes the shell down.
    pub fn call(&mut self, request: &Request) -> std::io::Result<Response> {
        let mut line = serde_json::to_string(request).map_err(|error| {
            std::io::Error::other(format!("the request did not serialise: {error}"))
        })?;
        line.push('\n');
        let stdin = self
            .stdin
            .as_mut()
            .ok_or_else(|| std::io::Error::other("the core's stdin is closed"))?;
        stdin.write_all(line.as_bytes())?;
        stdin.flush()?;
        let mut answer = String::new();
        let read = self.stdout.read_line(&mut answer)?;
        if read == 0 {
            return Err(std::io::Error::other("the core closed the channel"));
        }
        serde_json::from_str(answer.trim()).map_err(|error| {
            std::io::Error::other(format!("the core's answer was not JSON: {error}"))
        })
    }

    /// Ask the core whether it is alive.
    pub fn ping(&mut self) -> std::io::Result<Response> {
        let request = Request::new(self.next_id(), "ping");
        self.call(&request)
    }

    /// The core's versions.
    pub fn version(&mut self) -> std::io::Result<Response> {
        let request = Request::new(self.next_id(), "version");
        self.call(&request)
    }

    /// Close the channel and wait for the core to exit.
    ///
    /// Dropping the pipe is the signal: the core reads EOF and returns ✓.
    pub fn shutdown(&mut self) -> std::io::Result<()> {
        self.stdin = None;
        let _ = self.child.wait();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_request_carries_its_id_method_and_params() {
        let request =
            Request::with_params("r7", "session.respond", serde_json::json!({"text": "hi"}));
        let text = serde_json::to_string(&request).expect("the request serialises");
        assert!(text.contains("\"id\":\"r7\""));
        assert!(text.contains("\"method\":\"session.respond\""));
        assert!(!text.contains('\n'), "a request is one line");
    }

    #[test]
    fn a_request_without_params_still_has_the_field() {
        let request = Request::new("r1", "ping");
        let value: Value = serde_json::from_str(&serde_json::to_string(&request).unwrap()).unwrap();
        assert!(value["params"].is_object());
    }

    #[test]
    fn a_response_is_either_a_result_or_an_error() {
        let ok: Response =
            serde_json::from_str(r#"{"id":"r1","result":{"name":"archres-core"}}"#).unwrap();
        assert!(ok.is_ok());
        assert_eq!(ok.unwrap_result().unwrap()["name"], "archres-core");

        let bad: Response = serde_json::from_str(
            r#"{"id":"r2","error":{"code":"invalid_params","message":"nope"}}"#,
        )
        .unwrap();
        assert!(!bad.is_ok());
        assert!(bad.unwrap_result().unwrap_err().contains("invalid_params"));
    }

    #[test]
    fn a_response_with_neither_is_an_error_not_a_panic() {
        let response: Response = serde_json::from_str(r#"{"id":"r3"}"#).unwrap();
        assert!(response.unwrap_result().is_err());
    }

    #[test]
    fn the_error_codes_are_the_frozen_ones() {
        let bad: Response =
            serde_json::from_str(r#"{"id":"r2","error":{"code":"invalid_params","message":"x"}}"#)
                .unwrap();
        let codes = [
            "invalid_params",
            "worker_down",
            "worker_restarted",
            "timeout",
            "engine_error",
            "internal",
        ];
        assert!(codes.contains(&bad.error.unwrap().code.as_str()));
    }
}
