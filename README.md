# Van Build

An open-source camper van layout planner. Placement that snaps into place, exact dimensions,
and numbers you can build from.

Status: early. Milestones M0 (foundations) and M1 (2D editor) are done. See [Roadmap](#roadmap).

## What works today

- A 2D floor plan of a Sprinter 144 High Roof, built from published dimensions with sources.
- Eleven parts to place: bed platform, mattress, galley, cooktop, cabinets, fridge, bench,
  toilet, crate and water tank.
- Drag parts with mouse or finger. They snap to walls, to each other and to a grid, and they
  cannot be pushed through one another.
- Walls that lean in are modelled: an overhead cabinet stops where the wall is at its height,
  not where it is at the floor.
- Stacking: a mattress dropped on a bed platform rests on it and moves with it.
- Type exact values in millimetres or inches (`600`, `23 5/8"`, `2' 3"`, `600 + 18`, `+50`),
  in the side panel or straight onto a gap label on the plan.
- Zoom with the wheel or a pinch; the snapping grid gets finer as you zoom in.
- Rotate in 90 degree steps, duplicate, lock, undo and redo, keyboard nudging.
- Your layout is saved in the browser as you work and is still there after a reload.
- Export a dimensioned floor plan as a vector PDF.
- A weight and axle-load model in the engine (no panel in the app yet).

## Getting started

Requires Node 22 or newer and pnpm.

```bash
pnpm install
```

```bash
pnpm dev
```

Then open <http://localhost:5173>.

## Checks

```bash
pnpm lint
```

```bash
pnpm typecheck
```

```bash
pnpm test
```

```bash
pnpm e2e
```

`pnpm e2e` needs the Playwright browsers once:
`pnpm --filter @vanbuild/web exec playwright install chromium`.

## How it is put together

```
packages/core      Pure TypeScript engine: units, schemas, shell geometry, snapping,
                   weight model, drawings. No DOM, no React.
packages/catalog   Data only: van shells and part definitions, with sources.
apps/web           The editor (React + Vite). Renders what the engine computes.
docs               The maths and where the data comes from.
```

The design document is the single source of truth. Weights, drawings and warnings are derived
from it by pure functions and never stored. Lengths are millimetres everywhere in the model;
inches exist only at the edge of the UI.

- [Weight and axle-load model](docs/physics.md)
- [Van data sources](docs/data-sources.md)

## Roadmap

| Milestone | Scope                                                         |
| --------- | ------------------------------------------------------------- |
| M0 (done) | Engine, one sourced van, 2D drag and snap spike, PDF export   |
| M1 (done) | Full 2D editor: more parts, locks, stacking, saved locally    |
| M2        | Live weight and axle-load panel, all six van shells           |
| M3        | 3D view in sync with the plan, side elevation                 |
| M4        | Full part catalog, bill of materials, complete build pack PDF |
| M5        | Accounts, cloud save, share links                             |
| M6        | Launch hardening                                              |

## Accuracy

Van Build produces planning estimates. Measure your own van before cutting, and weigh the
finished build on a scale. Axle and gross weight ratings are safety limits.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). New vans and parts are especially welcome, as long as
every number has a public source.

## License

[AGPL-3.0-only](LICENSE). Mercedes-Benz, Sprinter and other vehicle names are trademarks of
their owners and are used only to say which vehicle the data describes.
