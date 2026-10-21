"""The compliance reports (W3.6): the audit an engineer reads, and the Deviation Register.

The rule engine (W1.2) produces a **verdict set** and the spec carries the **Deviation
Register**; the plan's deliverables are the two *reports* that a human reads (plan §6:
"Compliance audit + Deviation Register (compliant items with citations / deviations with rule,
risk tier, acknowledgment, timestamp)").

Three laws:

- **Nothing is dropped.** The audit lists the compliant items *with their citations*, the
  deviations with the rule they left behind, and the pack's own **declared gaps** as
  "not evaluated" — a gap is a gap, never a silent pass (plan §9).
- **The report says what it is.** The pack's id, its **sha256**, its status (the v0 pack is a
  *candidate* — engineer validation pending) and the spec's revision and hash travel with the
  report, so a reader knows exactly which rules and which project it is about.
- **The Bangla is the pack's own text, not a translation.** The verdict's title and summary
  carry the pack's hand-authored Bangla; the report renders them. The HTML is the plan's route
  to a correct PDF (plan §6: "Bangla reports via HTML→print-PDF for correct glyph shaping"), and
  the numbers are written in **Bangla numerals** — which is also what the plan's §9 asks the
  rendering regression to keep honest.
"""

from __future__ import annotations

import html
from typing import Any

#: The Bangla digits (the report writes its numbers the way a Bengali engineer reads them).
BN_DIGITS = "০১২৩৪৫৬৭৮৯"

#: The font stack the Bangla report asks for (plan §5.1: Noto Sans Bengali).
FONT_STACK = "'Noto Sans Bengali', 'Hind Siliguri', 'Kalpurush', sans-serif"

#: The risk tiers and what they mean to a reader (plan §2.1; `cost_risk` is W2.7's).
RISK_TIERS = {
    "cosmetic": "Cosmetic — nothing structural or regulatory is at stake",
    "approval_risk": "Approval risk — the regulator may see this",
    "structural_attention": "Structural attention — an engineer must look at this",
    "cost_risk": "Cost risk — the project's money, not its compliance",
}

#: The report's headings, in English and in Bangla (hand-authored).
LABELS = {
    "en": {
        "audit": "Compliance audit",
        "register": "Deviation Register",
        "project": "Project",
        "pack": "Rule pack",
        "packStatus": "Pack status",
        "spec": "Building Spec",
        "evaluated": "Evaluated",
        "evaluator": "Evaluator",
        "summary": "Summary",
        "compliant": "Compliant",
        "deviation": "Deviation",
        "impossible": "Impossible",
        "notEvaluated": "Not evaluated (the pack declares these gaps)",
        "rule": "Rule",
        "title": "Provision",
        "citations": "Citations",
        "measured": "Measured",
        "actual": "Actual",
        "limit": "Limit",
        "rationale": "Reason",
        "risk": "Risk tier",
        "acknowledged": "Acknowledged",
        "recordedAt": "Recorded",
        "alternative": "Nearest compliant alternative",
        "none": "none",
        "yes": "yes",
        "no": "no",
    },
    "bn": {
        "audit": "কমপ্লায়েন্স অডিট",
        "register": "ডেভিয়েশন রেজিস্টার",
        "project": "প্রকল্প",
        "pack": "রুল প্যাক",
        "packStatus": "প্যাকের অবস্থা",
        "spec": "বিল্ডিং স্পেক",
        "evaluated": "মূল্যায়নের সময়",
        "evaluator": "মূল্যায়নকারী",
        "summary": "সারসংক্ষেপ",
        "compliant": "সম্মত",
        "deviation": "বিচ্যুতি",
        "impossible": "অসম্ভব",
        "notEvaluated": "মূল্যায়ন হয়নি (প্যাক নিজেই এই ফাঁকগুলো ঘোষণা করেছে)",
        "rule": "নিয়ম",
        "title": "বিধান",
        "citations": "সূত্র",
        "measured": "পরিমাপ",
        "actual": "প্রকৃত মান",
        "limit": "সীমা",
        "rationale": "কারণ",
        "risk": "ঝুঁকির স্তর",
        "acknowledged": "স্বীকৃত",
        "recordedAt": "নথিভুক্ত",
        "alternative": "নিকটতম সম্মত বিকল্প",
        "none": "নেই",
        "yes": "হ্যাঁ",
        "no": "না",
    },
}


def bn_number(value: float | int | str) -> str:
    """A number in Bangla numerals (the report's own digits ✓)."""
    text = str(value)
    return "".join(BN_DIGITS[int(character)] if character.isdigit() else character for character in text)


def _labels(lang: str) -> dict[str, str]:
    return LABELS.get(lang, LABELS["en"])


def _localized(value: Any, lang: str) -> str:
    """A localized field as text in the requested language."""
    if isinstance(value, dict):
        return str(value.get(lang) or value.get("en") or value.get("bn") or "")
    return str(value or "")


def _escape(text: str) -> str:
    return html.escape(str(text), quote=True)


# ------------------------------------------------------------------ the audit report


def audit_sections(verdict_set: dict[str, Any], lang: str = "en") -> dict[str, list[dict[str, Any]]]:
    """The audit's content, grouped — the same data the markdown and the HTML render."""
    labels = _labels(lang)
    verdicts = verdict_set.get("verdicts") or []
    sections: dict[str, list[dict[str, Any]]] = {
        "compliant": [],
        "deviation": [],
        "impossible": [],
        "notEvaluated": [],
    }
    for verdict in verdicts:
        status = str(verdict.get("status") or "")
        if status not in sections:
            continue
        measured = verdict.get("measured") or {}
        limit = verdict.get("limit") or {}
        sections[status].append(
            {
                "ruleRef": str(verdict.get("ruleRef") or ""),
                "title": _localized(verdict.get("title"), lang),
                "summary": _localized(verdict.get("summary"), lang),
                "citations": [str(item) for item in verdict.get("citations") or []],
                "measured": _measured_text(measured),
                "limit": _limit_text(limit),
            }
        )
    for item in verdict_set.get("unevaluated") or []:
        sections["notEvaluated"].append(
            {
                "ruleRef": str(item.get("ruleRef") or ""),
                "title": str(item.get("detail") or item.get("reason") or ""),
                "summary": str(item.get("reason") or ""),
                "citations": [],
                "measured": "",
                "limit": "",
            }
        )
    return {"labels": labels, **sections}


def _measured_text(measured: dict[str, Any]) -> str:
    if not measured:
        return ""
    value = measured.get("value")
    unit = measured.get("unit") or ""
    path = measured.get("path") or ""
    text = f"{value} {unit}".strip()
    return f"{text} ({path})" if path else text


def _limit_text(limit: dict[str, Any]) -> str:
    if not limit:
        return ""
    symbol = {"max": "≤", "min": "≥", "exact": "="}.get(str(limit.get("comparator")), "")
    return f"{symbol} {limit.get('value')} {limit.get('unit') or ''}".strip()


def render_audit_markdown(verdict_set: dict[str, Any], *, lang: str = "en") -> str:
    """The compliance audit, as markdown (the reviewable text)."""
    labels = _labels(lang)
    sections = audit_sections(verdict_set, lang)
    pack = verdict_set.get("pack") or {}
    subject = verdict_set.get("subject") or {}
    summary = verdict_set.get("summary") or {}
    lines = [
        f"# {labels['audit']}",
        "",
        f"- **{labels['pack']}:** `{pack.get('id')}` (sha256 `{(pack.get('sha256') or '')[:12]}`"
        f", {labels['packStatus']}: **{pack.get('status')}**)",
        f"- **{labels['spec']}:** revision {subject.get('specRevision')}, "
        f"sha256 `{(subject.get('specSha256') or '')[:12]}`",
        f"- **{labels['evaluated']}:** {verdict_set.get('evaluatedAt')}",
        f"- **{labels['evaluator']}:** {verdict_set.get('evaluator')}",
        "",
        f"## {labels['summary']}",
        "",
        f"- {labels['compliant']}: {summary.get('compliant', 0)}",
        f"- {labels['deviation']}: {summary.get('deviation', 0)}",
        f"- {labels['impossible']}: {summary.get('impossible', 0)}",
        f"- {labels['notEvaluated']}: {len(sections['notEvaluated'])}",
        "",
    ]
    for key in ("compliant", "deviation", "impossible"):
        items = sections[key]
        if not items:
            continue
        lines += [f"## {labels[key]} ({len(items)})", ""]
        for item in items:
            lines.append(f"### `{item['ruleRef']}` — {item['title']}")
            lines.append("")
            if item["summary"]:
                lines.append(item["summary"])
                lines.append("")
            if item["measured"] or item["limit"]:
                lines.append(f"- {labels['measured']}: {item['measured'] or '-'}")
                lines.append(f"- {labels['limit']}: {item['limit'] or '-'}")
            if item["citations"]:
                lines.append(f"- {labels['citations']}: {', '.join(item['citations'])}")
            lines.append("")
    if sections["notEvaluated"]:
        lines += [f"## {labels['notEvaluated']} ({len(sections['notEvaluated'])})", ""]
        for item in sections["notEvaluated"]:
            lines.append(f"- `{item['ruleRef']}` — {item['title']}")
        lines.append("")
    return "\n".join(lines)


def render_audit_html(verdict_set: dict[str, Any], *, lang: str = "bn") -> str:
    """The compliance audit, as HTML (the plan's route to a correct Bangla PDF)."""
    labels = _labels(lang)
    sections = audit_sections(verdict_set, lang)
    pack = verdict_set.get("pack") or {}
    subject = verdict_set.get("subject") or {}
    summary = verdict_set.get("summary") or {}
    out = [
        "<!doctype html>",
        '<html lang="bn">',
        "<head>",
        '<meta charset="utf-8">',
        f"<title>{_escape(labels['audit'])}</title>",
        f"<style>body{{font-family:{FONT_STACK};margin:24px;line-height:1.5}}"
        "table{border-collapse:collapse;width:100%}"
        "th,td{border-bottom:1px solid #e9dfd1;padding:6px 8px;text-align:left;"
        "vertical-align:top}"
        "th{background:#f4ede2}"
        "code{font-family:ui-monospace,monospace}"
        ".meta{color:#6f6459;font-size:0.9em}</style>",
        "</head>",
        "<body>",
        f"<h1>{_escape(labels['audit'])}</h1>",
        f"<p class=\"meta\">{_escape(labels['pack'])}: <code>{_escape(str(pack.get('id')))}</code> "
        f"({_escape(labels['packStatus'])}: <strong>{_escape(str(pack.get('status')))}</strong>, "
        f"sha256 <code>{_escape(str(pack.get('sha256') or '')[:12])}</code>) · "
        f"{_escape(labels['spec'])}: revision {bn_number(subject.get('specRevision', 0))}, "
        f"sha256 <code>{_escape(str(subject.get('specSha256') or '')[:12])}</code> · "
        f"{_escape(labels['evaluated'])}: {bn_number(verdict_set.get('evaluatedAt') or '')}</p>",
        "<h2>"
        + _escape(labels["summary"])
        + "</h2><ul>",
        f"<li>{_escape(labels['compliant'])}: {bn_number(summary.get('compliant', 0))}</li>",
        f"<li>{_escape(labels['deviation'])}: {bn_number(summary.get('deviation', 0))}</li>",
        f"<li>{_escape(labels['impossible'])}: {bn_number(summary.get('impossible', 0))}</li>",
        f"<li>{_escape(labels['notEvaluated'])}: {bn_number(len(sections['notEvaluated']))}</li>",
        "</ul>",
    ]
    for key in ("compliant", "deviation", "impossible"):
        items = sections[key]
        if not items:
            continue
        out.append(f"<h2>{_escape(labels[key])} ({bn_number(len(items))})</h2>")
        out.append(
            "<table><thead><tr><th>"
            + _escape(labels["rule"])
            + "</th><th>"
            + _escape(labels["title"])
            + "</th><th>"
            + _escape(labels["measured"])
            + "</th><th>"
            + _escape(labels["limit"])
            + "</th><th>"
            + _escape(labels["citations"])
            + "</th></tr></thead><tbody>"
        )
        for item in items:
            out.append(
                "<tr><td><code>"
                + _escape(item["ruleRef"])
                + "</code></td><td>"
                + _escape(item["title"])
                + "<br><span class=\"meta\">"
                + _escape(item["summary"])
                + "</span></td><td>"
                + _escape(item["measured"] or "-")
                + "</td><td>"
                + _escape(item["limit"] or "-")
                + "</td><td>"
                + _escape(", ".join(item["citations"]) or "-")
                + "</td></tr>"
            )
        out.append("</tbody></table>")
    if sections["notEvaluated"]:
        out.append(f"<h2>{_escape(labels['notEvaluated'])}</h2><ul>")
        for item in sections["notEvaluated"]:
            out.append(
                "<li><code>" + _escape(item["ruleRef"]) + "</code> — " + _escape(item["title"]) + "</li>"
            )
        out.append("</ul>")
    out += ["</body>", "</html>"]
    return "\n".join(out) + "\n"


# ----------------------------------------------------------- the Deviation Register


def register_entries(spec: dict[str, Any]) -> list[dict[str, Any]]:
    """The register's entries, in the order the spec holds them."""
    entries: list[dict[str, Any]] = []
    for item in spec.get("deviations") or []:
        if not isinstance(item, dict):
            continue
        entries.append(
            {
                "id": str(item.get("id") or ""),
                "ruleRef": str(item.get("ruleRef") or ""),
                "ruleTitle": str(item.get("ruleTitle") or ""),
                "expected": str(item.get("expected") or ""),
                "actual": str(item.get("actual") or ""),
                "riskTier": str(item.get("riskTier") or ""),
                "rationale": str(item.get("rationale") or ""),
                "acknowledged": bool(item.get("acknowledged")),
                "recordedAt": str(item.get("recordedAt") or ""),
                "alternative": str(item.get("nearestCompliantAlternative") or ""),
                "phaseId": str(item.get("phaseId") or ""),
            }
        )
    return entries


def render_register_markdown(spec: dict[str, Any], *, lang: str = "en") -> str:
    """The Deviation Register, as markdown."""
    labels = _labels(lang)
    entries = register_entries(spec)
    lines = [
        f"# {labels['register']}",
        "",
        f"- {labels['project']}: {(spec.get('project') or {}).get('id')}",
        f"- {labels['spec']}: revision {spec.get('revision')}",
        f"- Entries: {len(entries)}",
        "",
    ]
    if not entries:
        lines += ["_none_", ""]
        return "\n".join(lines)
    for entry in entries:
        lines += [
            f"## `{entry['id']}` — {entry['ruleTitle'] or entry['ruleRef']}",
            "",
            f"- {labels['rule']}: `{entry['ruleRef']}`",
            f"- {labels['measured']}: {entry['expected']}",
            f"- {labels['actual']}: {entry['actual']}",
            f"- {labels['risk']}: **{entry['riskTier']}** — "
            + RISK_TIERS.get(entry["riskTier"], ""),
            f"- {labels['rationale']}: {entry['rationale'] or '-'}",
            f"- {labels['acknowledged']}: {labels['yes'] if entry['acknowledged'] else labels['no']}",
            f"- {labels['recordedAt']}: {entry['recordedAt']}",
        ]
        if entry["alternative"]:
            lines.append(f"- {labels['alternative']}: {entry['alternative']}")
        lines.append("")
    return "\n".join(lines)


def render_register_html(spec: dict[str, Any], *, lang: str = "bn") -> str:
    """The Deviation Register, as HTML (the plan's route to a correct Bangla PDF)."""
    labels = _labels(lang)
    entries = register_entries(spec)
    out = [
        "<!doctype html>",
        '<html lang="bn">',
        "<head>",
        '<meta charset="utf-8">',
        f"<title>{_escape(labels['register'])}</title>",
        f"<style>body{{font-family:{FONT_STACK};margin:24px;line-height:1.5}}"
        "table{border-collapse:collapse;width:100%}"
        "th,td{border-bottom:1px solid #e9dfd1;padding:6px 8px;text-align:left;"
        "vertical-align:top}"
        "th{background:#f4ede2}"
        "code{font-family:ui-monospace,monospace}"
        ".meta{color:#6f6459;font-size:0.9em}</style>",
        "</head>",
        "<body>",
        f"<h1>{_escape(labels['register'])}</h1>",
        f"<p class=\"meta\">{_escape(labels['project'])}: "
        f"<code>{_escape(str((spec.get('project') or {}).get('id')))}</code> · "
        f"{_escape(labels['spec'])}: revision {bn_number(spec.get('revision', 0))} · "
        f"entries: {bn_number(len(entries))}</p>",
    ]
    if not entries:
        out.append(f"<p>{_escape(labels['none'])}</p>")
    else:
        out.append(
            "<table><thead><tr><th>"
            + _escape(labels["rule"])
            + "</th><th>"
            + _escape(labels["measured"])
            + "</th><th>"
            + _escape(labels["actual"])
            + "</th><th>"
            + _escape(labels["risk"])
            + "</th><th>"
            + _escape(labels["rationale"])
            + "</th><th>"
            + _escape(labels["acknowledged"])
            + "</th><th>"
            + _escape(labels["recordedAt"])
            + "</th></tr></thead><tbody>"
        )
        for entry in entries:
            out.append(
                "<tr><td><code>"
                + _escape(entry["id"])
                + "</code><br><span class=\"meta\">"
                + _escape(entry["ruleTitle"] or entry["ruleRef"])
                + "</span></td><td>"
                + _escape(entry["expected"])
                + "</td><td>"
                + _escape(entry["actual"])
                + "</td><td><strong>"
                + _escape(entry["riskTier"])
                + "</strong></td><td>"
                + _escape(entry["rationale"] or "-")
                + "</td><td>"
                + _escape(labels["yes"] if entry["acknowledged"] else labels["no"])
                + "</td><td>"
                + _escape(entry["recordedAt"])
                + "</td></tr>"
            )
        out.append("</tbody></table>")
    out += ["</body>", "</html>"]
    return "\n".join(out) + "\n"


__all__ = [
    "BN_DIGITS",
    "FONT_STACK",
    "LABELS",
    "RISK_TIERS",
    "audit_sections",
    "bn_number",
    "register_entries",
    "render_audit_html",
    "render_audit_markdown",
    "render_register_html",
    "render_register_markdown",
]
