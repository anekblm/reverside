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
- **Net Revenue Retention (NRR):** closing ARR from cohorts active at the
  start of the displayed period divided by their opening ARR. If there is
  no opening ARR, the matrix displays a dash.
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

The shared churn and expansion phasing control defaults to 100% in PLAN.
It applies to both A and eligible current-year cohorts in B. Churn and
expansion then have their full revenue effect in the month of change.
The slider can model a partial first month. The main bridge shows each
month's opening CARR / 12 as Revenue Opening CARR, then applies this
month's signed CARR changes × first-month phase / 12. Previous changes
are included in opening CARR. The secondary “vs. year opening” amount
shows the impact against the year-opening run rate, including the full
effect of prior months' changes. Quarter and year cells sum the monthly
revenue flows. CARR and
customer counts roll forward from the prior period's closing balances.
The model retains unrounded expected counts and rounds only for display.

Reference case: opening CARR 500,000, annual churn 25%, expansion 20%,
EVEN and 50% first-month effect. Closing CARR is 475,000. The annual
recognized revenue is 487,500. In February, revenue before changes is
41,493.06 and the current churn impact is −434.03. Against the
year-opening run rate, February's churn impact is −1,302.08. January
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
2. **B, new customers acquired this year:** Revenue Opening CARR is the
   sum of monthly opening MRR for those customers. Add the eligible churn
   and expansion effects and New Revenue to obtain Recognized Revenue.
   New Revenue is first-month revenue from new acquisitions after phasing.

Within B, New CARR remains visible when the section is collapsed and
appears immediately before Closing CARR. New Revenue appears
immediately before Recognized Revenue. B's closing CARR includes all active
customers acquired during the current year. A January customer's first-month
revenue appears in New Revenue, and February's revenue is part of revenue
before changes. At the start of the next year that customer joins A.

The ARR Bridge separately reconciles:
`opening ARR − churn ARR + expansion ARR + new ARR = closing ARR`.
ARR/MRR at year or quarter end is the *last month's stock*, never a sum of
monthly ARR/MRR values. Recognized revenue and cashflows *are* summed.

## First-month revenue phasing

In PLAN, recognized revenue for the acquisition month equals
`new CARR / 12 × first-month revenue %`. The slider ranges from 0% to
100% and defaults to 100%. Each cohort earns full active monthly revenue
from the following month. Quarter and year columns sum the monthly ledger.
For example, 12,000 in January New CARR at 67% yields 670 in January
New Revenue and 1,000 from that cohort in February revenue before changes,
before any retention changes.

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
- New cohorts appear in B throughout the acquisition year.
  **Churn & expansion on new customers** defaults to On. From the month
  after acquisition, B uses equivalent monthly rates on each cohort's
  current opening CARR. Monthly gross retention is annual gross retention
  to the power `1/12`. Monthly net retention is annual NRR to the power
  `1/12`, and expansion is their difference. For example, 25% annual
  churn means 2.37% monthly churn in B. B uses this monthly conversion
  independently of A's annual distribution.
- With the switch Off, B has no churn or expansion during the acquisition
  year. At the next year boundary, those customers join A and follow its
  churn period and distribution. First-month acquisition revenue phasing
  and the shared revenue effect of retention changes remain separate controls.
- COGS cash proxy = recognized revenue × (1 − gross margin), paid in the
  same month. Other OPEX cash payments are a separately entered monthly value.
- Monthly cash collection = monthly earned subscription revenue shifted by
  whole-month collection delay. Opening receivables, prepayments, taxes,
  deferred revenue, capital spending, financing and annual-upfront billing
  are **not modeled** here.
- Operating cashflow = collected cash − COGS paid − other cash OPEX − S&M cash
  paid. S&M cash is independently allocatable across quarters.

Cash-neutral S&M capacity sums net cash before S&M. The lowest monthly
cash balance determines the additional liquidity needed. PLAN currently
reports that funding requirement against the selected spend. It does not
automatically cap spending.

## One integrated CARR and revenue bridge

The matrix shows total opening and closing CARR with cohort detail from
the same monthly ledger:

- **A · Existing:** cohorts active at the start of the year.
- **B · New:** all cohorts acquired during the current year, including
  the displayed month's acquisitions.

Closing CARR adds the closing stocks of A and B. Recognized revenue
adds the flows from those groups. NRR measures only cohorts in the
displayed period's opening base. Quarter and year columns add the monthly
flows and use opening and closing balances at the period boundaries.
The compact matrix includes a white New CARR row between total Opening
CARR and Closing CARR.
The engine retains first-month and earlier-month cohort detail to apply
phasing and retention. Those internal movements cancel within combined B,
so the matrix has no transfer row.

The annual budget, cash view and conversion funnel use the customer
volumes from the cohort forecast. Planned S&M is the modeled customers ×
selected CAC × allocated spending share. Category amounts use unrounded
values until display. Blended planned CAC is total S&M divided by total
new customers. The funnel rounds required volumes up to whole units.

Unit Economics is independently expandable after recognized revenue and
before Gross Profit. It uses the same visible month, quarter and year columns:
closing ACV is annualized closing CARR divided by active customers; estimated
gross-profit LTV is closing ACV × gross margin divided by equivalent annual
churn. Max CAC and Recommended CAC are LTV / 3 and LTV / 5. Planned CAC
is S&M paid divided by acquisitions in that column, and payback divides it
by closing ACV × gross margin / 12. Zero churn has no finite LTV estimate.

S&M Efficiency expands separately after Contribution. Magic Number is the
change in annualized CARR × gross margin divided by the column's S&M paid;
S&M / GP divides that spend by the column's gross profit. Ratios are
recomputed from each column's underlying amounts rather than summed.
Both sections remain accessible in the totals-only matrix. Their open
states persist across period, CARR-display and scenario changes.

PLAN's CAC strategies use those same annual closing economics, independently
of the illustrative target-state calculations in Step 2. Efficient growth
uses each year's LTV / 5. Aggressive growth starts with the profile multiplier
on that recommendation, capped at that year's LTV / 3; its premium over
Recommended CAC tapers linearly to zero in the last year of a multi-year plan.
Custom CAC remains a fixed explicit input (an empty value follows Recommended
CAC). Strategy cards and the budget summary label their targets as Year 1;
the annual budget displays each year's CAC target and Max budget.

Cohort balances and customer needs are calculated before pricing acquisition
costs. The forecast is then costed with those annual CAC targets; this does
not change the customer ledger. Cards, limits, warnings, S&M and cash update
on each scenario edit. Display rounding is applied after budget calculations.
With zero churn there is no finite LTV-derived recommendation: automatic
strategies are unavailable and PLAN requires an explicit Custom CAC, including
an intentional zero. Removing that input clears the priced strategy rather
than reusing an old budget or silently assuming free acquisition.

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
