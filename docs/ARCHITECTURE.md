# ReverSide architecture — incremental migration

Branch: `feat/vc-startup-v2`. PLAN (steps 1–3) first; TRACK (step 4) later. Production `main` remains unchanged until tested and approved.

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
3. Signing pattern controls timing of new customers. Eliminate the separate revenue phasing slider when the new monthly model is implemented to avoid contradictory user inputs.
4. S&M spend timing is configurable independently from customer-signing timing, initially quarterly in PLAN; cash movement runs monthly.
5. Cash-neutral S&M capacity is based on actual projected collections less **all other operating payments** in the same months, not ARR minus S&M.
6. PLAN maintains editable scenarios; a final approved baseline is immutable to TRACK. TRACK adds actuals without overwriting the baseline.
7. VC / fundraising cash runway is a separate view, not a proxy for operating profit.
8. Preserve a legacy preview until new engine outputs reconcile and user-facing PLAN is accepted.

## Pending QA

- Complete browser click-through of steps 1–3 after extraction, including pre-revenue and yearly/quarterly toggles.
- Verify all static JS imports and loaded asset paths in Vercel Preview.
- Add deterministic scenario fixtures (zero ARR, 6/12/24 months, churn, expansion, quarterly S&M, cash timing) before porting P&L calculations.

**Note:** This commit is a structural refactor; it does not yet implement quarterly S&M allocations, the cash-flow engine, or TRACK.
