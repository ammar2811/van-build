# Van data sources

Every number on a van shell is either read from a public source or marked as an estimate with
the reasoning written down. The same information lives next to the data in
`packages/catalog/src/shells/`, and a test fails if any number is missing its provenance.

Dimensions are interior, in millimetres. Weights are stored in grams.

## Sprinter 144 High Roof

Source: Mercedes-Benz Vans USA, Sprinter Cargo Van specifications, model year 2027,
144 in wheelbase, high roof, Cargo Van WORKER (RWD, 4-cylinder diesel).
<https://www.mbvans.com/en/sprinter/cargo-van>, read 2026-11-12.

The source publishes dimensions in whole inches, so sourced lengths are good to about
+/- 13 mm. Measure your own van before cutting anything.

### From the source

| Field                     | Published              | Stored                        |
| ------------------------- | ---------------------- | ----------------------------- |
| Wheelbase                 | 144 in                 | 3657.6 mm                     |
| Cargo bed length          | 133 in                 | 3378.2 mm                     |
| Max width at floor        | 70 in                  | 1778 mm                       |
| Interior height           | 79 in                  | 2006.6 mm                     |
| Cargo width at wheelhouse | 53 in                  | 1346.2 mm between wheel wells |
| Side door opening         | 50 in wide, 72 in high | 1270 x 1828.8 mm              |
| Rear door opening         | 61 in wide, 73 in high | 1549.4 x 1854.2 mm            |
| GVWR                      | 9,050 lb               | 4,105,011 g                   |
| Front GAWR (standard)     | 4,101 lb               | 1,860,182 g                   |
| Rear GAWR                 | 5,359 lb               | 2,430,802 g                   |
| Base curb weight, front   | 2,025 lb               | 918,525 g                     |
| Base curb weight, rear    | 2,914 lb               | 1,321,768 g                   |

A 4,409 lb front axle is a factory option and is not modelled yet.

### Estimated

| Field                 | Value                                                          | Reasoning                                                                                                          |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Rear axle position    | 2264 mm from the front of the cargo area                       | Published rear overhang (49 in, axle to bumper) minus an assumed 130 mm between the rear doors and the bumper face |
| Wall profile          | Vertical to 1100 mm, leaning in to 1380 mm wide at the ceiling | Only the floor width and the interior height are published                                                         |
| Wheel wells           | 900 mm long, 330 mm high, centred on the rear axle             | Only the width between them is published                                                                           |
| Sliding door position | Starts 120 mm behind the front of the cargo area               | Only the opening size is published                                                                                 |

### Known problem with the curb weight split

The published front and rear base curb weights add up to 4,939 lb, but the published base curb
weight is 4,916 lb. The split is also rear-heavy (41% front, 59% rear), which is unusual for an
empty front-engine van. The numbers are used as published and marked low confidence.

Until the design can take a weigh-scale ticket as an override (planned for milestone M2),
treat axle-load results for this van as indicative only.

## Adding or correcting a van

1. Use a public, citable source: manufacturer specification pages, body builder guides or
   upfitter drawings. Do not copy data from other planning tools.
2. Put the source in `sources` with the date you read it.
3. Give every number a `provenance` entry: the source id, or `estimated` with a note saying
   how you arrived at it.
4. Add the van to this page.
