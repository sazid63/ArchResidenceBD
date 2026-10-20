"""The repair judge strips fences, counts what it measured, and never invents a pass (W1.7)."""

from __future__ import annotations

import importlib.util
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
TOOL = ROOT / "tools" / "training" / "eval_repair.py"
EVAL = ROOT / "data" / "eval" / "repair-v0"
GATES = EVAL / "gates.json"


def _tool():
    spec = importlib.util.spec_from_file_location("archres_eval_repair", TOOL)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_a_fenced_macro_is_still_a_macro() -> None:
    module = _tool()
    assert module._strip_fences("```python\nprint('x')\n```") == "print('x')"
    assert module._strip_fences("print('x')") == "print('x')"
    assert module._strip_fences("  ```\nprint('x')\n```  ") == "print('x')"
    assert module._strip_fences("") == ""


def test_the_rate_is_zero_without_replies() -> None:
    module = _tool()
    assert module._rate({"replies": 0, "passesOwnCase": 0}, "passesOwnCase") == 0.0
    assert module._rate({"replies": 4, "passesOwnCase": 1}, "passesOwnCase") == 0.25


def test_the_gates_are_the_recorded_stock_baseline() -> None:
    import json

    gates = json.loads(GATES.read_text(encoding="utf-8"))
    assert gates["floors"]["passesOwnCase"]["floor"] >= 0.0
    assert gates["floors"]["passesOwnCase"]["model"]
    assert gates["floors"]["passesOwnCase"]["count"] == 4
    assert "stock" in gates["floors"]["passesOwnCase"]["model"].lower()


def test_the_committed_report_scores_the_committed_replies() -> None:
    import hashlib
    import json

    reports = EVAL / "reports"
    for model in ("stock", "finetune"):
        report_path = reports / f"{model}.json"
        if not report_path.is_file():
            continue
        report = json.loads(report_path.read_text(encoding="utf-8"))
        reply = EVAL / "replies" / f"{model}.jsonl"
        digest = hashlib.sha256(reply.read_bytes()).hexdigest()
        assert report["replySha256"] == digest, model
        assert report["summary"]["replies"] == 4, model
        assert report["missingReplies"] == [], model


def test_the_floor_is_the_measured_stock_rate() -> None:
    import json

    stock_path = EVAL / "reports" / "stock.json"
    if not stock_path.is_file():
        return
    gates = json.loads(GATES.read_text(encoding="utf-8"))
    stock = json.loads(stock_path.read_text(encoding="utf-8"))
    for name in ("passesOwnCase", "noCollateral"):
        assert gates["floors"][name]["floor"] == stock["rates"][name]
