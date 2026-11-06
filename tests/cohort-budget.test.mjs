import test from "node:test";
import assert from "node:assert/strict";
import { forecastSaaS, buildRevenueBridge } from "../src/engine/cohort-budget.js";

const base = (over = {}) => ({
  months: 12, openingARR: 500, acv: 1, targetARR: 600,
  annualChurn: 0, annualExpansionComp: 0, grossMargin: 0.8,
  granularity: "quarter", signingPattern: "FRONT", cacByYear: [1],
  ...over,
});
const approx = (a, b, note = "") => assert.ok(
  Math.abs(a-b)<1e-7*Math.max(1,Math.abs(a),Math.abs(b)), note+": "+a+" != "+b,
);
const sum = (a, key) => a.reduce((total, row)=>total+row[key],0);

test("FRONT/EVEN/BACK distribute New ARR by quarter and evenly within", () => {
  for(const [pattern,expected] of [["FRONT",[35,30,20,15]],["EVEN",[25,25,25,25]],["BACK",[15,20,25,40]]]) {
    const r=forecastSaaS(base({signingPattern:pattern}));
    r.quarters.forEach((q,i)=>approx(q.newARR,expected[i],pattern+" quarter "+i));
    for(let q=0;q<4;q++)for(let m=1;m<3;m++)
      approx(r.months[3*q+m].newARR,r.months[3*q].newARR);
    approx(r.summary.endingARR,600);
  }
});
test("first invoice month immediately earns full signed MRR, without monthly phasing",()=>{
  const r=forecastSaaS(base({granularity:"month",months:3,newARRByPeriod:[10,10,15]}));
  r.months.forEach((m,i)=>{
    approx(m.recognizedRevenue,m.endARR/12,"MRR in month "+i);
    approx(m.newARR/12,m.signedMRR);
  });
  approx(r.months[0].recognizedRevenue,510/12);
  approx(r.months[1].recognizedRevenue,520/12);
  approx(r.months[2].recognizedRevenue,535/12);
});
test("quarterly input 35 and 50% phasing reproduces exactly 4.375 in new revenue",()=>{
  const r=forecastSaaS(base({months:3,newARRByPeriod:[35],phasePercent:50}));
  approx(r.quarters[0].newARR,35);
  approx(r.quarters[0].currentNewNetRevenue,35/4*.5);
  approx(r.quarters[0].recognizedRevenue,125+35/4*.5);
  approx(sum(r.months,"recognizedRevenue"),r.quarters[0].recognizedRevenue);
  approx(r.months[0].startARR,500);
  approx(r.months[2].endARR,535);
});
test("quarter phasing of 25% is accepted, independent of contracted ARR signing",()=>{
  const cfg=base({openingARR:0,openingCustomers:0,acv:100,
    targetARR:100,granularity:"quarter",newARRByPeriod:[100,0,0,0],
    signingPattern:"EVEN",monthlySigningPattern:"EVEN",phasePercent:25});
  const m=forecastSaaS(cfg);
  approx(m.quarters[0].newARR,100);
  approx(m.quarters[0].recognizedRevenue,6.25);
  [1,2,3].forEach(q=>approx(m.quarters[q].recognizedRevenue,25));
  approx(m.years[0].recognizedRevenue,81.25);
  const front=forecastSaaS({...cfg,monthlySigningPattern:"FRONT"});
  approx(front.quarters[0].newARR,100);
  approx(front.quarters[0].recognizedRevenue,6.25);
  assert.notEqual(front.months[0].newARR,m.months[0].newARR);
  assert.throws(()=>forecastSaaS({...cfg,phasePercent:100}),/exceeds/);
});
test("monthly budget has no phantom phasing and quarter/year aggregate exactly",()=>{
  const r=forecastSaaS(base({granularity:"month",months:12}));
  approx(sum(r.months,"recognizedRevenue"),sum(r.quarters,"recognizedRevenue"));
  approx(sum(r.months,"recognizedRevenue"),sum(r.years,"recognizedRevenue"));
  approx(sum(r.quarters,"newARR"),sum(r.years,"newARR"));
  approx(sum(r.months,"churnARR"),sum(r.years,"churnARR"));
  approx(r.quarters[3].endARR,r.years[0].endARR);
  for(let i=1;i<r.months.length;i++)approx(r.months[i].startARR,r.months[i-1].endARR);
});
test("the three revenue buckets reclassify for the DISPLAYED period",()=>{
  const model=forecastSaaS(base({months:3,newARRByPeriod:[35]}));
  const months=buildRevenueBridge(model.months,"month");
  assert.equal(months[0].earlierNewNetRevenue,0);
  assert.ok(months[1].earlierNewNetRevenue>0);
  approx(months[0].currentNewNetRevenue+months[1].currentNewNetRevenue+months[2].currentNewNetRevenue+
    months[0].earlierNewNetRevenue+months[1].earlierNewNetRevenue+months[2].earlierNewNetRevenue,
    model.quarters[0].currentNewNetRevenue);
  approx(model.quarters[0].earlierNewNetRevenue,0);
});
test("new cohorts don't churn within the input quarter, but churn in following quarter",()=>{
  const r=forecastSaaS(base({months:6,newARRByPeriod:[35,0],annualChurn:0.24,annualExpansionComp:0.08}));
  r.months.slice(0,3).forEach(m=>m.cohortFlows.filter(c=>c.firstInvoiceMonth>=0)
    .forEach(c=>{approx(c.churnARR,0);approx(c.expansionARR,0);}));
  assert.ok(r.months[3].cohortFlows.some(c=>c.firstInvoiceMonth>=0&&c.churnARR>0));
});
test("monthly budget permits new-cohort churn starting in next month, not same month",()=>{
  const r=forecastSaaS(base({granularity:"month",months:3,newARRByPeriod:[10,0,0],annualChurn:.24}));
  const cohort=m=>r.months[m].cohortFlows.find(c=>c.firstInvoiceMonth===0);
  approx(cohort(0).churnARR,0);
  assert.ok(cohort(1).churnARR>0);
});
test("year 2 resets original base to customers already acquired in year 1",()=>{
  const r=forecastSaaS(base({months:24,yearShares:[100,0]}));
  assert.ok(r.years[1].originalNetRevenue>r.years[0].originalNetRevenue);
  approx(r.years[1].earlierNewNetRevenue,0);
  approx(r.years[1].currentNewNetRevenue,0);
});
test("manual ARR can be positive in a zero-preset-weight year",()=>{
  const r=forecastSaaS(base({months:24,granularity:"year",yearShares:[100,0],newARRByPeriod:[0,30]}));
  approx(r.years[0].newARR,0);
  approx(r.years[1].newARR,30);
});
test("monthly cash model balances: delayed receipts and quarterly independent S&M",()=>{
  const r=forecastSaaS(base({openingARR:120000,acv:1200,targetARR:120000,
    months:12,annualChurn:0,annualExpansionComp:0,collectionLagMonths:2,
    otherOpexMonthly:1000,openingCash:0,cacByYear:[200],
    quarterSMSharesByYear:[[50,25,15,10]]}));
  approx(r.months[0].cashCollected,0);
  assert.ok(r.summary.additionalLiquidityRequired>0);
  approx(r.summary.endingCash-r.months[0].startCash,r.summary.totalOpCF);
  approx(sum(r.months,"smPaid"),sum(r.quarters,"smPaid"));
});
