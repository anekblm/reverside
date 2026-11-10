# ReverSide PLAN financial specification

PLAN uses one monthly ledger for all CARR, revenue and cash calculations.
The matrix aggregates that ledger to quarters and years. The [previous
budget and phasing contract](PLAN_BUDGET_PHASING_CONTRACT.md) documents the
earlier period-based UI and the TRACK baseline requirement. Legacy
period-based inputs remain available to callers of the forecast engine.

## Contract, stock and flow terminology

- **New ARR (first invoiced):** annualized recurring subscription value first
  invoiced this month. There is no earlier signed-but-not-active booking bucket.
- **Signed MRR:** New ARR / 12. The acquisition phasing rule determines
  recognized revenue for those cohorts in the acquisition month.
- **Closing ARR:** stock of annualized recurring value remaining at period end.
- **Recognized Revenue:** revenue earned during the displayed accounting period,
  after applying the relevant cohort timing rules to the monthly run rate.
- **Cash collections:** the monthly invoices actually collected at the specified
  delay. No annual-upfront billing is implemented in this iteration.
- All money uses one selected currency (FX conversion happens outside the engine).

## Independent controls

### A. Customers present at the start of the year

The default is Year + Even. Annual churn CARR equals year-opening CARR
times annual churn. Annual expansion and expected customer losses use the
same opening base and timing profile. EVEN uses equal monthly weights.
FRONT and BACK use 35/30/20/15% and 15/20/25/40% across quarters,
respectively, with an even initial split within each quarter. The
distribution editor can override both levels. A partial year recognizes only
the elapsed months' weights of the annual retention schedule.

The separate A phasing control defaults to 100% in PLAN. Churn and
expansion then have their full revenue effect in the month of change.
The slider can model a partial first month. For each month, the
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
recognized revenue is 41,579.86 and Q1 is 124,218.75. With the 100%
default, the same CARR movements give 486,458.33 in annual recognized
revenue.

### Target-driven monthly plan

Step 3 allows editing Start ARR, Target ARR, Opening Customers, Time Period
and Gross Margin. The fields update the same assumptions as Steps 1 and 2.
Entry ACV is Start ARR divided by Opening Customers, or an explicit Expected
ACV in the pre-revenue scenario. The animal profile uses that entry ACV.

New CARR is calculated from the target gap and the modeled ending
contribution of new cohorts at the assumed ACV. Its independent monthly
distribution starts at EVEN. FRONT/BACK and editable quarter/month
weights change signing dates. Editing a share redistributes the remaining
percentage among its peers. The same weights are used in each forecast
year. For a partial forecast year, available acquisition weights are
normalized over the months in the forecast. If all weights are outside
the horizon, the model shows the resulting target gap.

### View granularity

Year/quarter/month controls presentation. Every forecast uses one monthly
ledger. Quarter and year columns aggregate monthly flows by cohort and
use the opening and closing stocks at their boundaries.

## Revenue Bridge per displayed period

1. **Original base (pre-existing at the current year's start):**
   starting MRR revenue, less revenue impact from churn, plus revenue impact
   from expansion, all summed over months in the displayed period.
2. **B1, accumulated:** revenue in months after acquisition within the same
   year. Sum monthly opening MRR and eligible churn and expansion effects.
3. **B2, new in period:** recognized revenue in the acquisition month,
   after first-month phasing.

For a January customer, January's revenue is in B2 and February's revenue is
in B1. This split also applies within the Q1 and annual totals. At the start
of the following year the customer joins A.

The ARR Bridge separately reconciles:
`opening ARR − churn ARR + expansion ARR + new ARR = closing ARR`.
ARR/MRR at year or quarter end is the *last month's stock*, never a sum of
monthly ARR/MRR values. Recognized revenue and cashflows *are* summed.

## First-month revenue phasing

In PLAN, recognized revenue for the acquisition month equals
`new CARR / 12 × first-month revenue %`. The slider ranges from 0% to
100% and defaults to 100%. Each cohort earns full active monthly revenue
from the following month. Quarter and year columns sum the monthly ledger.
For example, 12,000 in January New CARR at 67% yields 670 in January B2
and 1,000 from that cohort in February B1 before any retention changes.

### Engine compatibility for budget-period phasing

Callers using the earlier `phasePercent` or `phaseByPeriod` inputs
without `newCustomerFirstMonthPhasePercent` retain the budget-period rule.
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

- **Churn Period** defines the frequency at which the input churn rate
  applies to opening CARR and customers. With 25% churn and no expansion,
  annual gross retention is 75%, 31.64% or 3.17% for Year, Quarter or
  Month, respectively.
- Expansion is entered as an annual rate. If there are `n` churn periods
  per year, the equivalent expansion rate per period is
  `(1 + annualExpansion)^(1/n) - 1`. The model applies it to opening
  CARR using churn's timing. Annual NRR is
  `(1 - churnRate + periodExpansion)^n`.
- A calculates the movements against the opening base of each selected
  churn period and distributes them across that period. Quarterly timing
  uses the selected shares within each quarter. Monthly churn applies
  directly in each month.
- New cohorts show revenue in B2 in the acquisition month and move to B1
  the following month within the same year. Churn and expansion first
  apply in the next selected churn period. Cohorts already present at
  the start of the next year are in A.
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
