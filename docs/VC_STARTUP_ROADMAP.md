# ReverSide 2.1 — VC startup product brief

Status: **experimental feature branch** `feat/vc-startup-v2`, not approved for production.

## Product objective

Make ReverSide a combined business-model validator and financial growth planner for venture-backed startups, from pre-revenue through early scaling.

Two workflows share the same underlying numbers:
- **Founder view** — validate assumptions, plan go-to-market, estimate capital required to hit milestones, stress-test scenarios.
- **Investor view** — test credibility of unit economics and assumptions, understand milestone funding risk, compare scenarios and sensitivity.

## Lifecycle-specific treatment

1. **Pre-revenue / pilots:** zero actual customers and zero actual ARR are valid; input *assumed* annual contract value to plan target customer acquisition. No observed churn, NRR, CAC or LTV exists. Display modelled values as assumptions only. Early tests on this branch cover this starting state.
2. **Early revenue:** real revenue and customer inputs; clearly separate observed retention data from benchmark assumptions.
3. **Scaling:** multi-cohort modelling, NRR and funnel analysis, increasingly calibrated with actual operating metrics.

## VC decision model — work remaining

- Separate **ending ARR** from **recognized revenue**, **billings** and **cash collections**.
- Replace the single annual approximation with an internally consistent **monthly cohort engine**; aggregate to quarters/years as a presentation choice. Current 6-month horizon is NOT modelled with 6-month precision.
- Model cash balances and burn explicitly: opening cash, committed capital, financing receipt dates, recurring operating costs, payroll, COGS, working capital and debt where applicable.
- Investor outputs: cash runway, monthly burn, funding gap and funding date, ARR milestones, growth efficiency, downside/base/upside scenarios, implied acquisition capacity.
- Do not treat gross profit less S&M as full profit or cash flow.
- Benchmarks must have references, dates and configurable assumptions. Do not present benchmark-derived LTV/CAC as observed facts.
- Add scenario saving, export, validation and consistency tests across customer counts, ARR, S&M and results.

## Acceptance criteria for next release

- From 0 customers / 0 ARR with expected ACV, the engine predicts new customer targets without forced fictional revenue.
- ARR and revenue rolls reconcile at month, quarter and year granularity; no `NaN` or `Infinity` for valid inputs.
- S&M budget follows acquisition cohorts from the *same model pass*.
- Runway is calculated from explicit cash flows and funding dates, not a contribution-margin proxy.
- Tests: pre-revenue, one-customer pilot, positive ARR, churn spikes, expansion, 6/12/24 months, strategy changes, target below current ARR, sensitivity to acquisition timing.
- Preview deployment verified before any merge to main.

## Branch status

2026-10-30: Imported user-provided `reverside_open_2.0.html` into `index.html` with preliminary startup stage inputs, pre-revenue zero-state handling, explicit estimated-metric disclosures, and an S&M cohort alignment fix. These are foundation changes, not the full VC model.
