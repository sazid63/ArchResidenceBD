"""Tool registry + permission policy v0 (W1.10, plan §5.8).

The model never gets a tool by existing. Every call is classified (read / write / net /
exec), checked against a sandbox and an explicit grant list, and answered with one of
three decisions — ``allow``, ``ask`` (a human approval is required) or ``deny``. Deny is
the default: an unknown tool, a path outside the sandbox, the network while offline-first,
or a tool call motivated by external content is refused with a stated reason.

Two laws from the plan are encoded here:

- **Fleet isolation.** External content cannot drive write/exec/net tools at all, and a
  high-severity injection finding in that content refuses every tool. The model that read
  the web is not the model that writes CAD (and in v0, no model writes anything directly).
- **No silent anything.** Every decision is appended to ``policy.log`` with the tool, the
  trust level, the reason and the findings that mattered — the UI can show the audit trail.
"""

from __future__ import annotations

import pathlib
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Iterable, Literal, Sequence

from .injection import Finding, has_high, worst_severity

DecisionStatus = Literal["allow", "ask", "deny"]


class ToolKind(StrEnum):
    READ = "read"
    WRITE = "write"
    NET = "net"
    EXEC = "exec"


@dataclass(frozen=True)
class ToolSpec:
    id: str
    kind: ToolKind
    summary: str
    risk: Literal["low", "medium", "high"]

    def to_dict(self) -> dict[str, str]:
        return {"id": self.id, "kind": self.kind.value, "summary": self.summary, "risk": self.risk}


#: The v0 tool surface. Anything not listed here is unknown and therefore denied.
TOOLS: dict[str, ToolSpec] = {
    "fs.list": ToolSpec("fs.list", ToolKind.READ, "List a directory inside the project sandbox.", "low"),
    "fs.read": ToolSpec("fs.read", ToolKind.READ, "Read a UTF-8 file inside the project sandbox.", "low"),
    "fs.write": ToolSpec("fs.write", ToolKind.WRITE, "Write a UTF-8 file inside the project sandbox.", "high"),
    "spec.read": ToolSpec("spec.read", ToolKind.READ, "Read a pointer of the current Building Spec revision.", "low"),
    "spec.write": ToolSpec(
        "spec.write", ToolKind.WRITE, "Apply a provenance-stamped patch to the Building Spec.", "high"
    ),
    "fetch.get": ToolSpec("fetch.get", ToolKind.NET, "Fetch one URL through the Source Registry.", "medium"),
    "web.search": ToolSpec("web.search", ToolKind.NET, "Search the web through the Source Registry.", "medium"),
    "shell.run": ToolSpec("shell.run", ToolKind.EXEC, "Run one command in the project sandbox.", "high"),
}

#: Trust levels of the content that motivated a call.
TRUST_LEVELS = ("spec", "user", "external")

@dataclass(frozen=True)
class Call:
    tool: str
    args: dict[str, Any] = field(default_factory=dict)
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"tool": self.tool, "args": dict(self.args), "reason": self.reason}


@dataclass(frozen=True)
class Decision:
    tool: str
    status: DecisionStatus
    reason: str
    trust: str = "user"

    @property
    def allowed(self) -> bool:
        return self.status == "allow"

    @property
    def needs_approval(self) -> bool:
        return self.status == "ask"

    def to_dict(self) -> dict[str, Any]:
        return {"tool": self.tool, "status": self.status, "reason": self.reason, "trust": self.trust}


class PermissionError(RuntimeError):
    """The policy itself is misconfigured (not a denial)."""


def _resolve_inside(sandbox: pathlib.Path, raw: Any) -> pathlib.Path:
    """Resolve a tool path inside the sandbox or raise ``ValueError`` with the reason."""
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError("a non-empty path is required")
    candidate = pathlib.Path(raw)
    if candidate.is_absolute():
        resolved = candidate.resolve()
    else:
        resolved = (sandbox / candidate).resolve()
    try:
        resolved.relative_to(sandbox)
    except ValueError:
        raise ValueError(f"{raw!r} is outside the project sandbox") from None
    return resolved


class PermissionPolicy:
    """One policy per session: explicit grants, one sandbox, offline unless allowed."""

    def __init__(
        self,
        *,
        sandbox: str | pathlib.Path,
        granted: Iterable[str] = (),
        allow_net: bool = False,
        allow_exec: bool = False,
    ) -> None:
        self.sandbox = pathlib.Path(sandbox).resolve()
        self.granted: set[str] = set(granted)
        self.allow_net = allow_net
        self.allow_exec = allow_exec
        self.log: list[dict[str, Any]] = []

    # -- grants -------------------------------------------------------------

    def grant(self, tool: str) -> None:
        if tool not in TOOLS:
            raise PermissionError(f"unknown tool {tool!r}")
        self.granted.add(tool)

    def revoke(self, tool: str) -> None:
        self.granted.discard(tool)

    def tools(self) -> list[dict[str, str]]:
        """The catalogue as the UI sees it, with the current grant state."""
        return [
            {**spec.to_dict(), "granted": tool in self.granted}
            for tool, spec in TOOLS.items()
        ]

    # -- decisions ----------------------------------------------------------

    def authorize(
        self,
        call: Call,
        *,
        trust: str = "user",
        findings: Sequence[Finding] = (),
    ) -> Decision:
        """Classify one call. Deny is the default; every decision is logged."""
        spec = TOOLS.get(call.tool)
        if trust not in TRUST_LEVELS:
            raise PermissionError(f"unknown trust level {trust!r}")
        if spec is None:
            return self._log(Decision(call.tool, "deny", f"{call.tool!r} is not a known tool", trust))

        if findings and has_high(findings):
            worst = worst_severity(findings)
            return self._log(
                Decision(
                    call.tool,
                    "deny",
                    f"untrusted content raised an injection alert ({worst}); no tool may run",
                    trust,
                )
            )

        if spec.kind in (ToolKind.WRITE, ToolKind.EXEC, ToolKind.NET) and trust == "external":
            return self._log(
                Decision(
                    call.tool,
                    "deny",
                    f"external content cannot call a {spec.kind.value} tool (fleet isolation)",
                    trust,
                )
            )

        if call.tool in ("fs.list", "fs.read") or call.tool == "fs.write":
            try:
                _resolve_inside(self.sandbox, call.args.get("path"))
            except ValueError as exc:
                return self._log(Decision(call.tool, "deny", str(exc), trust))
        elif call.tool == "shell.run":
            workdir = call.args.get("cwd", ".")
            try:
                _resolve_inside(self.sandbox, workdir)
            except ValueError as exc:
                return self._log(Decision(call.tool, "deny", str(exc), trust))

        if spec.kind == ToolKind.NET and not self.allow_net:
            return self._log(
                Decision(call.tool, "deny", "network tools are off (offline-first)", trust)
            )
        if spec.kind == ToolKind.EXEC and not self.allow_exec:
            return self._log(
                Decision(call.tool, "deny", "shell tools are off for this session", trust)
            )

        if trust == "external" and spec.kind == ToolKind.READ:
            return self._log(
                Decision(call.tool, "ask", "a read motivated by external content needs approval", trust)
            )

        if call.tool not in self.granted:
            risk = "high-risk" if spec.risk == "high" else f"{spec.kind.value} tool"
            return self._log(Decision(call.tool, "ask", f"not granted yet ({risk})", trust))

        return self._log(Decision(call.tool, "allow", "granted for this session", trust))

    def _log(self, decision: Decision) -> Decision:
        self.log.append(decision.to_dict())
        return decision
