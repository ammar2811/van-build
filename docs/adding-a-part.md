# Adding a part

Parts are plain data in `packages/catalog/src/parts/definitions.ts`. Most new parts are one
line.

```ts
part("shoe-rack", "Shoe rack", "storage", "panelBox", [600, 300, 400], 6, 90, {
  carries: true,
}),
```

The arguments are: id, name, category, generator, `[width, depth, height]` in mm (width runs
along the van), empty weight in kg, rough price in dollars, and options.

## Options

| Option                | Meaning                                                              |
| --------------------- | -------------------------------------------------------------------- |
| `mount`               | `"floor"` (default), `"wall"`, or `"roof"` (sits on top of the roof) |
| `defaultElevation`    | Height of the underside above the floor when added (mm)              |
| `carries`             | Other parts can stand on it (cabinets, bed platforms)                |
| `stacks`              | Drops onto whatever carries when dragged over it (mattress, crate)   |
| `hollow`              | Furniture with usable space inside (cabinets, benches)               |
| `fitsInside`          | A component that may sit inside hollow furniture (tanks, batteries)  |
| `litres`              | It holds liquid; its weight is added at the tank's fill level        |
| `water`, `electrical` | Data for planned water and power views                               |

## Rules

- Use **generic** sizes, weights and prices: what a typical part of that kind is. Do not copy
  a specific manufacturer's product data or another planning tool's catalog.
- Pick the closest existing category; `categoryLabels` lists them.
- Run `pnpm test`. The catalog tests check every part against the schema and place it in all
  six vans: it must fit without any issue.

# Adding a template

Templates live in `packages/catalog/src/templates.ts`. Each part is placed by intent, not by
coordinates: against a wall, before the wheel well, behind the sliding door, inside another
part. That is what lets one template fit every van.

The tests build every template in every van and require no collisions, nothing sticking out,
every weight rating respected with two people aboard, and the sliding door kept clear. If a
template fails in one van, change the intent (a smaller part, a different wall, a quarter
turn) rather than adding a special case for that van.

# Adding a van

See [data-sources.md](data-sources.md#adding-or-correcting-a-van). Every number needs a
public source or an `estimated` note, and a test fails if one is missing.
