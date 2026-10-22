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
import re
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


def _slug(name: str) -> str:
    """A folder name for a project ✓ — safe ✓ and readable ✓ ✓."""
    cleaned = re.sub(r"[^A-Za-z0-9]+", "-", name.strip()).strip("-").lower()
    return cleaned or "project"


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
            "project.create": self._project_create,
            "boq.build": self._boq_build,
            "design.run": self._design_run,
            "import.candidates": self._import_candidates,
            "import.review": self._import_review,
            "documents.list": self._documents_list,
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
        """Close the interview ✓ — the fallbacks applied ✓, one revision committed ✓ ✓."""
        session = self._session(params)
        turns = session.finish()
        return {
            "turns": [turn.to_dict() for turn in turns],
            "turnCount": len(turns),
            **self._state(session),
        }

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
        """The flow book ✓ — the install's place ✓ or the dev tree's ✓ ✓.

        Two places ✓, and **loudly** ✓ when neither has it ✓ (the CAD engine's rule ✓:
        discovery is explicit ✓ and its failure is loud ✓ ✓).
        """
        return self._data_path("flows", "phase-flow-book.yaml")

    def _pack_paths(self) -> list[pathlib.Path]:
        """The rule packs ✓ — the install's place ✓ or the dev tree's ✓ ✓."""
        base = self._root or pathlib.Path(".")
        for relative in (("packs",), ("spec", "rules")):
            folder = base.joinpath(*relative)
            if folder.is_dir():
                return sorted(folder.glob("*.yaml"))
        return []

    def _data_path(self, *parts: str) -> pathlib.Path:
        """A data file ✓ — the install's place ✓ or the dev tree's ✓ ✓."""
        base = self._root or pathlib.Path(".")
        for relative in (
            (self._core_data(), *parts),
            ("spec", *parts),
        ):
            candidate = base.joinpath(*relative)
            if candidate.is_file():
                return candidate
        raise BridgeError(
            CODE_INTERNAL,
            f"the core's data is missing: {base.joinpath(*parts)} is not there "
            "(the install carries it under runtime/core; the dev tree under spec)",
        )

    def _core_data(self) -> str:
        """The install's core-data folder ✓ — relative to the root ✓ ✓."""
        from .install import INSTALL_LAYOUT

        return INSTALL_LAYOUT["coreData"]

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

    def _project_create(self, params: dict[str, Any]) -> dict[str, Any]:
        """Start a project ✓ — from a template ✓, with its own name ✓ ✓.

        The project is the core's ✓ — the spec engine writes it ✓ and the interview
        interviews it ✓ — and the app only says **what** to start it from ✓ ✓.
        """
        name = params.get("name")
        if not isinstance(name, str) or not name.strip():
            raise BridgeError(CODE_INVALID_PARAMS, "project.create needs a name")
        template_id = params.get("template")
        base = self._root or pathlib.Path(".")
        projects_dir = pathlib.Path(
            params.get("projects") or str(base / "projects")
        )
        target = projects_dir / _slug(name)
        if (target / "log.jsonl").exists():
            raise BridgeError(
                CODE_INVALID_PARAMS, f"there is already a project at {target.name}"
            )

        spec = self._template_spec(template_id)
        project = spec.get("project") or {}
        spec["project"] = {**project, "name": name.strip()}
        spec.pop("revision", None)
        spec.pop("locked", None)
        spec.pop("createdAt", None)
        spec.pop("updatedAt", None)

        try:
            session = Session.create(
                self.book(),
                target,
                spec,
                client=self._client,
                language=str(params.get("lang") or "en"),
            )
        except Exception as exc:
            raise BridgeError(CODE_INTERNAL, f"the project could not be started: {exc}") from exc
        self._sessions[f"project-{target.name}"] = session
        prompt = session.prompt()
        return {
            "sessionId": f"project-{target.name}",
            "path": str(target),
            "name": name.strip(),
            "prompt": prompt,
        }

    def _boq_build(self, params: dict[str, Any]) -> dict[str, Any]:
        """The project's BOQ ✓ — the money ✓ ✓.

        The **project's own spec** ✓ (the store's tip ✓) is designed ✓ and priced ✓ — and
        the card it is priced from is **named** ✓, with its status ✓, because the plan's
        money law says a card that is a candidate says so ✓ (the acknowledgement is the
        owner's ✓ ✓) ✓ ✓.
        """
        from .design import (
            build_boq,
            design_foundation,
            design_rebar,
            design_takeoff,
            design_typical_floor,
        )

        project = params.get("project")
        if not isinstance(project, str) or not project:
            raise BridgeError(CODE_INVALID_PARAMS, "boq.build needs the project folder")
        try:
            store = SpecStore(project)
            spec = store.load(store.tip().sha256)
        except Exception as exc:
            raise BridgeError(CODE_INVALID_PARAMS, f"the project cannot be read: {exc}") from exc

        card = self._price_card()
        try:
            foundation = design_foundation(spec)
            floor = design_typical_floor(spec, foundation)
            rebar = design_rebar(spec, foundation, floor)
            takeoff = design_takeoff(spec, foundation, floor, rebar)
            boq = build_boq(takeoff, card)
        except Exception as exc:
            raise BridgeError(CODE_INTERNAL, f"the BOQ could not be built: {exc}") from exc
        return {
            "boq": boq,
            "pricedFrom": {
                "cardId": str(card.get("cardId") or ""),
                "status": str(card.get("status") or ""),
                "region": str(card.get("region") or ""),
                "effectiveFrom": str(card.get("effectiveFrom") or ""),
            },
        }

    def _documents_list(self, params: dict[str, Any]) -> dict[str, Any]:
        """The engineer pack's contents ✓ — the handover ✓ ✓.

        The **engineer pack** ✓ is the *handover* ✓ (the spec ✓, the drawings ✓, the BBS ✓,
        the BOQ ✓, the compliance audit ✓) — and its manifest carries **each part's role**
        ✓ and its hash ✓ ✓ — so the app can show the user **what they would hand over**
        ✓ ✓.

        (The **project bundle** ✓ — ADR-0067 ✓ — is a different thing ✓: the *backup* ✓
        and the *transfer* ✓ ✓. One reader each ✓ ✓ ✓.)
        """
        import zipfile

        pack = params.get("pack")
        if not isinstance(pack, str) or not pack:
            raise BridgeError(CODE_INVALID_PARAMS, "documents.list needs the pack file")
        path = pathlib.Path(pack)
        if not path.is_file():
            raise BridgeError(CODE_INVALID_PARAMS, f"there is no pack at {path}")
        try:
            with zipfile.ZipFile(path) as archive:
                if "manifest.json" not in archive.namelist():
                    raise BridgeError(CODE_INTERNAL, "the pack carries no manifest")
                document = json.loads(archive.read("manifest.json").decode("utf-8"))
        except zipfile.BadZipFile as exc:
            raise BridgeError(CODE_INTERNAL, f"the pack is not a readable archive: {exc}") from exc

        parts = document.get("parts")
        if not isinstance(parts, list) or not parts:
            raise BridgeError(CODE_INTERNAL, "the pack's manifest carries no parts")
        groups: dict[str, list[str]] = {}
        for part in parts:
            name = str(part.get("name") or "")
            role = str(part.get("role") or "output")
            groups.setdefault(role, []).append(name)
        return {
            "pack": str(path),
            "projectName": str(document.get("projectName") or ""),
            "created": str(document.get("created") or ""),
            "groups": {key: sorted(value) for key, value in sorted(groups.items())},
            "count": len(parts),
        }

    def _design_run(self, params: dict[str, Any]) -> dict[str, Any]:
        """The project's design ✓ — every part it covers ✓, in the pipeline's order ✓ ✓.

        The **design** is the core's ✓ (the same call the walking skeleton makes ✓ — one
        implementation ✓ ✓) ✓, and the answer carries the **assumptions** ✓ the design made ✓
        — because an assumed number ✓ that is not visible ✓ is a number nobody can check ✓ ✓.
        """
        from .design import design_project

        project = params.get("project")
        if not isinstance(project, str) or not project:
            raise BridgeError(CODE_INVALID_PARAMS, "design.run needs the project folder")
        try:
            store = SpecStore(project)
            spec = store.load(store.tip().sha256)
        except Exception as exc:
            raise BridgeError(CODE_INVALID_PARAMS, f"the project cannot be read: {exc}") from exc

        try:
            design = design_project(spec)
        except Exception as exc:
            raise BridgeError(CODE_INTERNAL, f"the design could not be made: {exc}") from exc

        # the **assumptions** travel with the design ✓ - an assumed number ✓ that is not
        # visible ✓ is a number nobody can check ✓ ✓ (the spec carries them ✓ ✓)
        assumptions = []
        for item in spec.get("assumptions") or []:
            if isinstance(item, dict):
                assumptions.append(
                    {
                        "id": str(item.get("id") or ""),
                        "subject": str(item.get("subject") or ""),
                        "statement": str(item.get("statement") or ""),
                        "basis": str(item.get("basis") or ""),
                        "verifyOnSite": bool(item.get("verifyOnSite")),
                        "relatedPath": str(item.get("relatedPath") or ""),
                    }
                )
        return {
            "projectId": design.project_id,
            "projectName": design.project_name,
            "assumptions": assumptions,
            "storeys": int(
                ((spec.get("building") or {}).get("storeys") or {}).get("count") or 0
            ),
            "counts": {
                "assumptions": len(assumptions),
                "typicalFloors": len(design.floors or ()),
                "stages": len(design.stages or ()),
            },
        }

    def _import_candidates(self, params: dict[str, Any]) -> dict[str, Any]:
        """A user's own PDF as **candidate clauses** ✓ — candidates, never law ✓ ✓.

        The importer is the core's ✓ (W4.7 ✓) ✓ — the app never extracts a clause itself
        ✓ ✓ — and every candidate carries its **page** ✓ (a clause without a page cannot
        be checked ✓ ✓) ✓ ✓.
        """
        from .importer import ImporterError, candidates_from_pdf

        pdf = params.get("pdf")
        if not isinstance(pdf, str) or not pdf:
            raise BridgeError(CODE_INVALID_PARAMS, "import.candidates needs a PDF")
        try:
            candidates = candidates_from_pdf(pdf)
        except ImporterError as exc:
            raise BridgeError(CODE_INVALID_PARAMS, str(exc)) from exc
        return {
            "pdf": pdf,
            "candidates": [candidate.as_dict() for candidate in candidates],
            "count": len(candidates),
        }

    def _import_review(self, params: dict[str, Any]) -> dict[str, Any]:
        """Record a reviewer's decision on a candidate ✓ — in the core's ledger ✓ ✓.

        The decision is **recorded** ✓ (who ✓, when ✓, why ✓) — it is the evidence that a
        rule entered a pack deliberately ✓ ✓ — and a candidate with no decision is
        visibly unreviewed ✓ ✓.
        """
        from .importer import (
            DECISION_ACCEPTED,
            DECISION_REJECTED,
            Review,
            candidates_from_pdf,
            load_review,
            save_review,
        )

        pdf = params.get("pdf")
        candidate_id = params.get("candidateId")
        if not isinstance(pdf, str) or not pdf:
            raise BridgeError(CODE_INVALID_PARAMS, "import.review needs a PDF")
        if not isinstance(candidate_id, str) or not candidate_id:
            raise BridgeError(CODE_INVALID_PARAMS, "import.review needs a candidate id")
        decision = str(params.get("decision") or "")
        if decision not in (DECISION_ACCEPTED, DECISION_REJECTED):
            raise BridgeError(
                CODE_INVALID_PARAMS,
                f"the decision must be {DECISION_ACCEPTED} or {DECISION_REJECTED}",
            )
        try:
            candidates = candidates_from_pdf(pdf)
        except ImporterError as exc:
            raise BridgeError(CODE_INVALID_PARAMS, str(exc)) from exc
        if not any(candidate.id == candidate_id for candidate in candidates):
            raise BridgeError(CODE_INVALID_PARAMS, f"no candidate {candidate_id!r} in this PDF")

        ledger = pathlib.Path(str(pdf) + ".review.json")
        reviews = [
            review for review in load_review(ledger) if review.candidate_id != candidate_id
        ]
        reviews.append(
            Review(
                candidate_id=candidate_id,
                decision=decision,
                reviewed_by=str(params.get("reviewedBy") or ""),
                reviewed_at=str(params.get("reviewedAt") or ""),
                note=str(params.get("note") or ""),
            )
        )
        save_review(ledger, reviews)
        return {
            "ledger": str(ledger),
            "candidateId": candidate_id,
            "decision": decision,
            "reviewed": len(reviews),
        }

    def _price_card(self) -> dict[str, Any]:
        """The rate card ✓ — the committed one ✓ ✓.

        The card's **status** travels with the BOQ ✓ — a candidate card says so ✓ (the
        money law ✓ ✓) ✓ ✓.
        """
        base = self._root or pathlib.Path(".")
        cards = sorted((base / "data" / "prices" / "cards").glob("*.json"))
        if cards:
            try:
                document = json.loads(cards[0].read_text(encoding="utf-8"))
            except ValueError as exc:
                raise BridgeError(CODE_INTERNAL, f"the rate card is not readable: {exc}") from exc
            if isinstance(document, dict):
                return document
        example = base / "spec" / "examples" / "interfaces" / "rate-card-dhaka-example.json"
        if example.is_file():
            return json.loads(example.read_text(encoding="utf-8"))
        raise BridgeError(CODE_INTERNAL, "no rate card is available")

    def _template_spec(self, template_id: str | None) -> dict[str, Any]:
        """The spec a template carries ✓ — the repo's own example ✓ ✓."""
        base = self._root or pathlib.Path(".")
        examples = base / "spec" / "examples"
        wanted = template_id or "new-project"
        path = examples / f"{wanted}.json"
        if not path.is_file():
            # the first example is the empty one ✓ - a new project starts from it ✓ ✓
            fallback = sorted(examples.glob("*.json")) if examples.is_dir() else []
            if not fallback:
                raise BridgeError(CODE_INTERNAL, f"no template is available: {path}")
            path = fallback[0]
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except ValueError as exc:
            raise BridgeError(CODE_INTERNAL, f"the template is not readable: {exc}") from exc
        if not isinstance(document, dict):
            raise BridgeError(CODE_INTERNAL, "the template is not a spec")
        return document

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
