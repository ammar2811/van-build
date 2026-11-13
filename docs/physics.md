# Weight and axle-load model

This is the model behind `packages/core/src/physics/weight.ts`. The golden fixtures in
`packages/core/fixtures/golden/weight-*.json` are calculated by hand from this page, not copied
from the code, so the code is checked against the maths and not against itself.

## Assumptions

- The van is a rigid body standing still on level ground.
- It rests on two supports: the front axle and the rear axle. Left and right wheels are not
  separated.
- Every part is a point mass at the centre of its box.
- The empty van's curb weight (front and rear) already includes a full fuel tank.

It is an estimate for planning. It does not replace weighing the finished van on a scale.

## Formulas

`x_i` is how far the centre of gravity of load `i` sits behind the front axle, `m_i` is its
mass, and `WB` is the wheelbase.

```
added      A = sum(m_i)
rear axle  R = curbRear  + sum(m_i * x_i) / WB
front axle F = curbFront + A - sum(m_i * x_i) / WB
gross      T = F + R
payload remaining = GVWR - T
centre of gravity = R * WB / T        (behind the front axle)
```

The rear axle formula comes from taking moments about the front axle. Three things follow:

- A load directly over an axle lands entirely on that axle.
- A load between the axles is shared in proportion to how close it is to each.
- A load behind the rear axle (`x > WB`) puts more than its own weight on the rear axle and
  lifts weight off the front axle.

Each of `F`, `R` and `T` is compared with its rating (front GAWR, rear GAWR, GVWR). The app
warns at 90% and flags anything over 100%.

## Worked example (golden fixture 01)

Vehicle numbers here are round illustrative values, not data for a real van.

- Wheelbase 3665 mm
- Curb weight 1400 kg front, 1100 kg rear
- GVWR 4105 kg, GAWR 2000 kg front, 2430 kg rear

| Load                       | m (kg)  | x behind front axle (mm) | m * x (kg mm) |
| -------------------------- | ------- | ------------------------ | ------------- |
| Driver and passenger       | 160     | 1200                     | 192,000       |
| Galley and fridge          | 90      | 2200                     | 198,000       |
| Fresh water 100 L and tank | 108     | 3400                     | 367,200       |
| Battery bank               | 40      | 3700                     | 148,000       |
| Bed platform and mattress  | 70      | 3950                     | 276,500       |
| Garage gear                | 120     | 4200                     | 504,000       |
| **Sum**                    | **588** |                          | **1,685,700** |

- Added to the rear axle: 1,685,700 / 3665 = 459.9 kg
- Added to the front axle: 588 - 459.9 = 128.1 kg
- Front axle: 1400 + 128.1 = **1528.1 kg** (76% of 2000)
- Rear axle: 1100 + 459.9 = **1559.9 kg** (64% of 2430)
- Gross: **3088.0 kg** (75% of 4105). Payload remaining: **1017.0 kg**
- Centre of gravity: 1559.9 * 3665 / 3088.0 = **1851.4 mm** behind the front axle

The 120 kg of garage gear sits 535 mm behind the rear axle. On its own it puts
120 * 4200 / 3665 = 137.5 kg on the rear axle and takes 17.5 kg off the front.

## The other fixtures

| Fixture          | Load                       | Front                      | Rear              | Why it exists                                                 |
| ---------------- | -------------------------- | -------------------------- | ----------------- | ------------------------------------------------------------- |
| 02 rear overhang | 200 kg at 1.25 * WB        | 1400 - 50 = 1350           | 1100 + 250 = 1350 | Overhang unloads the front axle                               |
| 03 over limit    | 1700 kg over the rear axle | 1400                       | 2800 (over 2430)  | Rear axle and gross both over their ratings                   |
| 04 front warning | 400 kg over the front axle | 1800 (exactly 90% of 2000) | 1100              | Only one axle changes, and the warning threshold is inclusive |

## Properties checked on random inputs

- Front + rear always equals the empty van plus everything added.
- Moving a load rearward never lowers the rear axle load or raises the front.
- A load over an axle changes only that axle.
- A load behind the rear axle lowers the front axle load.
- The order of the loads does not matter.
