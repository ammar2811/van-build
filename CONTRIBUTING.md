# Contributing

Thanks for helping. A few rules keep the project trustworthy.

## Ground rules

- **Original work only.** Do not copy 3D models, catalog data, text or branding from other
  van planning tools. Geometry is generated in code and data comes from public sources.
- **Every number has a source.** Van dimensions and weights need a public, citable source or an
  `estimated` note explaining the reasoning. See [docs/data-sources.md](docs/data-sources.md).
- **The engine stays pure.** `packages/core` has no DOM and no React. If something can be a
  pure function of the design document, it belongs there with tests.
- **Millimetres, grams and minor currency units** in the model. Convert only in the UI.

## Before you open a pull request

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

All four must pass. Fix lint and flaky tests when you see them, even if you did not cause them.

End-to-end tests never touch a real account service: they build the app with
`VITE_CLOUD=test`, which talks to an in-memory stand-in held by the test process
(`apps/web/e2e/cloud.ts`). Changes to the database go in a new file in `supabase/migrations`,
with checks added to `supabase/tests/rls.sql`.

End-to-end tests run on Chromium and a phone profile locally. WebKit also runs in CI; set
`E2E_WEBKIT=1` to run it locally on a system Playwright's WebKit supports.

## Golden files

Files in `packages/core/fixtures/golden` are checked-in expected outputs.

- Weight fixtures are calculated by hand. Show the arithmetic in
  [docs/physics.md](docs/physics.md) when you add one.
- Drawing goldens change only on purpose: run `pnpm test:update-golden`, look at the new SVG,
  and commit it with the change that caused it.

## Adding a van or a part

- Vans: `packages/catalog/src/shells/`, one file per van. Follow
  [docs/data-sources.md](docs/data-sources.md).
- Parts: `packages/catalog/src/parts/definitions.ts`. Parts are plain data. Use generic sizes,
  masses and prices, not a specific manufacturer's product data.

## Contributor License Agreement

Contributions are accepted under the [CLA](CLA.md). It lets the project keep the option of
offering other licenses later while your contribution stays available under the AGPL.
