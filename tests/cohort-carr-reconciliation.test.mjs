import test from 'node:test';
import assert from 'node:assert/strict';
import { forecastSaaS,buildRevenueBridge } from '../src/engine/cohort-budget.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a),Math.abs(b)),
  a+' does not equal '+b);
const inputs={openingARR:500000,openingCustomers:50,acv:10000,targetARR:1000000,
  annualChurn:.25,annualExpansionComp:.22,grossMargin:.8,cacByYear:[500,500,500]};
const total=(items,key)=>items.reduce((sum,item)=>sum+item[key],0);
test('one CARR/Revenue bridge reconciles every cohort, period and view',()=>{
  for(const granularity of ['year','quarter','month'])
    for(const signingPattern of ['FRONT','EVEN','BACK'])
      for(const months of [12,24,36]){
        const plan=forecastSaaS({...inputs,granularity,signingPattern,months});
        for(const view of ['year','quarter','month']){
          const periods=buildRevenueBridge(plan.months,view);
          for(const p of periods){
            close(p.startARR,p.originalStartARR+p.earlierStartARR+p.currentStartARR);
            close(p.endARR,p.originalEndARR+p.earlierEndARR+p.currentEndARR);
            close(p.churnARR,p.originalChurnARR+p.earlierChurnARR+p.currentChurnARR);
            close(p.expansionARR,p.originalExpansionARR+p.earlierExpansionARR+p.currentExpansionARR);
            close(p.newARR,p.originalNewARR+p.earlierNewARR+p.currentNewARR);
            close(p.existingRevenue,p.originalNetRevenue);
            close(p.newRevenue,p.earlierNewNetRevenue+p.currentNewNetRevenue);
            close(p.recognizedRevenue,p.existingRevenue+p.newRevenue);
            for(const group of ['original','earlier','current']){
              close(p[group+'EndARR'],p[group+'StartARR']-
                p[group+'ChurnARR']+p[group+'ExpansionARR']+p[group+'NewARR']);
              close(p[group+'EndCustomers'],p[group+'StartCustomers']-
                p[group+'ChurnCustomers']+p[group+'NewCustomers']);
            }
          }
          close(total(periods,'recognizedRevenue'),total(plan.months,'recognizedRevenue'));
        }
        for(const year of plan.years)
          close(year.earlierNewNetRevenue,0); // A whole displayed year: all this year's new cohorts are C
      }
});
test('B accumulates only earlier same-year customers and resets at the year boundary',()=>{
  const plan=forecastSaaS({...inputs,granularity:'quarter',signingPattern:'FRONT',months:24});
  assert.ok(plan.quarters[1].earlierNewNetRevenue>0);
  assert.ok(plan.quarters[1].earlierStartARR>0);
  close(plan.quarters[4].earlierStartARR,0);
  assert.ok(plan.quarters[4].originalStartARR>plan.quarters[0].originalStartARR);
  for(const year of plan.years)close(year.earlierStartARR,0);
});
