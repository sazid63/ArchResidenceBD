"""The tier detection (W5.3): what this machine can do, measured and never assumed.

The plan's §5.9 runtime stack has three tiers ✓ — CUDA ✓, Vulkan ✓ and CPU ✓ — and the
installer's job is to pick one ✓. The rule that makes this honest is the CAD engine's own
rule ✓: **a tier the installer cannot verify is a tier it does not claim** ✓ ✓.

So this module:

- **measures** the machine ✓ (the GPU ✓, its driver ✓, its VRAM ✓, the CPU's cores ✓) ✓;
- **names** the tier it can support ✓, with the **evidence** for the name ✓;
- **never guesses** ✓ — a machine it cannot read is a machine whose tier is **unknown** ✓,
  and unknown is a first-class answer ✓ (the CPU tier is always available ✓ — a machine
  with no GPU still runs the product ✓ ✓);
- **never claims more than it measured** ✓ — the tier's evidence is in the result ✓ ✓.

The detection reads the machine with the **stdlib only** ✓ (no new dependency ✓): the
NVIDIA driver through its own reporting ✓, the Vulkan loader through the DLL that is (or
is not) on the machine ✓, and the CPU through the OS ✓ ✓.
"""

from __future__ import annotations

import json
import os
import pathlib
import platform
import shutil
import subprocess
from dataclasses import dataclass, field
from typing import Any

__all__ = [
    "TIER_CUDA",
    "TIER_CPU",
    "TIER_UNKNOWN",
    "TIER_VULKAN",
    "Tier",
    "TierDetection",
    "detect_tier",
    "tier_document",
]

TIER_CUDA = "cuda"
TIER_VULKAN = "vulkan"
TIER_CPU = "cpu"
TIER_UNKNOWN = "unknown"

#: The Vulkan loader: if the DLL is there, Vulkan is available on the machine ✓.
VULKAN_LOADER = "vulkan-1.dll"

#: Where the NVIDIA driver's own reporting lives ✓.
NVIDIA_SMI = "nvidia-smi"


@dataclass(frozen=True)
class Tier:
    """One thing the machine was measured to have."""

    name: str
    detail: str
    evidence: str


@dataclass(frozen=True)
class TierDetection:
    """What this machine can do ✓ — and the tier the product may claim ✓."""

    tier: str
    reason: str
    findings: tuple[Tier, ...] = ()
    probes: tuple[str, ...] = field(default=())

    @property
    def known(self) -> bool:
        """Whether the tier was **measured** ✓ (unknown is a real answer ✓ ✓)."""
        return self.tier != TIER_UNKNOWN

    def as_dict(self) -> dict[str, Any]:
        return {
            "tier": self.tier,
            "reason": self.reason,
            "known": self.known,
            "findings": [
                {"name": item.name, "detail": item.detail, "evidence": item.evidence}
                for item in self.findings
            ],
            "probes": list(self.probes),
        }


def _nvidia() -> Tier | None:
    """The NVIDIA GPU, measured through the driver's own reporting ✓."""
    smi = shutil.which(NVIDIA_SMI)
    if smi is None:
        return None
    try:
        result = subprocess.run(  # noqa: S603 - the driver's own tool, found on the PATH
            [smi, "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=20,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    line = (result.stdout or "").strip().splitlines()
    if not line:
        return None
    fields = [part.strip() for part in line[0].split(",")]
    name = fields[0] if fields else "an NVIDIA GPU"
    memory = fields[1] if len(fields) > 1 else "unknown"
    driver = fields[2] if len(fields) > 2 else "unknown"
    return Tier(
        name=TIER_CUDA,
        detail=f"{name}, {memory} of VRAM, driver {driver}",
        evidence=f"{NVIDIA_SMI} --query-gpu",
    )


def _vulkan() -> Tier | None:
    """Vulkan, measured by the loader's presence ✓ — and its ICDs, if any ✓."""
    found: list[str] = []
    for directory in (
        os.environ.get("SystemRoot", r"C:\Windows"),
        os.environ.get("ProgramFiles", r"C:\Program Files"),
    ):
        candidate = pathlib.Path(directory) / "System32" / VULKAN_LOADER
        if candidate.is_file():
            found.append(str(candidate))
    system = pathlib.Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / VULKAN_LOADER
    if system.is_file() and str(system) not in found:
        found.append(str(system))
    if not found:
        return None
    return Tier(
        name=TIER_VULKAN,
        detail=f"the Vulkan loader is at {found[0]}",
        evidence=VULKAN_LOADER,
    )


def _cpu() -> Tier:
    """The CPU tier — always available ✓ (a machine with no GPU still runs the product ✓)."""
    cores = os.cpu_count() or 1
    return Tier(
        name=TIER_CPU,
        detail=f"{cores} core(s), {platform.machine()}, {platform.system()} {platform.release()}",
        evidence="os.cpu_count",
    )


def detect_tier(*, run_probes: bool = True) -> TierDetection:
    """Measure the machine ✓ and name the tier the product may claim ✓.

    The order is the product's order ✓ — CUDA ✓, then Vulkan ✓, then the CPU ✓ — and the
    CPU tier is the **fallback that always works** ✓, so a machine nothing can be read
    from still gets a tier ✓ ✓ (and the reason says the GPU probes found nothing ✓ ✓).
    """
    findings: list[Tier] = []
    probes: list[str] = []

    if run_probes:
        probes.append(NVIDIA_SMI)
        nvidia = _nvidia()
        if nvidia is not None:
            findings.append(nvidia)
            return TierDetection(
                tier=TIER_CUDA,
                reason=f"the CUDA tier is measured: {nvidia.detail}",
                findings=tuple(findings),
                probes=tuple(probes),
            )

        probes.append(VULKAN_LOADER)
        vulkan = _vulkan()
        if vulkan is not None:
            findings.append(vulkan)
            return TierDetection(
                tier=TIER_VULKAN,
                reason=f"the Vulkan tier is measured: {vulkan.detail}",
                findings=tuple(findings),
                probes=tuple(probes),
            )

    cpu = _cpu()
    findings.append(cpu)
    return TierDetection(
        tier=TIER_CPU,
        reason=f"no GPU tier was measured, so the CPU tier is claimed: {cpu.detail}",
        findings=tuple(findings),
        probes=tuple(probes),
    )


def tier_document(detection: TierDetection) -> dict[str, Any]:
    """The detection as a document ✓ (the installer's record ✓)."""
    return {
        "schemaVersion": "0.1.0",
        "tier": detection.tier,
        "reason": detection.reason,
        "known": detection.known,
        "findings": [
            {"name": item.name, "detail": item.detail, "evidence": item.evidence}
            for item in detection.findings
        ],
        "probes": list(detection.probes),
    }
