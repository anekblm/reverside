# ReverSide PLAN – Cohort Financial Model (working specification)

This document specifies the **experimental, isolated calculation engine** in `src/engine/cohort-budget.js`.
**It now supplies the existing ARR & contribution forecast matrix at quarterly budget granularity**, without changing the approved page structure. The historical `src/engine/monthly-plan.js` remains available for comparison, but the UI's primary forecast imports `src/engine/cohort-budget.js`. Annual and monthly input modes are not yet exposed in the current UI.

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

When planning a full year, Front/Even/Back use provisional quarterly weights
35/30/20/15, 25/25/25/25 or 15/20/25/40, with even months within each
quarter by default. A manually chosen yearly phase may adjust this
*template* to obtain feasible first-invoice timing. For quarter planning,
quarter totals remain fixed while the months within each quarter are tilted
when the user selects explicit phasing. Manual period ARR inputs override the
target-derived period amounts; closing ARR then becomes an output.

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
Consequently, `phasing` can only be between `1/L` and `1`: for three
months, **33.33–100%**; for twelve months, **8.33–100%**. A selected 25%
quarterly phase is impossible under these assumptions and must be rejected,
not "fixed" through unreported discounts or invoice delays.

The engine finds a non-negative monthly first-invoice distribution consistent
with any feasible explicit phase, using an exponential tilt of the selected
template. No explicit phase means the natural implied phasing of the template
(e.g. 66.67% for EVEN within a three-month quarter). Monthly viewing never
applies an additional phase. A partial final year/quarter has a tighter
feasible range depending on actual months.

## Retention timing and cash

- Annual ARR-based churn is converted into a monthly gross retention factor
  `(1-churn)^1/12`. Annual NRR `1-churn+expansion` is converted into
  monthly net retention `NRR^1/12`. These factors apply to eligible cohorts.
- The horizon's original base is eligible immediately; newly acquired cohorts
  are eligible for churn/expansion **only after their first input budget period**
  ends (following month/quarter/year as chosen).
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

## Guarantees and acceptance

- The engine throws if an ARR or recognized revenue bridge does not reconcile.
- The same monthly underlying values aggregate to each quarter and year.
- All 12/24/etc. months are generated even if input is yearly or quarterly.
- TRACK can later freeze and compare *these monthly budget records* against
  monthly actuals without recomputing the original approved budget.
- `tests/cohort-budget.test.mjs` and `tests/monthly-plan.test.mjs` cover
  source cohorts, phasing feasibility, all three budget levels, front/even/back,
  6/12/24 month plans, cash lag, and S&M timing.

**Not yet complete:** full year/quarter/month input controls and monthly collapse/expand in the original interface, production-level billing calendar, annual prepaid cash
logic, mixed billing, accurate contract-level churn constraints, storing a
frozen approved baseline for TRACK, and a real-browser end-to-end acceptance
suite. These are separate from the now-reconciled first-invoice monthly model.
