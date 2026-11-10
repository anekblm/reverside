# ReverSide architecture — incremental migration

Branch: `feat/vc-startup-v2`. PLAN (steps 1–3) first; TRACK (step 4) later. Production `main` remains unchanged until tested and approved.

## Before changing PLAN

| Area | Source of truth | Acceptance |
| --- | --- | --- |
| A. Customers present at the start of the year | [Financial specification](FINANCIAL_MODEL.md#a-customers-present-at-the-start-of-the-year) | [Retention tests](../tests/budget-granularity-retention.test.mjs) and [matrix tests](../tests/plan-ui-drilldown.test.mjs) |
| B/C. Current-year acquisitions and New ARR phasing | [Budget and phasing contract](PLAN_BUDGET_PHASING_CONTRACT.md) | [Phasing acceptance tests](../tests/approved-phasing-contract.test.mjs) |
| Matrix layout, drilldown and counts | [PLAN matrix below](#plan-matrix-and-budget-input-controls-november-2026) | [Matrix tests](../tests/plan-ui-drilldown.test.mjs) and browser review |

The [audit](PLAN_LOGIC_AUDIT.md) and [source thread](source-thread-budget-phasing-2026-11-06.md)
preserve earlier decisions and examples.

1. Identify the governing rule and its reference scenario before editing.
   Record any changed rule and expected result with the corresponding test.
2. Review financial and layout changes separately. A layout-only change must
   keep the existing rows, controls, customer counts and period totals except
   where the change was requested. Drilldown renders saved results without
   running the forecast again.
3. Run `npm test` and verify changed browser interactions and layout on the
   development branch before production approval. Record pending browser
   checks explicitly. The repository currently has no CI workflow that
   requires `npm test` before a preview can deploy.

## Phase 1: separated assets (implemented)

- `index.html`: existing PLAN markup and inline event attributes; visual appearance intentionally preserved.
- `src/ui/main.css`: shared stylesheet extracted from HTML.
- `src/app.js`: transitional PLAN controller and DOM rendering, loaded as a browser ES module; HTML handlers temporarily exposed through `window`.
- `src/domain/saas-profiles.js`: five SaaS animal profiles, current assumptions, GTM allocations, conversion funnels and heuristic parameters. Benchmarks require independent source/date validation; do not market them as authoritative before validation.
- `src/engine/unit-economics.js`: initial pure, testable financial helper (simplified annual gross-profit LTV proxy, not a cash-flow calculation).
- `tests/`: native Node regression tests. Run `npm test`.

No framework or server-side database introduced. Vercel serves static files; previews deploy automatically from the feature branch.

## Phase 2: next implementation (NOT YET COMPLETE)

Extract state, calculations and UI into modules without changing existing outputs until regression tests are in place:

```
 src/
   domain/
     saas-profiles.js       # advisory definitions, sourced benchmarks
     scenario-schema.js     # validated PLAN inputs/outputs
   engine/
     unit-economics.js      # LTV/CAC heuristic metrics
     monthly-cohorts.js     # customer/ARR evolution by month
     revenue-schedule.js    # recognized revenue and billing schedules
     cash-flow.js           # actual cash in/out, runway and S&M headroom
     forecasting.js         # monthly baseline, quarter/year aggregates
   features/
     plan/                  # steps 1–3 user inputs and presentations
     track/                 # step 4 actuals/variance/rolling forecast, later
   ui/
     main.css
   app.js
```

## Non-negotiable design principles

1. `Ending ARR`, `recognized revenue`, `billings`, and `cash collections` are separate quantities, never interchangeable.
2. Monthly calculations are the source of truth; quarters and years aggregate the same monthly results.
3. Acquisition signing weights, acquisition revenue phasing and A retention timing have separate inputs and definitions.
4. S&M spend timing is configurable independently from customer-signing timing, initially quarterly in PLAN; cash movement runs monthly.
5. Cash-neutral S&M capacity is based on actual projected collections less **all other operating payments** in the same months, not ARR minus S&M.
6. PLAN maintains editable scenarios; a final approved baseline is immutable to TRACK. TRACK adds actuals without overwriting the baseline.
7. VC / fundraising cash runway is a separate view, not a proxy for operating profit.
8. Preserve a legacy preview until new engine outputs reconcile and user-facing PLAN is accepted.

## Initial migration QA (historical)

- Complete browser click-through of steps 1–3 after extraction, including pre-revenue and yearly/quarterly toggles.
- Verify all static JS imports and loaded asset paths in Vercel Preview.
- Add deterministic scenario fixtures (zero ARR, 6/12/24 months, churn, expansion, quarterly S&M, cash timing) before porting P&L calculations.

**Note:** This commit is a structural refactor; it does not yet implement quarterly S&M allocations, the cash-flow engine, or TRACK.

## 2026-10-30 — Monthly PLAN engine integrated (historical)

- `src/engine/monthly-plan.js` now derives closing ARR, new customer cohorts,
  monthly recognized revenue, quarterly S&M cash out and monthly operating cash.
- `src/features/plan/cash-panel.js` renders monthly/quarterly cashflow and cash-neutral
  S&M headroom in PLAN, with separately editable signing pattern and quarterly S&M allocations.
- Independent revenue phasing slider was removed; customer signing month now determines recognized revenue.
- The Step 3 summary P&L now derives ARR, revenue, gross profit and S&M from the same monthly series.
  The table's **Contribution (GP − S&M)** is not OpCF; all other operating cash out is included
  in the separate monthly cash view.
- Cash assumptions currently use a same-month COGS cash proxy, collection delay in whole months,
  no opening receivables and no taxes, capex, financing or working-capital movements.
- The headroom figure is an **optimistic upper bound** until users enter *all* other operating cash outflows.
- `tests/monthly-plan.test.mjs` covers 0-ARR startups, FRONT/EVEN/BACK,
  six-month horizon, S&M quarterly weights, collections delay and rollups.

### Remaining before PLAN release

- Test all scenarios in a real browser (including mobile and every navigation/editing path).
- Remove remaining dead legacy P&L helpers and gradually split `src/app.js` into
  STEP 1/2/3 controllers.
- Replace cash-flow proxies with explicit customer billing/collection schedules,
  staff cost cash timing, other OPEX and opening receivables.
- Add a complete baseline & approval flow for future TRACK.
- Validate sourced SaaS benchmarks and all revenue/acquisition assumptions.
- Confirm correct monthly recognition for contract activation and multi-year cohort differences.

Do not merge this branch without financial and browser acceptance tests.

## PLAN matrix and budget input controls (November 2026)

The original collapsible single financial matrix is retained. It opens with
yearly columns; users can expand individual years into quarters and individual
quarters into months. Expanding only changes displayed columns, not the monthly
source ledger. The grid shows quarters within the forecast horizon. Its
break-even marker is available after a CAC strategy has been selected.

Each cohort starts collapsed. A and B show opening CARR, closing CARR and
their recognized revenue subtotal. C shows new CARR, closing CARR and its
recognized revenue subtotal. Each section expands independently to show
the changes behind those figures. The section state is separate from
the year and quarter drilldown.

The controls above the matrix group A's churn, expansion, NRR and timing
separately from acquisition budget, signing presets and acquisition
revenue phasing. The Advanced section contains the new customer ACV
assumption and explains contracted and expansion ACV.

**One integrated bridge**, in the original forecast grid:
1. Contracted ARR (opening stock).
2. Cohort A: customers present at the beginning of the calendar year —
   their share of opening CARR, churn ARR, expansion ARR and closing CARR.
   Opening, churn and closing rows show customer counts. The revenue rows
   show the complete churn and expansion effects. Expanded months show
   their own contribution as “of which” in the same cells.
3. Cohort B: customers first invoiced in **earlier displayed periods within
   the same calendar year** — their opening CARR, churn ARR, expansion ARR and
   closing CARR.
4. Cohort C: customers first invoiced in the **current displayed period** —
   new CARR, plus possible eligible churn/expansion based on planning level,
   and closing CARR.
5. Recognized Revenue Existing (A), Recognized Revenue New (B+C),
   Total Recognized Revenue.
6. Contracted ARR (closing stock = A + B + C).

A/B **opening rows are "of which" decompositions** of opening CARR; they must
never be added a second time. Annual CARR is a stock, not revenue. Within-year
B is zero in a whole-year display, because acquisitions during that entire
displayed year belong to C; expanding into quarters/months exposes B properly.

**Acquisition budget granularity** (Year, Quarter, Month) sets the period
for new CARR inputs, acquisition phasing and retention of eligible
current-year acquisitions. Cohort A has separate annual timing and
first-month revenue controls. The engine emits a reconciled monthly ledger.
Users can override New Contracted ARR per **budget period**; when they do,
closing CARR is an output rather than a forced target.
**View granularity** is solely the existing expand/collapse presentation.
The New CARR presets are enabled in target-driven yearly/quarterly planning
and greyed out in monthly/manual mode. The A timing control is independent.

The original cash controls remain separate from revenue and CARR stocks.
The legacy engine `src/engine/monthly-plan.js` remains for comparison,
but the displayed PLAN matrix uses `src/engine/cohort-budget.js`.

The cohort engine calculates A churn and expansion on year-opening CARR,
allocates them to months and prepares all three period views. The matrix
reuses these results when expanded or collapsed. The acquisition phasing
slider is disabled when no new CARR is modeled. The ACV row divides closing
CARR by closing customer count.

The financial specification is in `FINANCIAL_MODEL.md`, and regression tests
cover original row structure, granularity controls and A/B/C reconciliation.
Do not merge into production without browser and financial acceptance.
