"""The licence-notice guard: the app's legal surface matches the third-party register.

ADR-0004 puts the required licence notices on **one** legal surface (the app's Licences
screen) and the register of bundled components in the repo (``docs/licenses/THIRD_PARTY.md``).
Two copies of a legal fact is one copy too many, so this guard holds them together:

- every component the app names in ``app/src/legal/notices.ts`` is in the register, with the
  licence the register gives it;
- no notice carries a licence the register has not verified - a licence still "to verify" is
  a candidate, and a candidate is not a notice.

The brand guard (ADR-0004) holds the other half: the engine's name appears nowhere in the
app except this legal path.

Run from the repo root:  python tools/ci/licence_notice_guard.py
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
REGISTER = ROOT / "docs" / "licenses" / "THIRD_PARTY.md"
NOTICES = ROOT / "app" / "src" / "legal" / "notices.ts"

#: A row of the register's table: | component | role | licence | status |
ROW = re.compile(r"^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$")
#: A notice in the app's legal module.
FIELD = re.compile(r'^\s*(id|component|licence|status):\s*"([^"]*)",\s*$')


def _register_rows() -> list[tuple[str, str]]:
    """The register's components and their licences."""
    rows: list[tuple[str, str]] = []
    for line in REGISTER.read_text(encoding="utf-8").splitlines():
        match = ROW.match(line)
        if not match:
            continue
        component, _role, licence, _status = (part.strip() for part in match.groups())
        if component.startswith("-") or component == "Component":
            continue
        rows.append((component, licence))
    return rows


def _notices() -> list[dict[str, str]]:
    """The app's notices, as the legal module declares them."""
    out: list[dict[str, str]] = []
    current: dict[str, str] = {}
    for line in NOTICES.read_text(encoding="utf-8").splitlines():
        match = FIELD.match(line)
        if not match:
            continue
        key, value = match.group(1), match.group(2)
        if key == "id":
            if current:
                out.append(current)
            current = {"id": value}
            continue
        current[key] = value
    if current:
        out.append(current)
    return out


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if not REGISTER.is_file():
        print(f"FAIL the third-party register is missing: {REGISTER}")
        return 1
    if not NOTICES.is_file():
        print(f"FAIL the app's legal module is missing: {NOTICES}")
        return 1

    rows = _register_rows()
    if not rows:
        print("FAIL the third-party register has no component rows")
        return 1
    notices = _notices()
    if not notices:
        print("FAIL the app's legal module declares no notices")
        return 1

    problems: list[str] = []
    for notice in notices:
        component = notice.get("component", "")
        licence = notice.get("licence", "")
        row = next((item for item in rows if item[0].startswith(component)), None)
        if row is None:
            problems.append(f"{component}: not in the register ({REGISTER.name})")
            continue
        if licence not in row[1]:
            problems.append(
                f"{component}: the app says {licence!r}, the register says {row[1]!r}"
            )
        if "to verify" in row[1].lower():
            problems.append(
                f"{component}: the register's licence is not verified yet ({row[1]!r}) - a "
                "candidate is not a notice"
            )

    if problems:
        print("FAIL the app's licence notices and the register disagree:")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print(
        f"licence notice guard clean - {len(notices)} notice(s) match the register "
        f"({len(rows)} component(s))"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
