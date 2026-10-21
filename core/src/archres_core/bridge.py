"""The shell's bridge (W5.1): the core, spoken over stdio, one JSON object per line.

The plan's §4 shell is Tauri + React: the app is a **shell**, and the core is the brain. The
two need a channel, and the repo had none — the **job protocol**
(``spec/schemas/job-protocol.schema.json``) is the wire between the app and the
*persistent engine workers* (the CAD ✓, spike S4 ✓), not between the shell and the core ✓.

So this is that channel, and it is deliberately small:

- **stdio, one JSON object per line** — the shell spawns the core as a sidecar and reads
  lines ✓. No socket, no port, no discovery ✓ — and the UTF-8 law
  (``archres_core.stdio``) already exists for exactly this ✓.
- **a request/response envelope** — ``{"id", "method", "params"}`` in, ``{"id", "result"}``
  or ``{"id", "error"}`` out ✓.
- **the error codes are the job protocol's** — one vocabulary for the app ✓
  (``invalid_params`` ✓, ``internal`` ✓, ``timeout`` ✓).

The methods are the app's own loop — the **agent session** ✓ (the same one the demo drives
✓ and the same one the app will ✓): ``session.create`` ✓, ``session.resume`` ✓,
``session.state`` ✓, ``session.respond`` ✓, ``session.use_default`` ✓, ``session.skip`` ✓,
``session.finish`` ✓, ``session.commit`` ✓, ``session.history`` ✓, ``session.coverage`` ✓ —
plus ``ping`` ✓ and ``version`` ✓.

The bridge is **the core's** half of the channel, and it is deterministic ✓: the same
requests produce the same responses ✓, except where the model is involved ✓ (the escalation
✓), which the session already owns ✓.
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
import time
from typing import Any, Callable, Iterable, TextIO

from .agent import Session
from .agent.client import ModelClient
from .interview import FlowBook, load_book
from .spec import SpecStore

__all__ = [
    "BRIDGE_VERSION",
    "PROTOCOL_VERSION",
    "Bridge",
    "BridgeError",
    "main",
    "serve",
]

#: The bridge's own version (the shape of the channel).
BRIDGE_VERSION = "0.1.0"

#: The channel's version — the shell checks it before it trusts the core.
PROTOCOL_VERSION = "0.1.0"

#: The job protocol's frozen error codes, reused so the app speaks one vocabulary.
CODE_INVALID_PARAMS = "invalid_params"
CODE_INTERNAL = "internal"
CODE_TIMEOUT = "timeout"

#: The flow book the sessions walk.
DEFAULT_BOOK = pathlib.Path("spec") / "flows" / "phase-flow-book.yaml"


class BridgeError(Exception):
    """A request the bridge could not serve."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class Bridge:
    """The core, as the shell sees it: requests in, responses out.

    The bridge holds the sessions (one per project ✓) and the flow book ✓, and it never
    guesses ✓: a method it does not know is an error ✓, and a request it cannot read is
    an error ✓ — not a skipped line ✓.
    """

    def __init__(
        self,
        *,
        book: FlowBook | None = None,
        client: ModelClient | None = None,
        root: str | pathlib.Path | None = None,
    ) -> None:
        self._book = book
        self._client = client
        self._root = pathlib.Path(root) if root else None
        self._sessions: dict[str, Session] = {}
        self._started = time.monotonic()
        self._jobs = 0
        self._last_ms: float | None = None

    # -- the book ------------------------------------------------------------------------
    def book(self) -> FlowBook:
        """The flow book, loaded once ✓ (it is the same book for every session ✓)."""
        if self._book is None:
            path = self._root / DEFAULT_BOOK if self._root else DEFAULT_BOOK
            if not path.is_file():
                raise BridgeError(CODE_INTERNAL, f"the flow book is missing: {path}")
            self._book = load_book(path)
        return self._book

    # -- the methods ----------------------------------------------------------------------
    def handle(self, request: dict[str, Any]) -> dict[str, Any]:
        """One request → one response envelope ✓."""
        request_id = str(request.get("id") or "")
        method = str(request.get("method") or "")
        params = request.get("params") or {}
        if not isinstance(params, dict):
            return _error(request_id, CODE_INVALID_PARAMS, "params must be an object")
        handler = self._method(method)
        if handler is None:
            return _error(request_id, CODE_INVALID_PARAMS, f"unknown method: {method!r}")
        started = time.monotonic()
        try:
            result = handler(params)
        except BridgeError as exc:
            return _error(request_id, exc.code, exc.message)
        except Exception as exc:  # a crash is an error, not a dead channel
            return _error(request_id, CODE_INTERNAL, f"{type(exc).__name__}: {exc}")
        self._jobs += 1
        self._last_ms = (time.monotonic() - started) * 1000
        return {"id": request_id, "result": result}

    def _method(self, method: str) -> Callable[[dict[str, Any]], Any] | None:
        return {
            "ping": self._ping,
            "version": self._version,
            "session.create": self._session_create,
            "session.resume": self._session_resume,
            "session.state": self._session_state,
            "session.respond": self._session_respond,
            "session.use_default": self._session_use_default,
            "session.skip": self._session_skip,
            "session.finish": self._session_finish,
            "session.commit": self._session_commit,
            "session.history": self._session_history,
            "session.coverage": self._session_coverage,
            "bundle.export": self._bundle_export,
            "bundle.read": self._bundle_read,
            "manual.search": self._manual_search,
            "projects.list": self._projects_list,
            "units.convert": self._units_convert,
            "templates.list": self._templates_list,
        }.get(method)

    # -- the methods ----------------------------------------------------------------------
    def _ping(self, params: dict[str, Any]) -> dict[str, Any]:
        return {
            "name": "archres-core",
            "pid": os.getpid(),
            "version": BRIDGE_VERSION,
            "protocolVersion": PROTOCOL_VERSION,
            "uptimeS": round(time.monotonic() - self._started, 3),
        }

    def _version(self, params: dict[str, Any]) -> dict[str, Any]:
        from . import __version__ as core_version

        return {
            "bridgeVersion": BRIDGE_VERSION,
            "protocolVersion": PROTOCOL_VERSION,
            "coreVersion": core_version,
        }

    def _session_create(self, params: dict[str, Any]) -> dict[str, Any]:
        root = self._project_root(params)
        spec = params.get("spec")
        if not isinstance(spec, dict):
            raise BridgeError(CODE_INVALID_PARAMS, "session.create needs a spec object")
        session_id = str(params.get("sessionId") or f"session-{len(self._sessions) + 1}")
        session = Session.create(self.book(), root, spec, client=self._client)
        self._sessions[session_id] = session
        return {"sessionId": session_id, **self._state(session)}

    def _session_resume(self, params: dict[str, Any]) -> dict[str, Any]:
        root = self._project_root(params)
        session_id = str(params.get("sessionId") or f"session-{len(self._sessions) + 1}")
        session = Session.resume(self.book(), root, client=self._client)
        self._sessions[session_id] = session
        return {"sessionId": session_id, **self._state(session)}

    def _session_state(self, params: dict[str, Any]) -> dict[str, Any]:
        return self._state(self._session(params))

    def _session_respond(self, params: dict[str, Any]) -> dict[str, Any]:
        session = self._session(params)
        text = str(params.get("text") or "")
        choice = params.get("choice")
        turn = session.respond(text, choice=choice if isinstance(choice, str) else None)
        return {"turn": turn.to_dict(), **self._state(session)}

    def _session_use_default(self, params: dict[str, Any]) -> dict[str, Any]:
        session = self._session(params)
        turn = session.use_default()
        return {"turn": turn.to_dict(), **self._state(session)}

    def _session_skip(self, params: dict[str, Any]) -> dict[str, Any]:
        session = self._session(params)
        turn = session.skip()
        return {"turn": turn.to_dict(), **self._state(session)}

    def _session_finish(self, params: dict[str, Any]) -> dict[str, Any]:
        session = self._session(params)
        turn = session.finish()
        return {"turn": turn.to_dict(), **self._state(session)}

    def _session_commit(self, params: dict[str, Any]) -> dict[str, Any]:
        session = self._session(params)
        note = str(params.get("note") or "session checkpoint")
        session.commit(note)
        return {"committed": True, **self._state(session)}

    def _session_history(self, params: dict[str, Any]) -> dict[str, Any]:
        return {"history": self._session(params).history()}

    def _session_coverage(self, params: dict[str, Any]) -> dict[str, Any]:
        return {"coverage": self._session(params).coverage()}

    def _bundle_export(self, params: dict[str, Any]) -> dict[str, Any]:
        """Write the project's bundle ✓ — the one-file backup ✓ (W5.5 ✓) ✓."""
        from .bundle import BundleError, export_bundle

        project = params.get("project")
        target = params.get("target")
        if not isinstance(project, str) or not project:
            raise BridgeError(CODE_INVALID_PARAMS, "bundle.export needs the project folder")
        if not isinstance(target, str) or not target:
            raise BridgeError(CODE_INVALID_PARAMS, "bundle.export needs a target file")
        outputs = params.get("outputs")
        try:
            manifest = export_bundle(
                project,
                target,
                outputs=outputs if isinstance(outputs, str) and outputs else None,
            )
        except BundleError as exc:
            raise BridgeError(CODE_INTERNAL, str(exc)) from exc
        return {"manifest": manifest.as_dict(), "target": target}

    def _bundle_read(self, params: dict[str, Any]) -> dict[str, Any]:
        """What a bundle holds ✓ — read without importing it ✓ ✓."""
        from .bundle import BundleError, read_bundle

        target = params.get("target")
        if not isinstance(target, str) or not target:
            raise BridgeError(CODE_INVALID_PARAMS, "bundle.read needs a bundle file")
        try:
            manifest = read_bundle(target)
        except BundleError as exc:
            raise BridgeError(CODE_INTERNAL, str(exc)) from exc
        return {"manifest": manifest.as_dict()}

    def _manual_search(self, params: dict[str, Any]) -> dict[str, Any]:
        """The offline manual ✓ — a question in, the sourced answers out ✓ (W5.5 ✓).

        No network ✓, no model ✓ — the manual is derived from the repo's facts ✓ and
        searched by terms ✓ ✓.
        """
        from .manual import ManualError, build_manual, search_manual

        query = params.get("query")
        if not isinstance(query, str):
            raise BridgeError(CODE_INVALID_PARAMS, "manual.search needs a query")
        lang = str(params.get("lang") or "en")
        try:
            entries = build_manual(self._book_path(), self._pack_paths())
        except ManualError as exc:
            raise BridgeError(CODE_INTERNAL, str(exc)) from exc
        hits = search_manual(entries, query, lang=lang)
        return {
            "query": query,
            "lang": lang,
            "answers": [
                {"entry": entry.as_dict(), "score": score} for entry, score in hits
            ],
        }

    def _book_path(self) -> pathlib.Path:
        base = self._root or pathlib.Path(".")
        return base / "spec" / "flows" / "phase-flow-book.yaml"

    def _pack_paths(self) -> list[pathlib.Path]:
        base = self._root or pathlib.Path(".")
        return sorted((base / "spec" / "rules").glob("*.yaml"))

    def _projects_list(self, params: dict[str, Any]) -> dict[str, Any]:
        """The projects on this machine ✓ — the dashboard's list ✓ (W5.6 ✓) ✓.

        A project folder is a **store** ✓ (the revisions ✓ and the log ✓), so the list is
        the folders that carry one ✓ — and each project is read from its **tip** ✓, so the
        dashboard shows the project's own facts ✓ and not a mock ✓ ✓.
        """
        base = self._root or pathlib.Path(".")
        projects_dir = params.get("projects") or str(base / "projects")
        root = pathlib.Path(projects_dir)
        rows: list[dict[str, Any]] = []
        if root.is_dir():
            for path in sorted(root.iterdir()):
                if not path.is_dir() or not (path / "log.jsonl").is_file():
                    continue
                try:
                    store = SpecStore(path)
                    tip = store.tip()
                    spec = store.load(tip.sha256)
                except Exception:
                    # a project that cannot be read is reported as unreadable, not hidden ✓
                    rows.append({"name": path.name, "path": str(path), "readable": False})
                    continue
                project = spec.get("project") or {}
                address = (spec.get("site") or {}).get("address") or {}
                area = (
                    address.get("areaName", "")
                    if isinstance(address, dict)
                    else str(address)
                )
                rows.append(
                    {
                        "name": str(project.get("name") or path.name),
                        "path": str(path),
                        "readable": True,
                        "id": str(project.get("id") or ""),
                        "address": str(area),
                        "revision": tip.number,
                        "sha256": tip.sha256,
                        "updatedAt": tip.createdAt,
                        "locked": bool(spec.get("locked")),
                    }
                )
        return {"projects": rows, "count": len(rows)}

    def _units_convert(self, params: dict[str, Any]) -> dict[str, Any]:
        """Convert a land unit ✓ — the core's deterministic conversion ✓ (W5.7 ✓) ✓.

        The app does not convert on its own ✓: the module's ``Decimal`` maths is the one
        implementation ✓, so a katha is the same number everywhere ✓ ✓. An **area** and a
        **length** are not the same kind of thing ✓, so mixing them is an error ✓, not a
        number ✓ ✓.
        """
        from .units import (
            AREA_TO_M2,
            LENGTH_TO_M,
            UnitError,
            area_from_m2,
            area_to_m2,
            length_from_m,
            length_to_m,
        )

        value = params.get("value")
        unit = params.get("from")
        target = params.get("to")
        if not isinstance(value, (int, float, str)) or not isinstance(unit, str):
            raise BridgeError(CODE_INVALID_PARAMS, "units.convert needs a value and a unit")
        if not isinstance(target, str):
            raise BridgeError(CODE_INVALID_PARAMS, "units.convert needs a target unit")
        source_key = unit.strip().lower()
        target_key = target.strip().lower()
        known_areas = set(AREA_TO_M2) | set(LENGTH_TO_M)
        for key, given in ((source_key, unit), (target_key, target)):
            if key not in known_areas:
                raise BridgeError(CODE_INVALID_PARAMS, f"unknown unit: {given!r}")
        try:
            if source_key in AREA_TO_M2 and target_key in AREA_TO_M2:
                result = area_from_m2(area_to_m2(value, source_key), target_key)
                kind = "area"
            elif source_key in LENGTH_TO_M and target_key in LENGTH_TO_M:
                result = length_from_m(length_to_m(value, source_key), target_key)
                kind = "length"
            else:
                raise BridgeError(
                    CODE_INVALID_PARAMS,
                    "an area and a length are not the same kind of thing - convert one to "
                    "the other first (a katha is an area, a foot is a length)",
                )
        except UnitError as exc:
            raise BridgeError(CODE_INVALID_PARAMS, str(exc)) from exc
        return {
            "kind": kind,
            "value": str(result),
            "from": unit,
            "to": target,
        }

    def _templates_list(self, params: dict[str, Any]) -> dict[str, Any]:
        """The project's starting points ✓ — the templates ✓ (W5.7 ✓) ✓.

        A template is a **committed example spec** ✓ — the repo's own ✓ — so a new project
        starts from something the repo holds and can be diffed against ✓ ✓.
        """
        base = self._root or pathlib.Path(".")
        examples = base / "spec" / "examples"
        rows: list[dict[str, Any]] = []
        if examples.is_dir():
            for path in sorted(examples.glob("*.json")):
                try:
                    document = json.loads(path.read_text(encoding="utf-8"))
                except ValueError:
                    continue
                if not isinstance(document, dict) or "project" not in document:
                    continue
                project = document.get("project") or {}
                building = document.get("building") or {}
                storeys = building.get("storeys") or {}
                rows.append(
                    {
                        "id": path.stem,
                        "name": str(project.get("name") or path.stem),
                        "path": f"spec/examples/{path.name}",
                        "language": str(project.get("language") or "en"),
                        "floors": storeys.get("count"),
                        "occupancy": str(building.get("occupancy") or ""),
                        "notes": str(project.get("notes") or ""),
                    }
                )
        return {"templates": rows, "count": len(rows)}

    # -- the helpers ----------------------------------------------------------------------
    def _project_root(self, params: dict[str, Any]) -> pathlib.Path:
        raw = params.get("root")
        if not isinstance(raw, str) or not raw:
            raise BridgeError(CODE_INVALID_PARAMS, "the session needs a project root")
        root = pathlib.Path(raw)
        if not root.is_dir():
            raise BridgeError(CODE_INVALID_PARAMS, f"the project root is not a directory: {root}")
        return root

    def _session(self, params: dict[str, Any]) -> Session:
        session_id = str(params.get("sessionId") or "")
        session = self._sessions.get(session_id)
        if session is None:
            raise BridgeError(CODE_INVALID_PARAMS, f"no session {session_id!r}")
        return session

    def _state(self, session: Session) -> dict[str, Any]:
        return {
            "prompt": session.prompt(),
            "done": session.done,
            "pending": session.pending(),
        }


def _error(request_id: str, code: str, message: str) -> dict[str, Any]:
    return {"id": request_id, "error": {"code": code, "message": message}}


def serve(bridge: Bridge, stdin: TextIO, stdout: TextIO) -> int:
    """The loop: one request per line in, one response per line out ✓."""
    for line in stdin:
        text = line.strip()
        if not text:
            continue
        try:
            request = json.loads(text)
        except ValueError as exc:
            response: dict[str, Any] = _error("", CODE_INVALID_PARAMS, f"not JSON: {exc}")
        else:
            if not isinstance(request, dict):
                response = _error("", CODE_INVALID_PARAMS, "a request must be an object")
            else:
                response = bridge.handle(request)
        stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        stdout.flush()
    return 0


def main(argv: Iterable[str] | None = None) -> int:
    """Run the bridge on stdio ✓ (the shell spawns this ✓)."""
    from .stdio import utf8_stdio

    # The **input** matters as much as the output: the app's answers are in the user's
    # language (Bangla ✓), and a piped stdin on Windows is decoded in the locale code
    # page ✗ — so the channel would read a mangled answer ✗ and write a mangled reply ✗.
    utf8_stdio((sys.stdin, sys.stdout, sys.stderr))
    import argparse

    parser = argparse.ArgumentParser(description="The core, spoken over stdio (the shell's bridge).")
    parser.add_argument("--root", help="the install root (the flow book is read from here)")
    parser.add_argument("--fleet-url", help="the local model router (the escalation path)")
    args = parser.parse_args(list(argv) if argv is not None else None)

    client: ModelClient | None = None
    if args.fleet_url:
        from .agent.client import LlamaSwapClient

        client = LlamaSwapClient(base_url=args.fleet_url, model="chat")

    bridge = Bridge(client=client, root=args.root)
    return serve(bridge, sys.stdin, sys.stdout)


if __name__ == "__main__":
    raise SystemExit(main())
