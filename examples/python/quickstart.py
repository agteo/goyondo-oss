#!/usr/bin/env python3
"""Device auth (if needed) → list_trips. Optional: --create"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
env_path = ROOT / ".env"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

BASE = os.environ.get("GOYONDO_BASE_URL", "https://goyondo.run")
TOKEN = os.environ.get("GOYONDO_API_KEY", "").strip()
CREATE = "--create" in sys.argv


def request_token() -> str:
    device = requests.post(
        f"{BASE}/api/agent-auth/device",
        json={
            "agent_name": "goyondo-agent-examples",
            "requested_scopes": ["trips:read", "trips:write"],
        },
        timeout=30,
    ).json()
    print("Ask the user to open:", device["verification_uri_complete"])
    interval = int(device.get("interval") or 5)
    while True:
        res = requests.post(
            f"{BASE}/api/agent-auth/token",
            json={"device_code": device["device_code"]},
            timeout=30,
        )
        body = res.json()
        if res.status_code == 200 and body.get("access_token"):
            print("Store this token now (one-time reveal). Example: GOYONDO_API_KEY in .env")
            return body["access_token"]
        if body.get("error") == "authorization_pending":
            time.sleep(interval)
            continue
        raise SystemExit(f"Token poll failed ({res.status_code}): {body}")


def task(token: str, payload: dict) -> dict:
    res = requests.post(
        f"{BASE}/api/agent/task",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
        timeout=60,
    )
    data = res.json()
    print(json.dumps(data, indent=2))
    res.raise_for_status()
    return data


def main() -> None:
    token = TOKEN or request_token()
    print("=== list_trips ===")
    task(token, {"capability": "list_trips", "arguments": {}})
    if CREATE:
        print("=== create_trip (skip_ai_generation) ===")
        task(
            token,
            {
                "capability": "create_trip",
                "arguments": {
                    "destination": "Kyoto",
                    "start_date": "2026-11-01",
                    "end_date": "2026-11-03",
                    "travelers": 1,
                    "skip_ai_generation": True,
                },
            },
        )


if __name__ == "__main__":
    main()
