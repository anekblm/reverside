# ReverSide PLAN financial specification

The [A rules below](#a-customers-present-at-the-start-of-the-year) govern
customers present at the start of the year. The [PLAN Budget & Phasing
Contract](PLAN_BUDGET_PHASING_CONTRACT.md) governs current-year acquisitions,
budget and view controls, and the monthly baseline requirement for TRACK.
The [November 5 audit](PLAN_LOGIC_AUDIT.md) records earlier behavior.

This document specifies the cohort calculation engine in `src/engine/cohort-budget.js`, which now feeds the approved single collapsible PLAN matrix. The original `src/engine/monthly-plan.js` remains for comparison. **Yearly, quarterly and monthly budget input levels are available separately from the year/quarter/month viewing drilldown.**

**PLAN is a financial matrix, not a dashboard.** One reconciled monthly ledger
supports input at three levels and read-only aggregation into three view levels.

## Contract, stock and flow terminology

- **New ARR (first invoiced):** annualized recurring subscription value first
  invoiced this month. There is no earlier signed-but-not-active booking bucket.
- **Signed MRR:** New ARR / 12. The acquisition phasing rule determines
  recognized revenue for those cohorts during their acquisition budget period.
- **Closing ARR:** stock of annualized recurring value remaining at period end.
- **Recognized Revenue:** revenue earned during the displayed accounting period,
  after applying the relevant cohort timing rules to the monthly run rate.
- **Cash collections:** the monthly invoices actually collected at the specified
  delay. No annual-upfront billing is implemented in this iteration.
- All money uses one selected currency (FX conversion happens outside the engine).

## Independent controls

### A. Customers present at the start of the year

Annual churn CARR equals year-opening CARR × annual churn. Annual expansion
CARR equals year-opening CARR × annual expansion. Expected customer losses
equal year-opening customers × annual churn. Use the same timing pattern
for all three. EVEN uses equal monthly weights. The implemented FRONT
weights are 35/30/20/15% across quarters and BACK uses 15/20/25/40%, split
evenly within each quarter. These reuse the acquisition presets as an
implementation choice for A. Partial years use the elapsed months' weights
from the annual schedule.

The separate A phasing control defaults to 50%. For each month, the
revenue baseline is year-opening CARR / 12. Each signed revenue effect is
`(prior months’ CARR changes + this month’s CARR change × first-month phase) / 12`.
Monthly cells show the current-month share below the total, marked
“of which”. Quarter and year cells sum the monthly revenue flows. CARR and
customer counts roll forward from the prior period's closing balances.
The model retains unrounded expected counts and rounds only for display.

Reference case: opening CARR 500,000, annual churn 25%, expansion 20%,
EVEN and 50% first-month effect. Closing CARR is 475,000. The annual
revenue bridge is 500,000 − 62,500 + 50,000 = 487,500. February churn impact
is −1,302.08, of which −434.03 comes from February's CARR change. January
recognized revenue is 41,579.86 and Q1 is 124,218.75.

This rule supersedes earlier period-opening retention and full-first-month
examples for A in PLAN. The budget granularity and New ARR phasing below
apply to current-year acquisitions until they join A at the next year start.
See the [retention tests](../tests/budget-granularity-retention.test.mjs)
and [matrix tests](../tests/plan-ui-drilldown.test.mjs) for the acceptance
values, customer counts and year/quarter/month reconciliation.

### Budget granularity

- Year, Quarter or Month sets the input period for new CARR and for its
  acquisition revenue phasing. A uses the annual schedule defined above.

When planning a full year, Front/Even/Back set **quarterly New Contracted ARR shares**:
35/30/20/15, 25/25/25/25 or 15/20/25/40. Within each quarter the default
distribution is EVEN across its three months, independently of the full-year
quarter pattern.

Revenue phasing preserves the selected signing distribution and signed
CARR for every period. The [acquisition contract](PLAN_BUDGET_PHASING_CONTRACT.md)
documents the requirements and current UI gaps.

Manual period ARR inputs override target-derived new customer amounts;
closing CARR then becomes an output, not a forced target.

### View granularity

Year/quarter/month controls presentation. Every forecast uses one monthly
ledger. Quarter and year columns aggregate monthly flows by cohort and
use the opening and closing stocks at their boundaries. Monthly values
derived from quarter/year budgets are allocated forecasts.

## Revenue Bridge per displayed period

1. **Original base (pre-existing at the current year's start):**
   starting MRR revenue, less revenue impact from churn, plus revenue impact
   from expansion, all summed over months in the displayed period.
2. **B, earlier new cohorts:** revenue in months after acquisition within the
   same year. Sum monthly opening MRR, churn and expansion effects, and
   any acquisition-period phasing assigned to those months.
3. **C, first-month cohorts:** recognized revenue in the acquisition month.
   This includes the applicable first-month share of acquisition phasing.

For a January customer, January's revenue is in C and February's revenue is
in B. This split also applies within the Q1 and annual totals. At the start
of the following year the customer joins A.

The ARR Bridge separately reconciles:
`opening ARR − churn ARR + expansion ARR + new ARR = closing ARR`.
ARR/MRR at year or quarter end is the *last month's stock*, never a sum of
monthly ARR/MRR values. Recognized revenue and cashflows *are* summed.

## Acquisition phasing and feasibility

For a budget period of `L` months, the maximum before timing constraints
is `new CARR × L / 12`. Acquisition-period recognized revenue equals
that maximum × the selected phase. The engine caps the phase at the amount
that can be earned from the selected signing months. It allocates recognized
revenue across eligible signed-cohort months without moving CARR. The
reference case of 100 new CARR and 25% phasing in Q1 gives 6.25 in Q1.

<details>
<summary>Historical first-invoice phasing model (superseded)</summary>

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

</details>

## Retention timing and cash

- **For current-year acquisitions**, the budget period is the retention
  calculation scope. Annual
  churn `c` and annual expansion `e` are INPUT rates. For a full input
  period of `L` months (12 year, 3 quarter, 1 month), calculate ONCE on
  each eligible cohort's opening CARR:
  `grossRetention=(1-c)^(L/12)`;
  `netRetention=(1-c+e)^(L/12)`;
  `churnCARR=openingCARR*(1-grossRetention)`;
  `expansionCARR=openingCARR*(netRetention-grossRetention)`.
  These same-period amounts must not be recomputed from month to month.
- After the selected budget-period churn and expansion amounts are computed,
  each is **allocated evenly over that period's months**, as an estimated
  forecast, without recalculating the amounts. Recognized monthly revenue
  earns the new active MRR IN that month, including its assigned retention
  changes. The monthly allocation can be viewed but never silently treated
  as a revised monthly-budget forecast.
- Newly acquired cohorts become eligible for churn and expansion after
  their acquisition budget period. During that period their revenue follows
  acquisition phasing.
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
The intermediate groups share one monthly source ledger:

- **A Existing**: customer cohorts present at the start of the current year.
- **B Earlier New**: customers in the months after their acquisition month,
  within the same year. B closing CARR = B opening CARR + transfers from C
  within the column − churn + expansion. Transferred customers follow the
  same rule. Transfers at the opening boundary are included in B opening CARR.
- **C First Month**: new CARR and first-month recognized revenue. The
  remaining CARR at the end of a column is the final month's acquisitions.

A/B opening rows are components of total opening CARR. Closing Contracted
ARR equals closing A + B + C. CARR transferred to B continues the same
customer contract. New CARR is recorded once, in C.

After the A/B/C movement lines, three **flow** rows appear:
- Recognized Revenue Existing (A)
- Recognized Revenue New (B+C)
- Total Recognized Revenue (sum of the first two)

Recognized revenue is never added to CARR stocks and differs from churn ARR
and expansion ARR by measurement units and timing. The full revenue bridge
separately verifies A base revenue + A churn/expansion revenue impact = A net
recognized revenue, and equivalent B movement recognition.

The EVEN/FRONT/BACK controls are always present in fixed toolbars. The
acquisition presets are greyed out in monthly and manual budget modes.
Users can override New Contracted ARR values per input budget
period; then closing CARR is an output and the previous target remains a
reference only.

`tests/cohort-carr-reconciliation.test.mjs` checks the six essential CARR
and recognized-revenue reconciliations across Year/Quarter/Month budgeting,
every display granularity, FRONT/EVEN/BACK, and 12/24/36-month horizons.

<details>
<summary>Historical A recognition example with full first-month effect (superseded)</summary>

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

</details>

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
