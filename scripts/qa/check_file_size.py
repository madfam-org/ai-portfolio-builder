#!/usr/bin/env python3
"""File-size gate: warn above 600 lines, fail above 800 (MADFAM CI policy; stdlib only).

Measures source under apps/ and scripts/ with the extensions below;
skips node_modules, dist and generated declaration files. Prints a read-proof line and fails when
zero files were measured.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

EXTS = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".css", ".py", ".sh"}
SKIP_PARTS = {"node_modules", "dist", ".next", "__pycache__"}
ROOTS = ("apps", "scripts")


def measure(root: Path) -> list[tuple[Path, int]]:
    out: list[tuple[Path, int]] = []
    for top in ROOTS:
        base = root / top
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*")):
            if not p.is_file() or p.suffix not in EXTS or p.name.endswith(".d.ts"):
                continue
            if any(part in SKIP_PARTS for part in p.relative_to(root).parts):
                continue
            with p.open(encoding="utf-8", errors="replace") as fh:
                out.append((p.relative_to(root), sum(1 for _ in fh)))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(Path(__file__).resolve().parents[2]))
    ap.add_argument("--warn-at", type=int, default=600)
    ap.add_argument("--fail-at", type=int, default=800)
    a = ap.parse_args()
    rows = measure(Path(a.root))
    warn = [(p, n) for p, n in rows if a.warn_at < n <= a.fail_at]
    fail = [(p, n) for p, n in rows if n > a.fail_at]
    for p, n in warn:
        print(f"WARN {n:5d} {p}")
    for p, n in fail:
        print(f"FAIL {n:5d} {p}")
    verdict = "OK" if rows and not fail else "FAIL"
    print(f"file_size: files={len(rows)} warn={len(warn)} fail={len(fail)} {verdict}")
    return 0 if verdict == "OK" else 1


if __name__ == "__main__":
    sys.exit(main())
