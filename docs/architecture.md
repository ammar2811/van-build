# How Van Build is put together

A short map for contributors. Read this first, then the code it points to.

## The rule everything follows

The **design document** (`DesignDoc` in `packages/core/src/schema/design.ts`) is the single
source of truth. Everything you see is derived from it by pure functions and never stored:
the plan, side view and 3D view, the weights, the warnings, the parts list and every export.
So the views cannot drift apart, and every output can be tested without a browser.

Units in the model are millimetres, grams and cents. Inches, pounds and formatted money exist
only where they are shown or typed.

## Packages

```
packages/core       Pure TypeScript. No DOM, no React. Everything that can be a function of
                    the design lives here, with tests beside it.
packages/catalog    Data only: van shells with their sources, part definitions, templates.
apps/web            The editor. Renders what core computes and turns input into actions.
supabase            Database schema and row level security tests for accounts.
docs                The maths, the data sources, and guides like this one.
```

### packages/core

| Folder       | What it does                                                                   |
| ------------ | ------------------------------------------------------------------------------ |
| `units`      | Parse and format lengths, masses and money (`23 5/8"`, `2' 3"`, `$1,200`)      |
| `schema`     | zod schemas for shells, parts and designs                                      |
| `shell`      | Interior geometry: width at any length and height, meshes for 3D               |
| `parts`      | Part boxes, mass, price, what may overlap what                                 |
| `snap`       | `solveDrag`: snapping and collision in one pure function, and `findIssues`     |
| `editing`    | Exact placement, rotation, resizing, stacking, duplicating                     |
| `physics`    | The axle-load model. See [physics.md](physics.md)                              |
| `bom`        | The parts list and its CSV                                                     |
| `drawing`    | A small drawing format (lines, rects, text in paper mm) and every export sheet |
| `migrations` | Opening designs saved by older versions                                        |

Drawings are described once and rendered twice: `drawing/svg.ts` and `drawing/pdf.ts` take
the same `Drawing`, so the SVG and PDF exports cannot disagree. Golden files in
`packages/core/fixtures/golden` pin every sheet.

### apps/web

| Folder        | What it does                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `state`       | `docStore` (the design and undo history), `uiStore` (selection, view, drag) and `actions.ts`, the only place that changes the design |
| `editor`      | Plan (SVG), side view, 3D view (react-three-fiber, loaded on demand), inspector, palette                                             |
| `weight`      | The weight panel, and the strip that replaces it on phones                                                                           |
| `bom`         | The parts list view                                                                                                                  |
| `export`      | Build pack PDF, plan SVG, parts list CSV                                                                                             |
| `persistence` | Saving on the device (IndexedDB) and opening what was saved                                                                          |
| `cloud`       | Accounts, sync, versions and sharing. See [accounts.md](accounts.md)                                                                 |
| `start`       | The new-layout picker and first-visit welcome                                                                                        |

Undo works by recording Immer patches on every `commit`; there are no hand-written inverse
operations. A drag in progress lives in `uiStore`, not the design, so it never lands in the
undo history; only the drop is committed.

## Testing

| Kind                      | Where                                                           | Run                |
| ------------------------- | --------------------------------------------------------------- | ------------------ |
| Unit, property and golden | beside the code, `*.test.ts`                                    | `pnpm test`        |
| End to end                | `apps/web/e2e`, against the production build, desktop and phone | `pnpm e2e`         |
| Accessibility             | `apps/web/e2e/a11y.spec.ts` (axe)                               | part of `pnpm e2e` |
| Database rules            | `supabase/tests/rls.sql`                                        | `psql -f`          |
| Size budgets              | `scripts/check-budgets.mjs`                                     | `pnpm budget`      |

Weight fixtures are calculated by hand in [physics.md](physics.md), not copied from the code,
so the code is checked against the maths and not against itself.
