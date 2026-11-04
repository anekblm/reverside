import test from "node:test";
import assert from "node:assert/strict";
import { forecastSaaS, buildRevenueBridge } from "../src/engine/cohort-budget.js";

const close = (a,b)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(a),Math.abs(b)),a+" != "+b);
const input = (extra={}) => ({
  months:12, openingARR:500000, openingCustomers:50, acv:10000,
  targetARR:600000, annualChurn:0.2, annualExpansionComp:0.2,
  grossMargin:0.8, granularity:"quarter", cacByYear:[0],
  newARRByPeriod:[100000,0,0,0], ...extra
});
test("cohort customers, lost customers and ARR reconcile in every month and displayed period",()=>{
  const r=forecastSaaS(input());
  for(const m of r.months) {
    close(m.startCustomers-m.churnCustomers+m.newCustomers,m.endCustomers);
    close(m.startARR-m.churnARR+m.expansionARR+m.newARR,m.endARR);
  }
  for(const view of ["month","quarter","year"])for(const p of buildRevenueBridge(r.months,view)){
    close(p.startCustomers-p.churnCustomers+p.newCustomers,p.endCustomers);
    close(p.startARR-p.churnARR+p.expansionARR+p.newARR,p.endARR);
    close(p.originalNetRevenue+p.earlierNewNetRevenue+p.currentNewNetRevenue,p.recognizedRevenue);
    if(p.startCustomers>0) close(p.startACV,p.startARR/p.startCustomers);
    if(p.endCustomers>0) close(p.endACV,p.endARR/p.endCustomers);
  }
  close(r.years[0].startCustomers,50);
  close(r.years[0].newCustomers,10);
  assert.ok(r.years[0].churnCustomers>0);
  close(r.years[0].endCustomers,60-r.years[0].churnCustomers);
  close(r.years[0].endARR,600000);
  assert.ok(r.years[0].endACV>10000);
});
test("first invoice month creates customers and ARR without churn in same budget quarter",()=>{
  const r=forecastSaaS(input());
  for(const m of r.months.slice(0,3)){
    const newRows=m.cohortFlows.filter(c=>c.firstInvoiceMonth>=0);
    newRows.forEach(c=>{close(c.churnCustomers,0);close(c.churnARR,0);close(c.expansionARR,0)});
  }
  assert.ok(r.months[3].cohortFlows.some(c=>c.firstInvoiceMonth>=0&&c.churnCustomers>0));
});
test("year two begins with customer count and ACV at preceding year end",()=>{
  const r=forecastSaaS(input({months:24,newARRByPeriod:[100000,0,0,0,0,0,0,0],cacByYear:[0,0]}));
  close(r.years[1].startCustomers,r.years[0].endCustomers);
  close(r.years[1].startARR,r.years[0].endARR);
  close(r.years[1].startACV,r.years[0].endACV);
});
test("pre-revenue company can start from zero customers and ARR",()=>{
  const r=forecastSaaS(input({openingARR:0,openingCustomers:0,newARRByPeriod:[120000,0,0,0]}));
  close(r.months[0].startCustomers,0);
  close(r.months[0].startARR,0);
  assert.ok(r.months[0].newCustomers>0);
  assert.ok(r.months[0].recognizedRevenue>0);
});
test("incompatible opening customer count and ARR are rejected",()=>{
  assert.throws(()=>forecastSaaS(input({openingARR:0,openingCustomers:50})),/both be zero/);
  assert.throws(()=>forecastSaaS(input({openingARR:500000,openingCustomers:0})),/both be zero/);
});
