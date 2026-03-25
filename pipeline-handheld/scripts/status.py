#!/usr/bin/env python3
"""Status reader for the emergency bootstrap network."""

import json
import os

STATE_DIR = os.path.join(os.path.dirname(__file__), '..', 'state')
STATUS_FILE = os.path.join(STATE_DIR, 'status.json')

def read_status():
    if not os.path.exists(STATUS_FILE):
        print("No status.json found. Pipeline not started.")
        return

    with open(STATUS_FILE, 'r') as f:
        status = json.load(f)

    print(f"=== {status.get('project_name', 'Unnamed Project')} ===")
    print(f"Schema: v{status.get('schema_version', '?')}")
    print(f"Current phase: {status.get('phase', '?')}")
    print(f"Last updated: {status.get('last_updated', 'never')}")
    print()

    # Phase overview
    print("PHASES:")
    phases = status.get('phases', {})
    phase_icons = {
        "done": "✓",
        "in_progress": "→",
        "failed": "✗",
        "pending": "·",
    }
    for phase, state in phases.items():
        icon = phase_icons.get(state, "?")
        print(f"  {icon} {phase}: {state}")
    print()

    # Slices
    slices = status.get('slices', {})
    if slices:
        print("SLICES:")
        for name, info in slices.items():
            s = info.get('status', '?')
            attempts = info.get('attempts', 0)
            icon = {
                "built": "✓",
                "patched": "✓",
                "building": "→",
                "fixing": "⚡",
                "blocked": "✗",
                "failed": "✗",
                "pending": "·",
            }.get(s, "?")
            line = f"  {icon} {name}: {s} (attempts: {attempts})"
            if info.get('last_error'):
                line += f" — {info['last_error']}"
            if info.get('display_name') and info['display_name'] != name:
                line += f" [{info['display_name']}]"
            print(line)
        print()

    if status.get('notes'):
        print(f"Notes: {status['notes']}")

if __name__ == '__main__':
    read_status()
