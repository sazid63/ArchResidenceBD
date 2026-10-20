"""The repair judge strips fences, counts what it measured, and never invents a pass (W1.7)."""

from __future__ import annotations

import importlib.util
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
TOOL = ROOT / "tools" / "training" / "eval_repair.py"
GATES = ROOT / "data" / "eval" / "repair-v0" / "gates.json"


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
