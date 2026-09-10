#!/usr/bin/env python3
"""Fail if taught capability names are missing from the live (or fixture) registry.

Does not write SCHEMA.md. Extra live capabilities are allowed.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

TAUGHT = ("list_trips", "create_trip")
DEFAULT_URL = "https://goyondo.run/api/agent/capabilities"


def names_from_payload(payload: object) -> set[str]:
    if not isinstance(payload, dict):
        raise ValueError("capabilities payload must be a JSON object")
    caps = payload.get("capabilities")
    if not isinstance(caps, list):
        raise ValueError("payload.capabilities must be a list")
    names: set[str] = set()
    for item in caps:
        if isinstance(item, dict) and isinstance(item.get("name"), str):
            names.add(item["name"])
    return names


def missing(live_names: set[str], taught: tuple[str, ...] = TAUGHT) -> list[str]:
    return [name for name in taught if name not in live_names]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fixture",
        type=Path,
        help="Read a JSON registry from this file instead of fetching",
    )
    parser.add_argument("--url", default=DEFAULT_URL)
    args = parser.parse_args(argv)

    if args.fixture:
        payload = json.loads(args.fixture.read_text(encoding="utf-8"))
    else:
        with urllib.request.urlopen(args.url, timeout=30) as res:
            payload = json.loads(res.read().decode("utf-8"))

    absent = missing(names_from_payload(payload))
    if absent:
        print("Taught capabilities missing from registry:", ", ".join(absent), file=sys.stderr)
        return 1
    print("OK:", ", ".join(TAUGHT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
