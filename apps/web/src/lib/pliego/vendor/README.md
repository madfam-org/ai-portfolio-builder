# Pliego paper data (vendored, pinned)

> Boundary: public. Data copied from MADFAM's public Pliego repositories; no secret, no client, no price.

[Pliego](https://pliego.madfam.io) ([source](https://github.com/madfam-org/pliego)) is MADFAM's paper platform and
**owns paper physics**. cv does not re-derive any of it: it consumes this small slice at build time, read only by
`../paper.ts`, and uses it only on screen (the paper preview and the printing advice of `/documentos/:id/imprimir`).

| File | What it is | Source |
|---|---|---|
| `materials/copy-80.stock.json` | stock card, bond 80 g/m² | byte-for-byte copy of Pliego `materials/copy-80/stock.json` |
| `materials/cardstock-160.stock.json` | stock card, cartulina 160 g/m² | byte-for-byte copy of Pliego `materials/cardstock-160/stock.json` |
| `print-folds-letter.json` | the letter fold (tri-fold, rolled in) of a Carta and an A4 sheet in each stock | extracted from the documents Pliego's kernel generates running the commons cartridge `print-folds` (style `letter`, presets `us-letter`, `a4`); each case keeps the document's `pliego:meta.digest` |
| `page-turn-deck.fold.json` | one leaf of bond 80 hinged at its spine, 300 × 168.75 mm (the deck's 16:9), the source of the deck's page turn | byte-for-byte output of Pliego's kernel running the commons cartridge `page-turn`; `apps/web/scripts/pliego-page-turn.ts` turns it with `@pliego/engine` into `../generated/page-turn-deck.json` |
| `LOCK.json` | the Pliego commit, the commons commit it pins, the git blob of each copy and of the cartridge sources, the sha256 of the generated file | written by the sync script |
| `CERN-OHL-W-2.0.txt` | the licence text, identical to Pliego's `docs/licenses/CERN-OHL-W-2.0.txt` | |

## Licence

The stock cards and the cartridge output are **commons objects of Pliego, licensed CERN-OHL-W-2.0** (owner ruling,
2026-10-10; each card states it in `provenance.license`), © Innovaciones MADFAM S.A.S. de C.V. They are not
relicensed by being here: this directory's JSON files stay CERN-OHL-W-2.0 (full text beside them), while cv's code
that reads them stays AGPL-3.0-only (see the repository `NOTICE`). The copies are unmodified, and the generated file
is Pliego's own output, reduced to the fold lines and their provenance.

## Refreshing and drift

Never edit these files by hand. With a Pliego checkout whose `projects/` submodule is populated:

```bash
python3 scripts/pliego/sync_pliego_data.py --pliego <pliego-checkout>           # check (exit 1 on any drift)
python3 scripts/pliego/sync_pliego_data.py --pliego <pliego-checkout> --write   # refresh to that checkout's HEAD
```

`apps/web/test/pliego-data.test.ts` fails when a copy no longer matches its pinned blob or the generated file its
recorded sha256; the CI job `pliego-pin` fetches Pliego at the pinned commit and re-runs the check, cartridge
included.
