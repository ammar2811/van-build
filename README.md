# Van Build

An open-source camper van layout planner. Placement that snaps into place, exact dimensions,
and numbers you can build from.

Status: early. Milestones M0 to M4 are done: foundations, the 2D editor, the weight model, the
3D view, and the full catalog with the parts list and build pack. See [Roadmap](#roadmap).

## What works today

- 2D floor plans of six vans (Sprinter 144/170, Transit 148 medium/high roof, ProMaster
  136/159), built from published dimensions with every number sourced or marked as an estimate.
- Three views of the same design: a top-down plan, a side elevation and a 3D view, with the
  plan and 3D side by side on wide screens. Parts drag in 3D with the same snapping as the plan.
- Live weight: front axle, rear axle and total against their ratings, payload left, and the
  centre of gravity on the plan, all updating while you drag.
- People in the cab, tank fill levels, per-part weights, and your own door-sticker and
  scale-ticket numbers in place of the catalog's.
- Components can sit inside furniture: a tank in the galley, a battery under a bench.
- 45 parts in ten groups, with search: beds, galley, seating, storage, appliances, water,
  electrical, climate, windows and loads. Solar panels, fans and air conditioners go on the roof.
- A parts list with costs: identical parts are counted together, and a price you type on a
  part replaces the catalog's rough guide.
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
- Export a build pack as a vector PDF (dimensioned floor plan, side elevation, weight estimate
  and parts list), the floor plan as SVG, and the parts list as CSV.

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
                   weight model, bill of materials, drawings. No DOM, no React.
packages/catalog   Data only: van shells and part definitions, with sources.
apps/web           The editor (React + Vite, react-three-fiber for 3D). Renders what the
                   engine computes. The 3D code is only downloaded when a 3D view is opened.
docs               The maths and where the data comes from.
```

The design document is the single source of truth. Weights, the parts list, drawings and
warnings are derived from it by pure functions and never stored. Every export page is one
drawing description that both the SVG and the PDF writer render, so they cannot disagree. Lengths are millimetres everywhere in the model;
inches exist only at the edge of the UI.

- [Weight and axle-load model](docs/physics.md)
- [Van data sources](docs/data-sources.md)

## Roadmap

| Milestone | Scope                                                         |
| --------- | ------------------------------------------------------------- |
| M0 (done) | Engine, one sourced van, 2D drag and snap spike, PDF export   |
| M1 (done) | Full 2D editor: more parts, locks, stacking, saved locally    |
| M2 (done) | Live weight and axle-load panel, all six van shells           |
| M3 (done) | 3D view in sync with the plan, side elevation                 |
| M4 (done) | Full part catalog, bill of materials, complete build pack PDF |
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
