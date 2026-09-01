#!/usr/bin/env python3
"""Run Eve's required real-browser release gate."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TESTS = [
    ROOT / "tests" / "browser" / "first_run_setup_playwright.py",
    ROOT / "tests" / "browser" / "golden_journey_playwright.py",
    ROOT / "tests" / "browser" / "participant_recovery_playwright.py",
    ROOT / "tests" / "browser" / "study_theme_playwright.py",
]

for test in TESTS:
    print(f"\n=== {test.name} ===", flush=True)
    result = subprocess.run([sys.executable, str(test)], cwd=ROOT)
    if result.returncode:
        raise SystemExit(result.returncode)

print("\nEve v58 real-browser release gate passed")
