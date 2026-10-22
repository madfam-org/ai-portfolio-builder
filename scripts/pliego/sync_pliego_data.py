#!/usr/bin/env python3
"""Pliego paper data for cv: check (default) or refresh the vendored copies (stdlib only).

Pliego (github.com/madfam-org/pliego) OWNS paper physics: the stock cards in `materials/` and the
print-folds cartridge of its commons (github.com/madfam-org/sheet-hyperobjects, mounted at
`projects/`). cv consumes a small, pinned slice of it at build time, in
`apps/web/src/lib/pliego/vendor/` (CERN-OHL-W-2.0, see the README there):

* `materials/<slug>.stock.json` — byte-for-byte copies of `materials/<slug>/stock.json`;
* `print-folds-letter.json` — the letter fold (tri-fold, rolled in) of a Carta and an A4 sheet
  for each stock, extracted from the documents Pliego's own kernel generates by running the
  commons cartridge `print-folds` (style `letter`, presets `us-letter` and `a4`);
* `LOCK.json` — the Pliego commit, the commons commit it pins, the git blob of every copy and of
  the cartridge sources, and the sha256 of the generated file.

Usage, from the repository root, with a Pliego checkout whose `projects/` submodule is populated:

    python3 scripts/pliego/sync_pliego_data.py --pliego ../pliego           # check: exit 1 on drift
    python3 scripts/pliego/sync_pliego_data.py --pliego ../pliego --write   # refresh to its HEAD

The check requires the checkout to be at the LOCK's commit and compares every byte; it prints one
read-proof line and fails when it compared nothing.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / "apps" / "web" / "src" / "lib" / "pliego" / "vendor"
STOCKS = ("copy-80", "cardstock-160")
# cv paper id → the print-folds preset that sizes that sheet (Pliego's own preset table).
PAPERS = {"letter": "us-letter", "a4": "a4"}
CARTRIDGE = "print-folds"
GENERATED = "print-folds-letter.json"


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True,
                          text=True).stdout.strip()


def git_blob(data: bytes) -> str:
    """The id git gives these bytes as a blob (`git hash-object`)."""
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def dump(obj: object) -> bytes:
    return (json.dumps(obj, indent=2, ensure_ascii=False, sort_keys=False) + "\n").encode("utf-8")


def r6(v: float) -> float:
    return round(float(v), 6)


def letter_case(doc: dict, paper: str, preset: str, stock: str) -> dict:
    """The letter fold of one generated document: fold positions along the folding axis."""
    coords = doc["vertices_coords"]
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    length, across = max(xs) - min(xs), max(ys) - min(ys)
    folds = []
    for (a, b), kind, name, treatment in zip(doc["edges_vertices"], doc["edges_assignment"],
                                            doc["pliego:edges_name"],
                                            doc["pliego:edges_treatment"]):
        if kind not in ("M", "V"):
            continue
        if abs(coords[a][0] - coords[b][0]) > 1e-9:
            raise SystemExit(f"pliego-sync: {preset}/{stock}: crease {name} is not across the sheet")
        folds.append({"at_mm": r6(coords[a][0]), "assignment": kind, "name": name,
                      "treatment": treatment})
    folds.sort(key=lambda f: f["at_mm"])
    cuts = [0.0] + [f["at_mm"] for f in folds] + [length]
    meta = doc["pliego:meta"]
    stocks = doc["pliego:stocks"]
    if len(folds) != 2 or set(stocks) != {stock}:
        raise SystemExit(f"pliego-sync: {preset}/{stock}: expected 2 creases on one {stock} sheet")
    return {
        "paper": paper,
        "preset": preset,
        "stock": stock,
        "sheet_mm": {"fold_axis": r6(length), "across": r6(across)},
        "folds": folds,
        "panels_mm": [r6(b - a) for a, b in zip(cuts, cuts[1:])],
        "caliper_mm": r6(stocks[stock]["caliper_mm"]),
        "params": meta["params"],
        "kernel": meta["kernel"],
        "digest": meta["digest"],
    }


def generate(pliego: Path, commons: Path) -> list[dict]:
    env = {**os.environ, "PYTHONPATH": str(pliego / "packages" / "kernel" / "src")}
    cases = []
    with tempfile.TemporaryDirectory(prefix="cv-pliego-") as tmp:
        for stock in STOCKS:
            out = Path(tmp) / stock
            params = json.dumps({"style": "letter", "stock": stock})
            run = subprocess.run([sys.executable, "-m", "pliego.cartridge", str(commons / CARTRIDGE),
                                  "--mode", "fold", "--params", params, "--out", str(out)],
                                 env=env, capture_output=True, text=True)
            if run.returncode != 0:
                sys.stderr.write(run.stdout + run.stderr)
                raise SystemExit(f"pliego-sync: the {CARTRIDGE} cartridge failed for {stock}")
            for paper, preset in PAPERS.items():
                path = out / f"{CARTRIDGE}.fold.{preset}.fold"
                doc = json.loads(path.read_text(encoding="utf-8"))
                cases.append(letter_case(doc, paper, preset, stock))
    return cases


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--pliego", required=True, help="a Pliego checkout (projects/ populated)")
    ap.add_argument("--write", action="store_true", help="refresh the copies to the checkout HEAD")
    args = ap.parse_args()
    pliego = Path(args.pliego).resolve()
    commons = pliego / "projects"
    head = git(pliego, "rev-parse", "HEAD")
    pinned_commons = git(pliego, "rev-parse", "HEAD:projects")
    if git(commons, "rev-parse", "HEAD") != pinned_commons:
        print(f"pliego-sync: {commons} is not at the commons commit Pliego pins ({pinned_commons})")
        return 1
    lock_path = VENDOR / "LOCK.json"
    lock = json.loads(lock_path.read_text(encoding="utf-8")) if lock_path.exists() else None
    if not args.write and (lock is None or lock["pliego"]["commit"] != head):
        print(f"pliego-sync: check FAIL: the checkout is at {head[:12]}, the LOCK pins "
              f"{(lock or {}).get('pliego', {}).get('commit', 'nothing')[:12]}")
        return 1

    files: dict[str, bytes] = {}
    copies = []
    for slug in STOCKS:
        source = f"materials/{slug}/stock.json"
        data = (pliego / source).read_bytes()
        if git_blob(data) != git(pliego, "rev-parse", f"HEAD:{source}"):
            print(f"pliego-sync: {source} differs from the committed blob (dirty checkout?)")
            return 1
        rel = f"materials/{slug}.stock.json"
        files[rel] = data
        copies.append({"path": rel, "source": source, "git_blob": git_blob(data)})
    cases = generate(pliego, commons)
    generated = {
        "_provenance": (
            "Generated by scripts/pliego/sync_pliego_data.py from Pliego's kernel running the "
            f"commons cartridge {CARTRIDGE} (style letter) at the commits in LOCK.json. "
            "CERN-OHL-W-2.0, Innovaciones MADFAM. Do not edit: refresh with the script."),
        "cases": cases,
    }
    files[GENERATED] = dump(generated)
    sources = {name: git(commons, "rev-parse", f"HEAD:{CARTRIDGE}/{name}")
               for name in ("main.py", "project.json")}
    new_lock = {
        "_provenance": "Pins of the Pliego data vendored here; written by "
                       "scripts/pliego/sync_pliego_data.py. Do not edit by hand.",
        "licence": "CERN-OHL-W-2.0",
        "pliego": {"repo": "https://github.com/madfam-org/pliego", "commit": head},
        "commons": {"repo": "https://github.com/madfam-org/sheet-hyperobjects",
                    "commit": pinned_commons, "via": "Pliego's projects/ submodule at that commit"},
        "copies": copies,
        "generated": [{"path": GENERATED, "cartridge": CARTRIDGE, "cartridge_git_blobs": sources,
                       "kernel": cases[0]["kernel"],
                       "sha256": hashlib.sha256(files[GENERATED]).hexdigest()}],
    }
    files["LOCK.json"] = dump(new_lock)

    if args.write:
        for rel, data in files.items():
            target = VENDOR / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        print(f"pliego-sync: wrote pliego={head[:12]} commons={pinned_commons[:12]} "
              f"copies={len(copies)} cases={len(cases)}")
        return 0
    drift = [rel for rel, data in files.items()
             if not (VENDOR / rel).exists() or (VENDOR / rel).read_bytes() != data]
    compared = len(files)
    if compared == 0 or not cases:
        print("pliego-sync: check FAIL (compared nothing)")
        return 1
    if drift:
        print(f"pliego-sync: check FAIL: drift in {', '.join(drift)}")
        return 1
    print(f"pliego-sync: check pliego={head[:12]} commons={pinned_commons[:12]} files={compared} "
          f"copies={len(copies)} cases={len(cases)} OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
