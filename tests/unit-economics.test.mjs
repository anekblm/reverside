import test from "node:test";
import assert from "node:assert/strict";
import { annualGrossProfitLtv } from "../src/engine/unit-economics.js";
import { animals, budgetDefaults, funnels } from "../src/domain/saas-profiles.js";

test("LTV proxy uses annual units and gross margin", () => {
  assert.equal(annualGrossProfitLtv(12000, 0.8, 0.2), 48000);
});
test("LTV proxy rejects zero churn rather than inventing infinite LTV", () => {
  assert.equal(annualGrossProfitLtv(12000, 0.8, 0), null);
  assert.equal(annualGrossProfitLtv(12000, 1.2, 0.2), null);
});
test("each animal has a coherent GTM allocation and conversion funnel", () => {
  for (const animal of Object.keys(animals)) {
    const a = budgetDefaults[animal];
    assert.ok(a, animal);
    assert.equal(a.sales + a.salesact + a.mkt, 100, animal);
    assert.ok(funnels[animal]?.steps?.length >= 4, animal);
  }
});
