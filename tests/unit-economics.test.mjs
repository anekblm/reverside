import test from "node:test";
import assert from "node:assert/strict";
import { annualGrossProfitLtv, cohortLifetimeGrossProfit, cacLimits } from "../src/engine/unit-economics.js";
import { animals, animalForACV, toEUR, budgetDefaults, funnels } from "../src/domain/saas-profiles.js";
import { forecastSaaS } from "../src/engine/cohort-budget.js";

test("monthly churn LTV matches the lifetime geometric sum at entry gross profit", () => {
  for(const churnRate of [0.25,0.02,0.8]) for(const acquisitionMonth of [0,5,11]) {
    const ltv=cohortLifetimeGrossProfit(10000,0.8,{churnRate,churnPeriod:'month',acquisitionMonth});
    assert.ok(Math.abs(ltv-10000*0.8/12/churnRate)<1e-7);
  }
  assert.ok(annualGrossProfitLtv(12000,0.8,0.2)<48000);
});
test("LTV proxy rejects zero churn rather than inventing infinite LTV", () => {
  assert.equal(annualGrossProfitLtv(12000, 0.8, 0), null);
  assert.equal(annualGrossProfitLtv(12000, 1.2, 0.2), null);
});

test("LTV matches an independent engine cohort plus its repeated-year geometric tail",()=>{
  let cases=0;
  for(const churnPeriod of ['year','quarter','month'])
  for(const churnRate of [0.02,0.25,0.8])
  for(const acquisitionMonth of [0,5,11])
  for(const retentionPhasePercent of [0,50,100])
  for(const newCustomerRetentionEnabled of [true,false]) {
    const monthlyWeights=cases%2?Array.from({length:12},(_,i)=>i===11?1:0):Array(12).fill(1);
    const firstMonthPhasePercent=cases%3?100:67;
    const input={months:24,openingARR:0,openingCustomers:0,acv:10000,targetARR:0,
      granularity:'month',churnPeriod,churnRate,annualExpansionComp:0,grossMargin:0.8,
      newCustomerRetentionEnabled,newCustomerFirstMonthPhasePercent:firstMonthPhasePercent,
      existingRetention:{monthlyWeights,phasePercent:retentionPhasePercent},
      newARRByPeriod:Array.from({length:24},(_,i)=>i===acquisitionMonth?10000:0)};
    const model=forecastSaaS(input);
    const annualLoss=1-(1-churnRate)**({year:1,quarter:4,month:12}[churnPeriod]);
    const reference=(model.years[0].recognizedRevenue+model.years[1].recognizedRevenue/annualLoss)*0.8;
    const ltv=cohortLifetimeGrossProfit(10000,0.8,{churnPeriod,churnRate,acquisitionMonth,
      monthlyWeights,retentionPhasePercent,firstMonthPhasePercent,newCustomerRetentionEnabled});
    assert.ok(Math.abs(ltv-reference)<1e-7*Math.max(1,reference),JSON.stringify(input));
    cases++;
  }
  assert.equal(cases,162);
});

test("acquisition profile caps recommended CAC without changing LTV or maximum CAC",()=>{
  assert.deepEqual(cacLimits(100000,1000,7),{maxCAC:100000/3,recommendedCAC:7000});
  assert.deepEqual(cacLimits(100000,1000,12),{maxCAC:100000/3,recommendedCAC:12000});
  assert.equal(cacLimits(10000,1000,7).recommendedCAC,2000);
  assert.deepEqual(cacLimits(null,1000,12),{maxCAC:null,recommendedCAC:null});
  for(const [name,data] of Object.entries(animals)) for(const currency of Object.keys(toEUR))
    assert.equal(animalForACV(data.acv/toEUR[currency],currency),name);
});
test("each animal has a coherent GTM allocation and conversion funnel", () => {
  for (const animal of Object.keys(animals)) {
    const a = budgetDefaults[animal];
    assert.ok(a, animal);
    assert.equal(a.sales + a.salesact + a.mkt, 100, animal);
    assert.ok(funnels[animal]?.steps?.length >= 4, animal);
  }
});
