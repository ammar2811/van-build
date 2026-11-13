# Van data sources

Every number on a van shell is either read from a public source or marked as an estimate with
the reasoning written down. The same information lives next to the data in
`packages/catalog/src/shells/`, and a test fails if any number is missing its provenance.

Dimensions are interior, in millimetres. Weights are stored in grams.

In the app, the Vehicle section of the weight panel marks estimated ratings and weights as
"(estimate)". Any of them can be replaced with the numbers from a door-jamb sticker and a
weigh-scale ticket, which is the only way to get axle loads you can rely on.

## What is estimated on every van

These are not published by any of the manufacturers in the sources used, so they are estimated
the same way for all six vans.

| Field                 | How it is estimated                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| Rear axle position    | Published rear overhang (axle to bumper) minus an assumed 130 mm between the rear doors and the bumper   |
| Cab seat positions    | Two seats, a seated person's centre of mass 450 mm ahead of the cargo area and 430 mm off the centreline |
| Wall profile          | Vertical up to a set height, then leaning in to an assumed ceiling width                                 |
| Wheel wells           | Published width between them; length, height and position centred on the rear axle are assumed           |
| Sliding door position | Published opening size; assumed to start 100 to 120 mm behind the front of the cargo area                |

## Mercedes-Benz Sprinter 144 and 170, high roof

Source: Mercedes-Benz Vans USA, Sprinter Cargo Van specifications, model year 2027.
<https://www.mbvans.com/en/sprinter/cargo-van>, read 2026-11-12.
144: Cargo Van WORKER. 170: Cargo Van 2500. Both RWD, 4-cylinder diesel.

The source publishes dimensions in whole inches, so sourced lengths are good to about
+/- 13 mm.

| Field                     | 144 published | 170 published | Stored (144 / 170)        |
| ------------------------- | ------------- | ------------- | ------------------------- |
| Wheelbase                 | 144 in        | 170 in        | 3657.6 / 4318 mm          |
| Cargo bed length          | 133 in        | 173 in        | 3378.2 / 4394.2 mm        |
| Rear overhang             | 49 in         | 64 in         | used for the rear axle    |
| Max width at floor        | 70 in         | 70 in         | 1778 mm                   |
| Interior height           | 79 in         | 79 in         | 2006.6 mm                 |
| Cargo width at wheelhouse | 53 in         | 53 in         | 1346.2 mm                 |
| Side door opening         | 50 x 72 in    | 51 x 72 in    | 1270 / 1295.4 x 1828.8 mm |
| Rear door opening         | 61 x 73 in    | 61 x 73 in    | 1549.4 x 1854.2 mm        |
| GVWR                      | 9,050 lb      | 9,050 lb      | 4,105,011 g               |
| Front GAWR (standard)     | 4,101 lb      | 4,101 lb      | 1,860,182 g               |
| Rear GAWR                 | 5,359 lb      | 5,359 lb      | 2,430,802 g               |
| Base curb weight, front   | 2,025 lb      | 2,208 lb      | 918,525 / 1,001,532 g     |
| Base curb weight, rear    | 2,914 lb      | 3,050 lb      | 1,321,768 / 1,383,457 g   |

A 4,409 lb front axle is a factory option and is not modelled.

**Known problem with the curb weight split.** The published front and rear base curb weights
do not add up to the published base curb weight (144: 4,939 vs 4,916 lb; 170: 5,258 vs
5,236 lb), and the split is rear-heavy (about 41% front), which is unusual for an empty
front-engine van. The numbers are used as published and marked low confidence.

## Ford Transit 148, medium and high roof

Source: Ford Motor Company, 2026 Ford Transit Technical Specifications (Ford media site),
Cargo Van, Long body columns.
<https://www.fromtheroad.ford.com/content/dam/fordmediasite/us/en/library/2026/specs/2026_Ford_Transit_Specs.pdf>,
read 2026-11-13. Chassis: T-250, RWD, 3.5L V6.

| Field                      | Published                       | Stored                      |
| -------------------------- | ------------------------------- | --------------------------- |
| Wheelbase                  | 147.6 in                        | 3749 mm                     |
| Cargo floor length (front) | 143.7 in                        | 3650 mm                     |
| Rear overhang              | 47.6 in                         | used for the rear axle      |
| Cargo height (max)         | 72.0 in medium, 81.5 in high    | 1828.8 / 2070.1 mm          |
| Width between wheelhouses  | 54.8 in (single rear wheels)    | 1391.9 mm                   |
| Side cargo door opening    | 51.2 x 63.0 in                  | 1300.5 x 1600.2 mm          |
| Rear cargo door opening    | 61.7 x 64.9 in / 61.7 x 74.3 in | 1567.2 x 1648.5 / 1887.2 mm |
| GVWR                       | 9,070 lb                        | 4,114,083 g                 |
| Base curb weight (total)   | 5,204 lb medium, 5,299 lb high  | split 56/44, see below      |
| Seating                    | 2                               | two cab seats               |

Estimated, in addition to the common list:

| Field               | Value                 | Reasoning                                                                             |
| ------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| Interior width      | 1770 mm               | Not in the source. Assumed from the published 81.3 in body width less wall thickness  |
| Front and rear GAWR | 4,130 lb and 5,515 lb | Not in the source. Commonly seen T-250 door-sticker values. Use your own door sticker |
| Curb weight split   | 56% front, 44% rear   | Only the total is published. Assumed for an empty rear-drive van. Use a scale ticket  |

## Ram ProMaster 136 and 159, high roof

Source: Ram, 2015 Ram ProMaster brochure, specifications tables, Cargo Van 2500 columns.
<https://www.ramtrucks.com/assets/pdf/brochures/2015_ram_promaster.pdf>, read 2026-11-13.
Chassis: 2500, FWD, 3.6L V6.

The body has kept these dimensions since 2014, but the ratings are for model year 2015 and
newer vans can differ. Ram's current fleet specification PDF could not be retrieved (the site
refused automated access and the published link returned "not found").

| Field                      | Published (136 / 159) | Stored                 |
| -------------------------- | --------------------- | ---------------------- |
| Wheelbase                  | 136 in / 159 in       | 3454.4 / 4038.6 mm     |
| Cargo body overall length  | 122.8 in / 145.9 in   | 3119.1 / 3705.9 mm     |
| Overall body length        | 213.1 in / 236.0 in   | used for the rear axle |
| Interior width, side panel | 73.4 in               | 1864.4 mm              |
| Interior width, wheel well | 56 in                 | 1422.4 mm              |
| Interior height, high roof | 76 in                 | 1930.4 mm              |
| Side door opening          | 49.2 x 69.0 in        | 1249.7 x 1752.6 mm     |
| Rear doors opening         | 62.0 x 70.5 in        | 1574.8 x 1790.7 mm     |
| GVWR                       | 8,900 lb              | 4,036,972 g            |
| Front GAWR                 | 4,630 lb              | 2,100,133 g            |
| Rear GAWR                  | 5,291 lb              | 2,399,957 g            |
| Base curb weight (total)   | 4,764 lb / 4,889 lb   | split 60/40, see below |

Estimated, in addition to the common list:

| Field             | Value               | Reasoning                                                                                                             |
| ----------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Axle positions    | From overall length | Overhangs are not published for vans. Derived from overall length and wheelbase with an assumed 950 mm front overhang |
| Curb weight split | 60% front, 40% rear | Only the total is published. Assumed for an empty front-drive van. Use a scale ticket                                 |

## Adding or correcting a van

1. Use a public, citable source: manufacturer specification pages, body builder guides or
   upfitter drawings. Do not copy data from other planning tools.
2. Put the source in `sources` with the date you read it.
3. Give every number a `provenance` entry: the source id, or `estimated` with a note saying
   how you arrived at it.
4. Add the van to this page.
