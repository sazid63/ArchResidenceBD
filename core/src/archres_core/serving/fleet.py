"""Model fleet v0 (W1.11): registry-driven llama-swap config + interview/design modes.

The registry (`spec/models/registry.json`) is the fleet manifest — one pinned entry per
role. `spec/models/fleet.json` adds what the router needs and the app decides: install
paths, router policy, swap groups and **modes** (which member a workflow warms first).
The llama-swap YAML is generated from the two, never hand-edited, and CI checks freshness.

Branding law (ADR-0004): only `displayName` becomes a llama-swap model name; upstream
names stay in the registry, never in the generated router config.

Offline law: listeners are loopback, paths are install-root relative, and the generated
file contains no absolute path from a dev machine. The launcher injects `ARCHRES_ROOT`.
"""

from __future__ import annotations

import json
import pathlib
import re
from dataclasses import dataclass
from typing import Any

ROLE_ORDER = ("chat", "repair", "embed", "rerank")
ROUTE_ROLES = frozenset(ROLE_ORDER)
SCHEMA_VERSION = "0.1.0"
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})
SLUG = re.compile(r"^[a-z][a-z0-9-]*$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
SAFE_FILE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
ENV_NAME = re.compile(r"^[A-Z][A-Z0-9_]*$")
FLAG_TOKEN = re.compile(r"^(--[A-Za-z0-9][A-Za-z0-9-]*|[A-Za-z0-9._-]+)$")

#: Speculative decoding is **rejected** (ADR-0054, spike S2): ~8 % acceptance, 3.5-11x slower,
#: and it changed greedy outputs - so it was neither lossless nor worth it. The draft is not in
#: the fleet, and these rules keep it out.
DRAFT_ROLES = frozenset({"draft"})
DRAFT_FLAGS = ("--spec-draft", "--draft-max", "--spec-type", "--spec-draft-ngl", "--spec-draft-n-max")


class FleetError(RuntimeError):
    """The fleet config and the registry do not describe one usable fleet."""


@dataclass(frozen=True)
class ModelRoute:
    id: str
    role: str
    display_name: str
    artifact_file: str
    sha256: str
    size_bytes: int
    group: str
    device: str
    gpu_layers: int
    context: int
    flags: tuple[str, ...]
    distribution: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "role": self.role,
            "displayName": self.display_name,
            "artifact": self.artifact_file,
            "sha256": self.sha256,
            "group": self.group,
            "device": self.device,
            "gpuLayers": self.gpu_layers,
            "context": self.context,
            "flags": list(self.flags),
        }


@dataclass(frozen=True)
class GroupPolicy:
    name: str
    swap: bool
    exclusive: bool
    persistent: bool
    purpose: str
    members: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "swap": self.swap,
            "exclusive": self.exclusive,
            "persistent": self.persistent,
            "members": list(self.members),
        }


@dataclass(frozen=True)
class Mode:
    name: str
    primary: str
    warmup: tuple[str, ...]
    description: dict[str, str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "primary": self.primary,
            "warmup": list(self.warmup),
            "description": dict(self.description),
        }


@dataclass(frozen=True)
class Fleet:
    path: pathlib.Path
    registry_path: pathlib.Path
    generated: str
    install_root_env: str
    listen: str
    health_check_timeout: int
    log_level: str
    log_time_format: str
    send_loading_state: bool
    macros: dict[str, str]
    host: str
    parallel: int
    ttl: int
    groups: dict[str, GroupPolicy]
    modes: dict[str, Mode]
    routes: dict[str, ModelRoute]
    notes: str

    @property
    def generated_path(self) -> pathlib.Path:
        return self.path.parent / self.generated

    def route(self, role: str) -> ModelRoute:
        try:
            return self.routes[role]
        except KeyError:
            raise FleetError(f"no route {role!r} in the fleet") from None

    def mode(self, name: str) -> Mode:
        try:
            return self.modes[name]
        except KeyError:
            raise FleetError(f"unknown mode {name!r}; modes: {sorted(self.modes)}") from None

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": SCHEMA_VERSION,
            "generated": self.generated,
            "installRootEnv": self.install_root_env,
            "listen": self.listen,
            "routes": {role: route.to_dict() for role, route in self.routes.items()},
            "groups": {name: group.to_dict() for name, group in self.groups.items()},
            "modes": {name: mode.to_dict() for name, mode in self.modes.items()},
        }


# -- helpers ---------------------------------------------------------------


def _object(value: Any, where: str, allowed: set[str], required: set[str]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise FleetError(f"{where}: expected an object")
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise FleetError(f"{where}: unknown key(s) {unknown}")
    missing = sorted(required - set(value))
    if missing:
        raise FleetError(f"{where}: missing key(s) {missing}")
    return value


def _text(value: Any, where: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise FleetError(f"{where}: expected non-empty text")
    return value.strip()


def _host_port(value: str, where: str) -> tuple[str, int]:
    if not isinstance(value, str) or ":" not in value:
        raise FleetError(f"{where}: expected host:port, got {value!r}")
    host, _, raw_port = value.rpartition(":")
    if host not in LOOPBACK_HOSTS:
        raise FleetError(f"{where}: only loopback listeners are allowed (offline-first), got {host!r}")
    try:
        port = int(raw_port)
    except ValueError:
        raise FleetError(f"{where}: invalid port {raw_port!r}") from None
    if not 1 <= port <= 65535:
        raise FleetError(f"{where}: port out of range: {port}")
    return host, port


def _relative(value: str, where: str) -> str:
    if not value or value.startswith(("/", "\\")) or re.match(r"^[A-Za-z]:", value):
        raise FleetError(f"{where}: expected a relative path, got {value!r}")
    parts = re.split(r"[\\/]", value)
    if any(part == ".." for part in parts) or "${" in value:
        raise FleetError(f"{where}: path escapes the install root: {value!r}")
    return value


# -- loading ---------------------------------------------------------------


def load_fleet(
    path: str | pathlib.Path,
    registry_path: str | pathlib.Path | None = None,
) -> Fleet:
    """Load and validate the fleet config against the model registry."""
    fleet_path = pathlib.Path(path)
    try:
        config = json.loads(fleet_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise FleetError(f"fleet config not found: {fleet_path}") from None
    except ValueError as exc:
        raise FleetError(f"fleet config is not valid JSON: {exc}") from exc

    config = _object(
        config,
        "fleet",
        {
            "schemaVersion", "generated", "installRootEnv", "router", "macros",
            "defaults", "groups", "modes", "notes",
        },
        {"schemaVersion", "generated", "installRootEnv", "router", "macros", "defaults", "groups", "modes"},
    )
    if config["schemaVersion"] != SCHEMA_VERSION:
        raise FleetError(
            f"unsupported fleet schemaVersion {config['schemaVersion']!r} (expected {SCHEMA_VERSION!r})"
        )

    generated = _text(config["generated"], "fleet.generated")
    if "/" in generated or "\\" in generated or not generated.endswith((".yaml", ".yml")):
        raise FleetError("fleet.generated must be a sibling .yaml/.yml file name")
    install_root_env = _text(config["installRootEnv"], "fleet.installRootEnv")
    if not ENV_NAME.match(install_root_env):
        raise FleetError(f"fleet.installRootEnv: invalid environment variable {install_root_env!r}")

    router = _object(
        config["router"],
        "fleet.router",
        {"listen", "healthCheckTimeout", "logLevel", "logTimeFormat", "sendLoadingState"},
        {"listen", "healthCheckTimeout", "logLevel", "logTimeFormat", "sendLoadingState"},
    )
    listen = _text(router["listen"], "fleet.router.listen")
    _host_port(listen, "fleet.router.listen")
    health_timeout = router["healthCheckTimeout"]
    if not isinstance(health_timeout, int) or isinstance(health_timeout, bool) or health_timeout < 1:
        raise FleetError("fleet.router.healthCheckTimeout must be a positive integer")
    send_loading = router["sendLoadingState"]
    if not isinstance(send_loading, bool):
        raise FleetError("fleet.router.sendLoadingState must be true or false")
    log_level = _text(router["logLevel"], "fleet.router.logLevel")
    log_time_format = _text(router["logTimeFormat"], "fleet.router.logTimeFormat")

    macros = _object(config["macros"], "fleet.macros", {"llama-server", "models"}, {"llama-server", "models"})
    macros = {
        "llama-server": _relative(_text(macros["llama-server"], "fleet.macros.llama-server"), "fleet.macros.llama-server"),
        "models": _relative(_text(macros["models"], "fleet.macros.models"), "fleet.macros.models"),
    }

    defaults = _object(
        config["defaults"],
        "fleet.defaults",
        {"host", "parallel", "ttl"},
        {"host", "parallel", "ttl"},
    )
    host = _text(defaults["host"], "fleet.defaults.host")
    if host not in LOOPBACK_HOSTS:
        raise FleetError(f"fleet.defaults.host must be loopback, got {host!r}")
    parallel = defaults["parallel"]
    if not isinstance(parallel, int) or isinstance(parallel, bool) or parallel < 1:
        raise FleetError("fleet.defaults.parallel must be a positive integer")
    ttl = defaults["ttl"]
    if not isinstance(ttl, int) or isinstance(ttl, bool) or ttl < 0:
        raise FleetError("fleet.defaults.ttl must be zero or a positive integer")

    notes = config.get("notes", "")
    if not isinstance(notes, str):
        raise FleetError("fleet.notes must be text")

    registry_file = pathlib.Path(registry_path) if registry_path is not None else fleet_path.parent / "registry.json"
    models = _load_registry(registry_file)

    groups = _load_groups(config["groups"], models)
    modes = _load_modes(config["modes"], models)
    routes = {role: models[role] for role in ROLE_ORDER if role in models}
    for role, route in routes.items():
        if route.group not in groups:
            raise FleetError(f"{role}: swapGroup {route.group!r} is not declared in fleet.groups")

    return Fleet(
        path=fleet_path,
        registry_path=registry_file,
        generated=generated,
        install_root_env=install_root_env,
        listen=listen,
        health_check_timeout=health_timeout,
        log_level=log_level,
        log_time_format=log_time_format,
        send_loading_state=send_loading,
        macros=macros,
        host=host,
        parallel=parallel,
        ttl=ttl,
        groups=groups,
        modes=modes,
        routes=routes,
        notes=notes,
    )


def _load_registry(path: pathlib.Path) -> dict[str, ModelRoute]:
    try:
        registry = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise FleetError(f"model registry not found: {path}") from None
    except ValueError as exc:
        raise FleetError(f"model registry is not valid JSON: {exc}") from exc
    if not isinstance(registry, dict) or not isinstance(registry.get("models"), list):
        raise FleetError("model registry must contain a models array")
    models: dict[str, ModelRoute] = {}
    for index, entry in enumerate(registry["models"]):
        where = f"registry.models[{index}]"
        if not isinstance(entry, dict):
            raise FleetError(f"{where}: expected an object")
        role = entry.get("role")
        if role in DRAFT_ROLES:
            raise FleetError(
                f"{where}: a draft model is not in the fleet - speculative decoding was rejected "
                "on the evidence of spike S2 (ADR-0054): it was not lossless and it was slower"
            )
        if role not in ROUTE_ROLES:
            raise FleetError(f"{where}: unknown role {role!r}")
        if role in models:
            raise FleetError(f"{where}: duplicate role {role!r} (one entry per role)")
        artifact = entry.get("artifact") or {}
        runtime = entry.get("runtime") or {}
        display = entry.get("displayName") or {}
        where = f"registry.models[{index}] ({role})"
        artifact_file = _text(artifact.get("file"), f"{where}.artifact.file")
        if not SAFE_FILE.match(artifact_file):
            raise FleetError(f"{where}.artifact.file: unsafe file name {artifact_file!r}")
        sha = _text(artifact.get("sha256"), f"{where}.artifact.sha256")
        if not SHA256.match(sha):
            raise FleetError(f"{where}.artifact.sha256: not a lowercase sha256")
        size = artifact.get("sizeBytes")
        if not isinstance(size, int) or isinstance(size, bool) or size < 1:
            raise FleetError(f"{where}.artifact.sizeBytes: expected a positive integer")
        device = runtime.get("device")
        if device not in ("gpu", "cpu"):
            raise FleetError(f"{where}.runtime.device: expected gpu or cpu")
        gpu_layers = runtime.get("gpuLayers")
        if not isinstance(gpu_layers, int) or isinstance(gpu_layers, bool):
            raise FleetError(f"{where}.runtime.gpuLayers: expected an integer")
        if device == "cpu" and gpu_layers != 0:
            raise FleetError(f"{where}: CPU services must be pinned with gpuLayers 0 (S2 finding)")
        if device == "gpu" and gpu_layers < 1:
            raise FleetError(f"{where}: GPU models need gpuLayers >= 1")
        context = runtime.get("context")
        if not isinstance(context, int) or isinstance(context, bool) or context < 256:
            raise FleetError(f"{where}.runtime.context: expected an integer >= 256")
        flags = runtime.get("flags") or []
        if not isinstance(flags, list) or not flags:
            raise FleetError(f"{where}.runtime.flags: expected a non-empty list")
        for position, token in enumerate(flags):
            if not isinstance(token, str) or not FLAG_TOKEN.match(token):
                raise FleetError(f"{where}.runtime.flags: unsafe token {token!r}")
            if position == 0 and not token.startswith("--"):
                raise FleetError(f"{where}.runtime.flags: must start with a --flag, got {token!r}")
            if token.startswith(DRAFT_FLAGS):
                raise FleetError(
                    f"{where}.runtime.flags: {token!r} turns on speculative decoding, which was "
                    "rejected on the evidence of spike S2 (ADR-0054) - it was not lossless and "
                    "it was slower"
                )
        group = _text(entry.get("swapGroup"), f"{where}.swapGroup")
        models[role] = ModelRoute(
            id=_text(entry.get("id"), f"{where}.id"),
            role=role,
            display_name=_text(display.get("en"), f"{where}.displayName.en"),
            artifact_file=artifact_file,
            sha256=sha,
            size_bytes=size,
            group=group,
            device=device,
            gpu_layers=gpu_layers,
            context=context,
            flags=tuple(flags),
            distribution=str(entry.get("distribution", "")),
        )
    if set(models) != ROUTE_ROLES:
        raise FleetError(f"registry must describe exactly the fleet roles {sorted(ROUTE_ROLES)}; got {sorted(models)}")
    return models


def _load_groups(raw: Any, models: dict[str, ModelRoute]) -> dict[str, GroupPolicy]:
    if not isinstance(raw, dict) or not raw:
        raise FleetError("fleet.groups must be a non-empty object")
    declared = set(raw)
    used = {route.group for route in models.values()}
    undeclared = sorted(used - declared)
    if undeclared:
        raise FleetError(f"registry uses undeclared swapGroup(s) {undeclared}")
    unused = sorted(declared - used)
    if unused:
        raise FleetError(f"fleet declares unused swapGroup(s) {unused}")
    groups: dict[str, GroupPolicy] = {}
    for name, value in raw.items():
        if not SLUG.match(name):
            raise FleetError(f"fleet.groups: invalid group name {name!r}")
        value = _object(
            value,
            f"fleet.groups.{name}",
            {"swap", "exclusive", "persistent", "purpose"},
            {"swap", "exclusive", "persistent"},
        )
        for key in ("swap", "exclusive", "persistent"):
            if not isinstance(value[key], bool):
                raise FleetError(f"fleet.groups.{name}.{key}: expected true or false")
        if value["exclusive"] and not value["swap"]:
            raise FleetError(f"fleet.groups.{name}: exclusive requires swap")
        if value["persistent"] and value["swap"]:
            raise FleetError(f"fleet.groups.{name}: a persistent group cannot swap")
        members = tuple(role for role in ROLE_ORDER if models[role].group == name)
        groups[name] = GroupPolicy(
            name=name,
            swap=value["swap"],
            exclusive=value["exclusive"],
            persistent=value["persistent"],
            purpose=str(value.get("purpose", "")),
            members=members,
        )
    return groups


def _load_modes(raw: Any, models: dict[str, ModelRoute]) -> dict[str, Mode]:
    if not isinstance(raw, dict) or not raw:
        raise FleetError("fleet.modes must be a non-empty object")
    modes: dict[str, Mode] = {}
    for name, value in raw.items():
        if not SLUG.match(name):
            raise FleetError(f"fleet.modes: invalid mode name {name!r}")
        value = _object(
            value,
            f"fleet.modes.{name}",
            {"description", "primary", "warmup"},
            {"description", "primary", "warmup"},
        )
        description = value["description"]
        if not isinstance(description, dict) or set(description) != {"en", "bn"}:
            raise FleetError(f"fleet.modes.{name}.description must be {{en, bn}}")
        for lang in ("en", "bn"):
            _text(description[lang], f"fleet.modes.{name}.description.{lang}")
        primary = _text(value["primary"], f"fleet.modes.{name}.primary")
        if primary not in models:
            raise FleetError(f"fleet.modes.{name}.primary: unknown route {primary!r}")
        warmup = value["warmup"]
        if not isinstance(warmup, list) or not warmup:
            raise FleetError(f"fleet.modes.{name}.warmup must be a non-empty array")
        seen: list[str] = []
        for item in warmup:
            if item not in models:
                raise FleetError(f"fleet.modes.{name}.warmup: unknown route {item!r}")
            if item in seen:
                raise FleetError(f"fleet.modes.{name}.warmup: duplicate route {item!r}")
            seen.append(item)
        if primary not in seen:
            raise FleetError(f"fleet.modes.{name}.warmup must include the primary route {primary!r}")
        modes[name] = Mode(
            name=name,
            primary=primary,
            warmup=tuple(seen),
            description={lang: description[lang] for lang in ("en", "bn")},
        )
    return modes


# -- rendering -------------------------------------------------------------


def render_llama_swap(fleet: Fleet) -> str:
    """Deterministic llama-swap YAML for this fleet (the committed product artifact)."""
    lines: list[str] = [
        "# Generated from spec/models/fleet.json + registry.json by tools/serving/fleet.py.",
        "# Do not edit - regenerate: python tools/serving/fleet.py",
        "#",
        "# Fleet v1: one GPU model resident at a time (chat/repair swap); embed/rerank are",
        "# pinned to CPU and persistent. Evidence: docs/spikes/S2-serve.md.",
        "",
        f"healthCheckTimeout: {fleet.health_check_timeout}",
        f"logLevel: {fleet.log_level}",
        f'logTimeFormat: "{fleet.log_time_format}"',
        f"sendLoadingState: {'true' if fleet.send_loading_state else 'false'}",
        "",
        "macros:",
        f'  "llama-server": "${{env.{fleet.install_root_env}}}/{fleet.macros["llama-server"]}"',
        f'  "models": "${{env.{fleet.install_root_env}}}/{fleet.macros["models"]}"',
        "",
        "models:",
    ]
    for role in ROLE_ORDER:
        route = fleet.routes[role]
        lines.extend(
            [
                f'  "{role}":',
                f'    name: "{route.display_name}"',
                "    cmd: |",
                f"      ${{llama-server}} --host {fleet.host} --port ${{PORT}}",
                f"      -m ${{models}}/{route.artifact_file}",
                f"      -ngl {route.gpu_layers} -c {route.context} -np {fleet.parallel}"
                + (f" {' '.join(route.flags)}" if route.flags else ""),
                f"    ttl: {fleet.ttl}",
                f"    # {route.id} | sha256 {route.sha256}",
            ]
        )
        if role == "rerank":
            lines.extend(["    capabilities:", "      reranker: true"])
    lines.extend(["", "routing:", "  router:", "    use: group", "    settings:", "      groups:"])
    for name, group in fleet.groups.items():
        lines.extend(
            [
                f'        "{name}":',
                f"          swap: {'true' if group.swap else 'false'}",
                f"          exclusive: {'true' if group.exclusive else 'false'}",
                f"          persistent: {'true' if group.persistent else 'false'}",
                f"          members: [{', '.join(json.dumps(role) for role in group.members)}]",
            ]
        )
    return "\n".join(lines) + "\n"


def write_fleet(fleet: Fleet) -> pathlib.Path:
    """Write the rendered config (LF, UTF-8) next to the fleet source."""
    path = fleet.generated_path
    path.write_text(render_llama_swap(fleet), encoding="utf-8", newline="\n")
    return path


def is_fresh(fleet: Fleet) -> bool:
    """True when the committed router config equals the current render."""
    path = fleet.generated_path
    if not path.exists():
        return False
    return path.read_text(encoding="utf-8") == render_llama_swap(fleet)
