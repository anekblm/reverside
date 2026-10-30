import test from "node:test";
import assert from "node:assert/strict";
import { forecastSaaS } from "../src/engine/monthly-plan.js";

const base = (overrides = {}) => ({
  months: 12, openingARR: 0, acv: 1200, targetARR: 120000,
  annualChurn: 0, annualExpansionComp: 0, grossMargin: 0.8,
  yearShares: [100], signingPattern: "EVEN", cacByYear: [200],
  openingCash: 0, otherOpexMonthly: 0, collectionLagMonths: 0,
  ...overrides,
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6 * Math.max(1, expected), `${actual} != ${expected}`);
const sum = (rows, key) => rows.reduce((s, r) => s + r[key], 0);

test("pre-revenue starts at actual zero ARR, reaches target and has recognized revenue below new ARR", () => {
  const r = forecastSaaS(base());
  assert.equal(r.months.length, 12);
  assert.equal(r.months[0].startARR, 0);
  assert.equal(r.summary.newCustomersNeeded, 100);
  close(r.summary.endingARR, 120000);
  assert.ok(r.summary.totalRecognizedRevenue < r.summary.endingARR);
});
test("front-loaded signing recognizes more revenue than even, more than back", () => {
  const front = forecastSaaS(base({ signingPattern: "FRONT" }));
  const even = forecastSaaS(base());
  const back = forecastSaaS(base({ signingPattern: "BACK" }));
  assert.equal(front.summary.newCustomersNeeded, back.summary.newCustomersNeeded);
  assert.ok(front.summary.totalRecognizedRevenue > even.summary.totalRecognizedRevenue);
  assert.ok(even.summary.totalRecognizedRevenue > back.summary.totalRecognizedRevenue);
});
test("quarter and annual flows reconcile, ARR rolls forward", () => {
  const r = forecastSaaS(base({ openingARR: 30000, targetARR: 160000, annualChurn: 0.15, annualExpansionComp: 0.11, months: 24, yearShares: [60, 40] }));
  assert.equal(r.quarters.length, 8);
  assert.equal(r.years.length, 2);
  close(sum(r.years, "recognizedRevenue"), sum(r.quarters, "recognizedRevenue"));
  close(sum(r.quarters, "recognizedRevenue"), sum(r.months, "recognizedRevenue"));
  close(sum(r.years, "smPaid"), sum(r.months, "smPaid"));
  for (let i = 1; i < r.months.length; i++) close(r.months[i].startARR, r.months[i-1].endARR);
  close(r.summary.endingCash - r.months[0].startCash, r.summary.totalOpCF);
});
test("S&M quarter cash timing is independent from signing timing", () => {
  const r = forecastSaaS(base({ quarterSMSharesByYear: [[50, 25, 15, 10]], signingPattern: "BACK" }));
  close(r.summary.totalSM, 20000);
  close(r.quarters[0].smPaid, 10000);
  close(r.quarters[1].smPaid, 5000);
  close(r.quarters[2].smPaid, 3000);
  close(r.quarters[3].smPaid, 2000);
});
test("six-month horizon is exactly six months, not twelve", () => {
  const r = forecastSaaS(base({ months: 6, targetARR: 12000, quarterSMSharesByYear: [[60, 40]] }));
  assert.equal(r.months.length, 6);
  assert.equal(r.quarters.length, 2);
  assert.equal(r.years[0].endMonth, 6);
  close(r.summary.endingARR, 12000);
});
test("cash-neutral S&M headroom is cash collected less non-S&M cash outflows", () => {
  const r = forecastSaaS(base({ openingARR: 120000, targetARR: 120000, grossMargin: 0.8, otherOpexMonthly: 1000 }));
  close(r.months[0].cashCollected, 10000);
  close(r.months[0].cashNeutralSMCapacity, 7000);
  close(r.summary.totalOpCF, 84000);
});
test("collection delay can create temporary cash deficit even with positive ARR", () => {
  const r = forecastSaaS(base({ openingARR: 120000, targetARR: 120000, collectionLagMonths: 2, otherOpexMonthly: 1000 }));
  assert.equal(r.months[0].cashCollected, 0);
  assert.ok(r.summary.minimumCash < 0);
  assert.ok(r.summary.additionalLiquidityRequired > 0);
});
test("invalid quarterly budget split is rejected instead of silently normalized", () => {
  assert.throws(() => forecastSaaS(base({ quarterSMSharesByYear: [[50, 25, 25, 25]] })), /total 100%/);
});
