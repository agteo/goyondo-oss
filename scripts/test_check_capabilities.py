#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from check_capabilities import main, missing, names_from_payload


def _write(payload: dict) -> Path:
    path = Path(tempfile.mkstemp(suffix=".json")[1])
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


class NamesFromPayload(unittest.TestCase):
    def test_extracts_names(self) -> None:
        names = names_from_payload(
            {"capabilities": [{"name": "list_trips"}, {"name": "create_trip"}, {"name": "get_trip"}]}
        )
        self.assertEqual(names, {"list_trips", "create_trip", "get_trip"})

    def test_rejects_non_object(self) -> None:
        with self.assertRaises(ValueError):
            names_from_payload([])


class Missing(unittest.TestCase):
    def test_extra_live_names_ok(self) -> None:
        self.assertEqual(missing({"list_trips", "create_trip", "get_trip"}), [])

    def test_missing_list_trips(self) -> None:
        self.assertEqual(missing({"create_trip"}), ["list_trips"])


class MainFixture(unittest.TestCase):
    def test_happy_exit_zero(self) -> None:
        path = _write({"capabilities": [{"name": "list_trips"}, {"name": "create_trip"}]})
        self.assertEqual(main(["--fixture", str(path)]), 0)

    def test_missing_name_exit_nonzero(self) -> None:
        path = _write({"capabilities": [{"name": "create_trip"}]})
        self.assertEqual(main(["--fixture", str(path)]), 1)

    def test_extra_capabilities_exit_zero(self) -> None:
        path = _write(
            {
                "capabilities": [
                    {"name": "list_trips"},
                    {"name": "create_trip"},
                    {"name": "add_activity"},
                ]
            }
        )
        self.assertEqual(main(["--fixture", str(path)]), 0)


if __name__ == "__main__":
    unittest.main()
