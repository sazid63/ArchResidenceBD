"""Console encoding helper: BN+EN text must survive a captured Windows pipe."""

from __future__ import annotations

import io
import sys

from archres_core.stdio import utf8_stdio


def test_the_real_stdout_accepts_bangla(tmp_path) -> None:
    """The failure this prevents: printing a clause to a cp1252 pipe."""
    import os
    import subprocess

    code = (
        "import sys\n"
        "from archres_core.stdio import utf8_stdio\n"
        "utf8_stdio()\n"
        "print('গাজেট পৃষ্ঠা ৩০৪০')\n"
    )
    env = dict(os.environ)
    env.update({"PYTHONIOENCODING": "cp1252", "PYTHONUTF8": "0"})
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    assert "গাজেট" in result.stdout


def test_streams_that_cannot_be_reconfigured_are_left_alone() -> None:
    """A test double or a detached stream must not crash the tool."""
    utf8_stdio((io.StringIO(), sys.__stdout__, None))


def test_reconfigure_is_applied_to_a_writable_text_stream() -> None:
    class Recorder(io.StringIO):
        encoding = "cp1252"

        def reconfigure(self, *, encoding: str) -> None:
            self.encoding = encoding

    stream = Recorder()
    utf8_stdio((stream,))
    assert stream.encoding == "utf-8"
