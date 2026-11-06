# ReverSide PLAN – Cohort Financial Model (working specification)

> **IMPORTANT — source priority (2026-11-06).** For **budget/view granularity, New Contracted ARR distribution, Revenue Phasing and monthly allocation for TRACK**, the later user-approved [PLAN Budget & Phasing Contract](PLAN_BUDGET_PHASING_CONTRACT.md) and the [verbatim thread excerpt](source-thread-budget-phasing-2026-11-06.md) are authoritative. Earlier claims in this document that month-level phasing is forbidden, 25% quarter phasing is impossible, or FRONT/EVEN/BACK conflates signed ARR with realization reflect **old implementation assumptions**, not the approved requirements. Preserve any unrelated rules; do not silently make the old assumptions normative.

This document specifies the cohort calculation engine in `src/engine/cohort-budget.js`, which now feeds the approved single collapsible PLAN matrix. The original `src/engine/monthly-plan.js` remains for comparison. **Yearly, quarterly and monthly budget input levels are available separately from the year/quarter/month viewing drilldown.**

**PLAN is a financial matrix, not a dashboard.** One reconciled monthly ledger
supports input at three levels and read-only aggregation into three view levels.

## Contract, stock and flow terminology

- **New ARR (first invoiced):** annualized recurring subscription value first
  invoiced this month. There is no earlier signed-but-not-active booking bucket.
- **Signed & Realized MRR:** New ARR / 12, earned in that first invoice month.
  No first-month discount or monthly revenue phasing is applied.
- **Closing ARR:** stock of annualized recurring value remaining at period end.
- **Recognized Revenue:** revenue earned during the displayed accounting period,
  not the annualized ARR stock; for monthly-billed subscriptions it equals the
  total active monthly MRR in each month under current assumptions.
- **Cash collections:** the monthly invoices actually collected at the specified
  delay. No annual-upfront billing is implemented in this iteration.
- All money uses one selected currency (FX conversion happens outside the engine).

## Independent controls

### Budget granularity

- Year: one year-specific new-ARR budget. Optional annual phasing chooses
  the implied first-invoice timing within that year.
- Quarter: one quarter-specific new-ARR budget. Optional quarterly phasing
  chooses the implied first-invoice timing within the quarter.
- Month: one month-specific new-ARR budget. No monthly revenue phasing;
  first-invoice MRR earns immediately.

When planning a full year, Front/Even/Back set **quarterly New Contracted ARR shares**:
35/30/20/15, 25/25/25/25 or 15/20/25/40. Within each quarter the default
distribution is EVEN across its three months, independently of the full-year
quarter pattern.

A manually selected YEAR revenue phasing must preserve each quarter's
Front/Even/Back share. The engine changes the first-invoice distribution
**only within quarters** and rejects a phasing outside that preset's
feasible range rather than moving planned ARR between quarters silently.
For full twelve-month years, the allowed annual first-invoice phasing
intervals are FRONT **54.58%–71.25%**, EVEN **45.83%–62.50%**, and
BACK **35.83%–52.50%**. Therefore a desired annual phase of 25% is
mathematically incompatible with all three fixed quarterly presets: it
requires a different quarterly ARR allocation or different invoice-start
assumptions. QUARTER phasing can range 33.33%–100% because it preserves
the quarter total and adjusts only the three months within it.

Manual period ARR inputs override target-derived new customer amounts;
closing CARR then becomes an output, not a forced target.

### View granularity

Year/quarter/month controls *presentation only*. No financial assumptions are
recalculated. Every forecast stores one identical monthly ledger and builds
its selected view by reclassifying vintage cohorts against displayed period
boundaries. Monthly values derived from quarter/year budgets are **allocated
forecasts**, not information supplied by the user.

## Revenue Bridge per displayed period

1. **Original base (pre-existing at the current year's start):**
   starting MRR revenue, less revenue impact from churn, plus revenue impact
   from expansion, all summed over months in the displayed period.
2. **Earlier new cohorts (acquired since year start, before current displayed
   period):** starting MRR revenue, less churn impact, plus expansion impact.
3. **Current period new cohorts:** income earned from cohorts first invoiced
   within the displayed period, including subsequent months in that period.
   This amount is net of any modeled cohort changes if a coarser view groups
   shorter budget periods.

The same customer can appear as "current" in a January display, "earlier"
in a February display, and "current" in a full-Q1 display. The sum of all three
groups is unchanged. At the start of each subsequent year, all customers
from earlier years form that year's original base.

The ARR Bridge separately reconciles:
`opening ARR − churn ARR + expansion ARR + new ARR = closing ARR`.
ARR/MRR at year or quarter end is the *last month's stock*, never a sum of
monthly ARR/MRR values. Recognized revenue and cashflows *are* summed.

## Exact phasing and feasibility

For a budget period containing `L` whole months, with new ARR share `w_i`
first invoiced in month `i` of the period (indexed 0..L−1):

```
Revenue realized in acquisition period = New ARR / 12 * sum(w_i * (L - i))
Maximum possible acquisition-period revenue = New ARR * L / 12
Phasing = sum(w_i * (L - i) / L)
sum(w_i) = 1; w_i >= 0
```

This relies on full MRR being recognized in the first invoice month and no
churn/expansion for acquired cohorts within their **budget input period**.
Consequently, without other constraints, `phasing` can only be between
`1/L` and `1`: for three months **33.33–100%**; for twelve months
**8.33–100%**. However fixed FRONT/EVEN/BACK quarterly shares make the
YEAR feasible interval **narrower**, as described above. A selected 25%
QUARTER phase is impossible under immediate full-month billing; a selected
25% YEAR phase is also impossible with the default fixed quarterly presets.
The engine rejects both instead of inventing recognition or changing
a customer's budget.

The engine finds a non-negative monthly first-invoice distribution consistent
with any feasible explicit phase, using an exponential tilt of the selected
template. No explicit phase means the natural implied phasing of the template
(e.g. 66.67% for EVEN within a three-month quarter). Monthly viewing never
applies an additional phase. A partial final year/quarter has a tighter
feasible range depending on actual months.

## Retention timing and cash

- **Budget period is the calculation scope**, not a display mode. Annual
  churn `c` and annual expansion `e` are INPUT rates. For a full input
  period of `L` months (12 year, 3 quarter, 1 month), calculate ONCE on
  each eligible cohort's opening CARR:
  `grossRetention=(1-c)^(L/12)`;
  `netRetention=(1-c+e)^(L/12)`;
  `churnCARR=openingCARR*(1-grossRetention)`;
  `expansionCARR=openingCARR*(netRetention-grossRetention)`.
  These same-period amounts must not be recomputed from month to month.
- **Yearly planning:** With 500,000 opening CARR, 25% annual churn and
  51% annual expansion, Year 1 churn is EXACTLY 125,000, expansion is
  EXACTLY 255,000 and closing CARR is 630,000 before new customers.
  Quarterly planning instead uses quarter-specific rates applied to each
  QUARTER opening CARR. Monthly planning is the only mode recalculating
  retention at each month opening. A yearly view of a quarterly budget must
  preserve the original four quarterly churn/expansion calculations.
- After the selected budget-period churn and expansion amounts are computed,
  each is **allocated evenly over that period's months**, as an estimated
  forecast, without recalculating the amounts. Recognized monthly revenue
  earns the new active MRR IN that month, including its assigned retention
  changes. The monthly allocation can be viewed but never silently treated
  as a revised monthly-budget forecast.
- Newly acquired cohorts are eligible for churn/expansion **only after their
  first input budget period** (following month/quarter/year) ends.
  Within that period they receive a full MRR in the first invoice month,
  but no churn or expansion.
- COGS cash proxy = recognized revenue × (1 − gross margin), paid in the
  same month. Other OPEX cash payments are a separately entered monthly value.
- Monthly cash collection = monthly earned subscription revenue shifted by
  whole-month collection delay. Opening receivables, prepayments, taxes,
  deferred revenue, capital spending, financing and annual-upfront billing
  are **not modeled** here.
- Operating cashflow = collected cash − COGS paid − other cash OPEX − S&M cash
  paid. S&M cash is independently allocatable across quarters.

When this engine is integrated, the cash-neutral S&M capacity is not a safe budget if other operating
outflows are incomplete; the interface warns when other OPEX is set to zero.

## One integrated CARR/Revenue bridge in the existing PLAN matrix

The forecast grid has exactly one opening and one closing Contracted ARR row.
The intermediate groups are mutually exclusive **cohort classifications** for
the displayed period, and share one monthly source ledger:

- **A Existing**: customer cohorts present at the start of the current year.
- **B Earlier New**: customer cohorts first invoiced earlier in the *same year*,
  but before the start of the selected **displayed** period.
- **C Current New**: customer cohorts first invoiced within that displayed
  period (month/quarter/year).

Each group has its opening or new CARR and churn/expansion CARR movements.
A/B opening CARR rows are **of-which decompositions** of the top Opening CARR;
never add them twice. Closing Contracted ARR = closing A+B+C.
In any full-year display B is zero by definition: all cohorts acquired within
the displayed year belong to C. The following year's A absorbs prior years.

After the A/B/C movement lines, three **flow** rows appear:
- Recognized Revenue Existing (A)
- Recognized Revenue New (B+C)
- Total Recognized Revenue (sum of the first two)

Recognized revenue is never added to CARR stocks and differs from churn ARR
and expansion ARR by measurement units and timing. The full revenue bridge
separately verifies A base revenue + A churn/expansion revenue impact = A net
recognized revenue, and equivalent B movement recognition.

The EVEN/FRONT/BACK controls are always present in a fixed toolbar, not inserted
into the forecast grid on expansion. They are greyed out in monthly and manual
budget modes. Users can override New Contracted ARR values per input budget
period; then closing CARR is an output and the previous target remains a
reference only.

`tests/cohort-carr-reconciliation.test.mjs` checks the six essential CARR
and recognized-revenue reconciliations across Year/Quarter/Month budgeting,
every display granularity, FRONT/EVEN/BACK, and 12/24/36-month horizons.

## Recognition from the same visible CARR bridge

Within a displayed period of `D` months, annualized opening CARR earns
`openingCARR * D/12` before any changes. If a CARR change is allocated to
month `j` (1-based), it affects `(D-j+1)` full months of period revenue.
The earned impact is `monthlyCARRChange * (D-j+1)/12`. Therefore every A/B/C
recognized-revenue subtotal is derived from the CARR changes visible above
it, and `Recognized A + Recognized (B+C) = Total Recognized`.

For the year-budget example above, we allocate the fixed period CARR changes
equally across the 12 months. The first month's change affects 12 months;
the last month's change affects 1 month. The effective revenue weight is
`(12+11+...+1)/(12*12)=13/24`:
- Opening base revenue = 500,000 × 12/12 = **500,000**
- Churn revenue effect = −125,000 × 13/24 = **−67,708.33**
- Expansion revenue effect = +255,000 × 13/24 = **+138,125**
- **Year 1 recognized existing revenue = 570,416.67**

The same closing CARR of 630,000 can coexist with a different year's
recognized revenue when the user deliberately chooses QUARTER or MONTH
budgeting, because the timing and calculation scope are different.

`src/engine/cohort-budget.js` also resets monthly Existing vs New revenue
classification at the beginning of EACH budget year, matching A/B/C in the
displayed bridge. Phasing applies ONLY to first-invoiced New CARR; it
cannot change churn or expansion in the existing base. If no New CARR
is required, the phasing slider is greyed out and explicitly says why.

## Guarantees and acceptance

- The engine throws if an ARR or recognized revenue bridge does not reconcile.
- The same monthly underlying values aggregate to each quarter and year.
- All 12/24/etc. months are generated even if input is yearly or quarterly.
- TRACK can later freeze and compare *these monthly budget records* against
  monthly actuals without recomputing the original approved budget.
- `tests/cohort-budget.test.mjs` and `tests/monthly-plan.test.mjs` cover
  source cohorts, phasing feasibility, all three budget levels, front/even/back,
  6/12/24 month plans, cash lag, and S&M timing.

**Not yet complete:** production-level billing calendar, annual prepaid cash
logic, mixed billing, accurate contract-level churn constraints, storing a
frozen approved baseline for TRACK, and a real-browser end-to-end acceptance
suite. These are separate from the now-reconciled first-invoice monthly model.
