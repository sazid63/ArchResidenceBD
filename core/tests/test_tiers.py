"""The tier detection (W5.3): measured, never assumed.

The laws these tests hold:

- **a tier the installer cannot verify is a tier it does not claim** — the detection names
  a tier only when it measured it;
- **the CPU tier always works** — a machine nothing can be read from still gets a tier, and
  the reason says the GPU probes found nothing;
- **every name carries its evidence** — the answer says what it was measured with.
"""

from __future__ import annotations

import pathlib
import shutil

from archres_core.tiers import (
    TIER_CPU,
    TIER_CUDA,
    TIER_UNKNOWN,
    TIER_VULKAN,
    detect_tier,
    tier_document,
)


def test_the_detection_names_a_tier_and_its_evidence() -> None:
    detection = detect_tier(run_probes=False)
    assert detection.tier == TIER_CPU
    assert detection.known is True
    assert detection.findings
    finding = detection.findings[-1]
    assert finding.name == TIER_CPU
    assert finding.evidence
    assert "CPU tier" in detection.reason


def test_a_machine_with_no_probes_still_gets_a_tier() -> None:
    """Unknown is a real answer, but the CPU tier is always there."""
    detection = detect_tier(run_probes=False)
    assert detection.tier != TIER_UNKNOWN
    assert "no GPU tier was measured" in detection.reason


def test_the_cuda_tier_is_claimed_only_when_measured(monkeypatch) -> None:
    """The rule: a tier the installer cannot verify is a tier it does not claim."""

    class _Result:
        returncode = 0
        stdout = "NVIDIA GeForce RTX 3060, 12288 MiB, 551.23\n"

    monkeypatch.setattr(shutil, "which", lambda name: "/usr/bin/nvidia-smi" if name == "nvidia-smi" else None)
    monkeypatch.setattr("archres_core.tiers.subprocess.run", lambda *a, **k: _Result())
    detection = detect_tier()
    assert detection.tier == TIER_CUDA
    assert "RTX 3060" in detection.reason
    assert detection.findings[0].evidence == "nvidia-smi --query-gpu"


def test_a_vulkan_tier_is_claimed_only_when_the_loader_is_there(monkeypatch, tmp_path) -> None:
    """Vulkan is measured by the loader's presence - and the driver by its own report."""
    monkeypatch.setattr(shutil, "which", lambda name: None)
    monkeypatch.setenv("SystemRoot", str(tmp_path))
    (tmp_path / "System32").mkdir()
    (tmp_path / "System32" / "vulkan-1.dll").write_bytes(b"MZ")
    detection = detect_tier()
    assert detection.tier == TIER_VULKAN
    assert "Vulkan" in detection.reason
    assert detection.findings[0].evidence == "vulkan-1.dll"


def test_a_broken_probe_does_not_claim_a_tier(monkeypatch) -> None:
    """A probe that fails is a probe that found nothing - not a claim."""
    monkeypatch.setattr(shutil, "which", lambda name: "/usr/bin/nvidia-smi" if name == "nvidia-smi" else None)
    monkeypatch.setenv("SystemRoot", "/nonexistent")

    class _Broken:
        returncode = 1
        stdout = ""

    monkeypatch.setattr("archres_core.tiers.subprocess.run", lambda *a, **k: _Broken())
    detection = detect_tier()
    assert detection.tier == TIER_CPU
    assert "no GPU tier was measured" in detection.reason


def test_the_detection_is_a_document() -> None:
    document = tier_document(detect_tier(run_probes=False))
    assert document["tier"] == TIER_CPU
    assert document["known"] is True
    assert document["findings"]
    assert document["schemaVersion"] == "0.1.0"
