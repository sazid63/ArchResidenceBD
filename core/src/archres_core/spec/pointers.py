"""RFC 6901 JSON Pointers + the write operations the spec engine uses (W1.3).

Only what the spec engine needs: read (resolve), and the JSON-Patch-style writes
add/replace/remove with full `~0` / `~1` escaping and array semantics (`-` = append).
Every helper that is not a root operation mutates the given document in place - the
engine always calls them on a deep copy.
"""

from __future__ import annotations

from typing import Any


class PointerError(ValueError):
    """A pointer that cannot be parsed or does not resolve."""


def _unescape(token: str) -> str:
    if "~" not in token:
        return token
    out: list[str] = []
    i = 0
    while i < len(token):
        ch = token[i]
        if ch == "~":
            nxt = token[i + 1] if i + 1 < len(token) else ""
            if nxt == "0":
                out.append("~")
                i += 2
            elif nxt == "1":
                out.append("/")
                i += 2
            else:
                raise PointerError(f"invalid escape '~{nxt}' in token {token!r}")
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def escape_token(token: str) -> str:
    """Escape one reference token for use inside a pointer (RFC 6901)."""
    return token.replace("~", "~0").replace("/", "~1")


def parse_pointer(pointer: str) -> list[str]:
    """Parse a JSON Pointer into reference tokens. '' is the whole document."""
    if pointer == "":
        return []
    if not pointer.startswith("/"):
        raise PointerError(f"pointer must start with '/': {pointer!r}")
    return [_unescape(token) for token in pointer.split("/")[1:]]


def _array_index(token: str, length: int, *, allow_append: bool = False) -> int:
    if allow_append and token == "-":
        return length
    if not token.isdigit() or (len(token) > 1 and token[0] == "0"):
        raise PointerError(f"invalid array index {token!r}")
    index = int(token)
    if index > length or (index == length and not allow_append):
        raise PointerError(f"array index {index} out of range (length {length})")
    return index


def _descend(current: Any, token: str, pointer: str) -> Any:
    if isinstance(current, dict):
        if token not in current:
            raise PointerError(f"{pointer!r}: token {token!r} not found")
        return current[token]
    if isinstance(current, list):
        if token == "-":
            raise PointerError(f"{pointer!r}: '-' has no value to read")
        return current[_array_index(token, len(current))]
    raise PointerError(f"{pointer!r}: cannot descend into a scalar at token {token!r}")


def resolve(document: Any, pointer: str) -> Any:
    """Read the value at pointer; raises PointerError when it does not resolve."""
    current = document
    for token in parse_pointer(pointer):
        current = _descend(current, token, pointer)
    return current


def _navigate_parent(document: Any, pointer: str) -> tuple[Any, str]:
    tokens = parse_pointer(pointer)
    if not tokens:
        raise PointerError(f"{pointer!r}: the document root has no parent")
    current = document
    for token in tokens[:-1]:
        current = _descend(current, token, pointer)
    return current, tokens[-1]


def add(document: Any, pointer: str, value: Any) -> Any:
    """JSON-Patch 'add'. Returns the (possibly new) document - root add replaces it."""
    if pointer == "":
        return value
    parent, token = _navigate_parent(document, pointer)
    if isinstance(parent, dict):
        parent[token] = value
    elif isinstance(parent, list):
        parent.insert(_array_index(token, len(parent), allow_append=True), value)
    else:
        raise PointerError(f"{pointer!r}: parent is a scalar")
    return document


def replace(document: Any, pointer: str, value: Any) -> Any:
    """JSON-Patch 'replace'; the target must already exist."""
    if pointer == "":
        return value
    parent, token = _navigate_parent(document, pointer)
    if isinstance(parent, dict):
        if token not in parent:
            raise PointerError(f"{pointer!r}: token {token!r} not found")
        parent[token] = value
    elif isinstance(parent, list):
        parent[_array_index(token, len(parent))] = value
    else:
        raise PointerError(f"{pointer!r}: parent is a scalar")
    return document


def remove(document: Any, pointer: str) -> Any:
    """JSON-Patch 'remove'; returns the removed value."""
    parent, token = _navigate_parent(document, pointer)
    if isinstance(parent, dict):
        if token not in parent:
            raise PointerError(f"{pointer!r}: token {token!r} not found")
        return parent.pop(token)
    if isinstance(parent, list):
        return parent.pop(_array_index(token, len(parent)))
    raise PointerError(f"{pointer!r}: parent is a scalar")
