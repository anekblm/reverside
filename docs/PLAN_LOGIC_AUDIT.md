# ReverSide PLAN – audit against the agreed financial model

> **IMPORTANT — source priority (2026-11-06).** For **budget/view granularity, New Contracted ARR distribution, Revenue Phasing and monthly allocation for TRACK**, the later user-approved [PLAN Budget & Phasing Contract](PLAN_BUDGET_PHASING_CONTRACT.md) and the [verbatim thread excerpt](source-thread-budget-phasing-2026-11-06.md) are authoritative. Earlier claims in this document that month-level phasing is forbidden, 25% quarter phasing is impossible, or FRONT/EVEN/BACK conflates signed ARR with realization reflect **old implementation assumptions**, not the approved requirements. Preserve any unrelated rules; do not silently make the old assumptions normative.

This is a **decision and implementation audit**, not a redesign proposal.
Scope: feature branch `feat/vc-startup-v2`. Production `main` is untouched.
The underlying agreed design is the single existing collapsible matrix:
Year -> Quarter -> Month (viewing), independent from budget input scope.

## 1. Correct budgeting scope — calculation, never just viewing

| Budget input scope | Churn and expansion applied when? | Source basis |
|---|---|---|
| **YEAR** | Once at the beginning of each budget **year** | Beginning Contracted ARR per eligible customer cohort in that year |
| **QUARTER (default)** | Once at the beginning of each budget **quarter** | Beginning Contracted ARR per eligible cohort in that quarter |
| **MONTH** | Once at the beginning of each budget **month** | Beginning Contracted ARR per eligible cohort in that month |

Annual input rates `churn=c` and `expansion=e` map to an input period of
`L` months via:
- Gross retained fraction: `(1-c)^(L/12)`
- Net retained fraction: `(1-c+e)^(L/12)`
- Budgeted **churn CARR** = `opening CARR * (1-gross fraction)`
- Budgeted **expansion CARR** = `opening CARR * (net fraction-gross fraction)`

This calculation happens **exactly once per input period** for each
eligible cohort. Automatic monthly allocations are **derived values**;
they do not re-compute churn on a new monthly base. Churn/expansion are
allocated evenly to months inside the chosen input period. A newly
first-invoiced cohort experiences no churn/expansion until the following
**input** period. Viewing the budget at any granularity never changes it.

**Identified and repaired defect:** prior cohort engine compounded
churn and expansion monthly even when the user chose Year or Quarter.
This violated the agreed budget scope and generated unexplained numbers.

### Fixed numerical acceptance scenario

Annual input, 500,000 opening CARR, 50 opening customers, ACV 10,000,
annual churn 25%, annual expansion 51%, no new customer CARR, annual
NRR 126%:

- Opening CARR: **500,000**
- Churn CARR: **−125,000** exactly (= 500,000 × 25%)
- Expansion CARR: **+255,000** exactly (= 500,000 × 51%)
- New CARR: **0**
- Closing CARR: **630,000** exactly
- Closing customers (expected fractional budget stock): **37.5**
- Closing contracted ACV: **16,800** (= 630,000 / 37.5)

To produce a **monthly forecast for follow-up** without silently
recalculating the annual budget, allocate −125,000 / 12 and
+255,000 / 12 to months. A change in month `j` affects revenue in
months `j` through 12, inclusive (full first invoice/month convention).
The weight is `(12+11+...+1)/(12*12)=13/24`:

- Existing base earned revenue: 500,000
- Churn effect on **earned** revenue: −125,000 × 13/24 = **−67,708.33**
- Expansion effect on **earned** revenue: +255,000 × 13/24 = **+138,125.00**
- **Total Year 1 recognized revenue: 570,416.67**

The 500,000 -> 630,000 **stock** bridge and 500,000 ->
570,416.67 **revenue flow** bridge are distinct but fully reconciled.

Quarter and Month inputs can produce different total churn/expansion and
recognized revenue because their inputs are applied to more frequent
period opening stocks. They MUST still deliver the same quarter/year
sum of recognized revenue when only the **viewing** granularity changes.

## 2. First-invoice SaaS cohorts and phasing

- First invoice marks arrival of New Contracted ARR. There is no
  separately budgeted signed-not-invoiced waiting pool.
- Signed New MRR = newly first-invoiced New CARR / 12.
- Full MRR is recognized starting in the first invoice month; there
  is no arbitrary half-month discount or monthly phasing multiplier.
- Revenue phasing applies to first-invoice TIMING only at Year or
  Quarter input scope. No monthly revenue-phasing slider.
- Phasing has **no effect on the existing base's churn/expansion**.
  If no new ARR is budgeted/required, the slider is greyed out and
  explicitly explains why changing it cannot affect the numbers.
- Quarter input: new CARR by quarter is fixed; the phasing slider
  changes only months within that quarter (33.33%–100% feasible).
- Year input: FRONT / EVEN / BACK are quarterly New CARR shares
  `35/30/20/15`, `25/25/25/25`, `15/20/25/40`.
  The annual phasing slider may adjust **only months within each
  quarter**. Feasible full-year ranges are respectively
  54.58%–71.25%, 45.83%–62.50%, 35.83%–52.50%.
  An impossible phasing is rejected, never "solved" by silently
  reassigning the preset quarterly signed ARR amounts.
- Default monthly distribution within each quarter is Even.

**Identified and repaired defects:** phasing could silently override
preset quarterly sales shares; phasing looked active with zero new CARR;
the old mid-month revenue convention contradicted full-first-month MRR.

## 3. Single matrix A/B/C bridge and money definitions

Keep the original matrix and its nested Year -> Quarter -> Month
expansion. Do not create a separate revenue table or dashboards.

- **Opening CARR**: one stock at the start of the displayed period.
- **A – Existing / Start of Year**: customers present as that year began.
- **B – Earlier New / Same Year**: cohorts first invoiced earlier in
  that year, but before the currently displayed period.
- **C – Current New**: cohorts first invoiced within the displayed period.
- A/B/C have independent opening or new CARR, churn and expansion CARR
  flows, and closing CARR. Opening A/B values are *subsets of* overall
  opening CARR, not extra new contract inflows.
- **Closing CARR = closing A + closing B + closing C**, never a
  monthly sum of ARR stock.
- Each group has **earned revenue effects** from its opening CARR
  and period-weighted churn/expansion. C has a first-invoice revenue
  start profile. These are period flows, not another ARR calculation.
- **Recognized Existing = Revenue A**.
  **Recognized New = Revenue B + Revenue C**.
  **Total Recognized = Recognized Existing + Recognized New**.
- Cohort grouping changes only when displaying a different period;
  YEAR display has B=0 for same-year cohorts. In Q2, Q1 new cohorts
  are B. In February, January new cohorts are B. At next year's
  start all cohorts acquired in the preceding year become A.
- Derived *contracted ACV* is CARR / customer count at the relevant
  period ending. Do NOT label recognized revenue divided by the end
  customer count "ACV"; it is not the agreed contract metric.
- Number of customers, churned customers and expected ACV come from
  the same cohort ledger, not a second independently rounded formula.

## 4. Independent cash and S&M

- Recognized revenue is earned service, not cash collected.
- Monthly invoices are collected with the explicitly chosen
  whole-month collection delay (zero means same month).
- S&M cash budget and quarter payout shares are independent of
  the quarter/annual pattern for first-invoiced New CARR.
- COGS cash proxy uses recognized revenue × (1−gross margin);
  other OPEX is an explicit, separate cash outflow.
- OpCF = collections − COGS paid − S&M paid − other OPEX paid.
  GP−S&M is a contribution subtotal, **not OpCF**.
- The annual-upfront-billed subscription option, mixed annual/monthly
  billing, deferred revenue and TRACK baseline/actuals belong to
  later versions. Do not falsely imply they are implemented.

## 5. Visual scope / acceptance tests

The original layout remains: one collapsible matrix, one ARR/revenue
bridge, ACV and customer details, and permanent fixed-layout
EVEN/FRONT/BACK controls with inactive presets greyed out. Budget
granularity is an input selector; expanding a year or quarter is a
**presentation-only** operation. Quarter S&M controls remain separate.

Regression tests (files in `tests/`):
- `budget-granularity-retention.test.mjs`: exact period-scoped
  churn/expansion, 500k scenario, cohort restrictions, phasing and cash.
- `cohort-carr-reconciliation.test.mjs`: stock/revenue sums for all
  A/B/C groups and all views.
- `plan-ui-drilldown.test.mjs`: original matrix labels, hierarchy,
  period budget selector, fixed presets, 500k scenario and inactive phase.
- Earlier unit-engine tests remain to detect inadvertent regressions.

**Not claims of completion:** This does not provide real contracts,
live ACTUALS from TRACK, annual upfront cash/deferred revenue,
or a full browser-driven, end-to-end acceptance run. The feature branch
is not merged into production.
