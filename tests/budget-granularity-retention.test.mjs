import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastSaaS,buildRevenueBridge} from '../src/engine/cohort-budget.js';

const approx=(actual,expected,why='')=>assert.ok(
  Math.abs(actual-expected) <= 1e-8*Math.max(1,Math.abs(actual),Math.abs(expected)),
  why+': '+actual+' != '+expected);
const input=(extra={})=>({
  months:12,openingARR:500000,openingCustomers:50,acv:10000,
  targetARR:630000,annualChurn:0.25,annualExpansionComp:0.51,
  grossMargin:0.8,granularity:'year',signingPattern:'EVEN',
  newARRByPeriod:[0],cacByYear:[0],...extra
});
test('YEAR budget: 25% churn and 51% expansion are each computed once on opening CARR',()=>{
  const r=forecastSaaS(input());
  const p=r.years[0];
  approx(p.startARR,500000);
  approx(p.churnARR,125000);
  approx(p.expansionARR,255000);
  approx(p.newARR,0);
  approx(p.endARR,630000);
  for(const m of r.months){
    approx(m.churnARR,125000/12);
    approx(m.expansionARR,255000/12);
  }
  // Full MRR earned in each month's end-of-month active run rate.
  const midYearWeight=13/24;
  approx(p.originalBaseRevenue,500000);
  approx(p.originalChurnRevenueImpact,-125000*midYearWeight);
  approx(p.originalExpansionRevenueImpact,255000*midYearWeight);
  approx(p.recognizedRevenue,500000+130000*midYearWeight);
  approx(p.existingRevenue,p.recognizedRevenue);
  approx(p.newRevenue,0);
  approx(p.startCustomers,50);
  approx(p.churnCustomers,12.5);
  approx(p.endCustomers,37.5);
  approx(p.endACV,630000/37.5);
});
test('QUARTER budget: retention calculated on opening quarter CARR, not compounded monthly',()=>{
  const r=forecastSaaS(input({granularity:'quarter',newARRByPeriod:[0,0,0,0]}));
  const grr=Math.pow(0.75,1/4);
  const nrr=Math.pow(1.26,1/4);
  const q1=r.quarters[0],q2=r.quarters[1];
  approx(q1.startARR,500000);
  approx(q1.churnARR,500000*(1-grr));
  approx(q1.expansionARR,500000*(nrr-grr));
  approx(q1.endARR,500000*nrr);
  approx(q2.startARR,q1.endARR);
  approx(q2.churnARR,q1.endARR*(1-grr));
  for(let q=0;q<4;q++) {
    for(let m=1;m<3;m++) {
      approx(r.months[3*q+m].churnARR,r.months[3*q].churnARR);
      approx(r.months[3*q+m].expansionARR,r.months[3*q].expansionARR);
    }
  }
  approx(r.years[0].endARR,630000);
  assert.notEqual(r.years[0].churnARR,125000,'quarterly and yearly budgeting must differ');
});
test('MONTH budget: retention recalculated from opening CARR each MONTH, not when displaying months',()=>{
  const r=forecastSaaS(input({granularity:'month',newARRByPeriod:Array(12).fill(0)}));
  const grr=Math.pow(.75,1/12), nrr=Math.pow(1.26,1/12);
  approx(r.months[0].churnARR,500000*(1-grr));
  approx(r.months[0].expansionARR,500000*(nrr-grr));
  approx(r.months[1].churnARR,r.months[0].endARR*(1-grr));
  approx(r.years[0].endARR,630000);
  assert.notEqual(r.years[0].churnARR,125000);
});
test('VIEW does not recalculate: year budget viewed monthly preserves 125k yearly churn',()=>{
  const r=forecastSaaS(input());
  const months=buildRevenueBridge(r.months,'month');
  const quarters=buildRevenueBridge(r.months,'quarter');
  const years=buildRevenueBridge(r.months,'year');
  const sum=(rs,key)=>rs.reduce((s,p)=>s+p[key],0);
  for(const level of [months,quarters,years]){
    approx(sum(level,'churnARR'),125000);
    approx(sum(level,'expansionARR'),255000);
    approx(sum(level,'recognizedRevenue'),r.summary.totalRecognizedRevenue);
  }
  approx(quarters[0].endARR,months[2].endARR);
  approx(years[0].endARR,months[11].endARR);
});
test('FIRST INVOICE: no churn or expansion on new cohorts in acquisition budget period',()=>{
  for(const granularity of ['year','quarter','month']){
    const count={year:1,quarter:4,month:12}[granularity];
    const amounts=Array(count).fill(0);amounts[0]=120000;
    const r=forecastSaaS(input({granularity,newARRByPeriod:amounts,annualChurn:.25,annualExpansionComp:.51}));
    const width={year:12,quarter:3,month:1}[granularity];
    for(const m of r.months.slice(0,width))for(const c of m.cohortFlows.filter(c=>c.firstInvoiceMonth>=0)){
      approx(c.churnARR,0);approx(c.expansionARR,0);
    }
    assert.ok(r.months[0].newARR>0);
    approx(r.months[0].recognizedRevenue,r.months[0].endARR/12);
    if(width<12) assert.ok(r.months[width].cohortFlows.some(c=>c.firstInvoiceMonth>=0&&c.churnARR>0));
  }
});
test('REVENUE: displayed period recognition is built from opening CARR and weighted monthly changes',()=>{
  const r=forecastSaaS(input({granularity:'quarter',newARRByPeriod:[35000,30000,20000,15000]}));
  for(const view of ['month','quarter','year'])for(const p of buildRevenueBridge(r.months,view)){
    approx(p.originalBaseRevenue+p.originalChurnRevenueImpact+p.originalExpansionRevenueImpact,
      p.originalNetRevenue);
    approx(p.earlierNewBaseRevenue+p.earlierNewChurnRevenueImpact+p.earlierNewExpansionRevenueImpact,
      p.earlierNewNetRevenue);
    approx(p.currentNewRevenue+p.currentNewChurnRevenueImpact+p.currentNewExpansionRevenueImpact,
      p.currentNewNetRevenue);
    approx(p.originalNetRevenue+p.earlierNewNetRevenue+p.currentNewNetRevenue,p.recognizedRevenue);
    approx(p.existingRevenue+p.newRevenue,p.recognizedRevenue);
    approx(p.originalEndARR+p.earlierEndARR+p.currentEndARR,p.endARR);
  }
  const q=r.quarters;
  assert.ok(q[1].earlierNewNetRevenue>0);
  approx(r.years[0].earlierNewNetRevenue,0);
});
test('PHASING: no new ARR means phasing cannot change revenue or churn',()=>{
  const with50=forecastSaaS(input({granularity:'quarter',newARRByPeriod:[0,0,0,0],phasePercent:50}));
  const with100=forecastSaaS(input({granularity:'quarter',newARRByPeriod:[0,0,0,0],phasePercent:100}));
  approx(with50.summary.totalRecognizedRevenue,with100.summary.totalRecognizedRevenue);
  approx(with50.summary.endingARR,with100.summary.endingARR);
  approx(with50.years[0].churnARR,with100.years[0].churnARR);
});
test('CASH and ARR remain separate: collecting with lag changes cash, not recognized revenue',()=>{
  const now=forecastSaaS(input({openingCash:0,collectionLagMonths:0,otherOpexMonthly:1000}));
  const lag=forecastSaaS(input({openingCash:0,collectionLagMonths:2,otherOpexMonthly:1000}));
  approx(now.summary.totalRecognizedRevenue,lag.summary.totalRecognizedRevenue);
  approx(now.summary.endingARR,lag.summary.endingARR);
  assert.notEqual(now.summary.endingCash,lag.summary.endingCash);
});

test('YEAR phasing cannot change the explicitly selected quarter New CARR shares',()=>{
  const target=120000;
  const base=input({openingARR:0,openingCustomers:0,targetARR:target,
    annualChurn:0,annualExpansionComp:0,granularity:'year',
    newARRByPeriod:[target]});
  for(const [preset,shares] of [
    ['FRONT',[35,30,20,15]],['EVEN',[25,25,25,25]],
    ['BACK',[15,20,25,40]]
  ]) {
    const auto=forecastSaaS({...base,signingPattern:preset});
    const range=auto.periodPhaseRanges[0];
    const wanted=(range[0]+range[1])/2;
    const chosen=forecastSaaS({...base,signingPattern:preset,phasePercent:wanted});
    approx(chosen.periodPhasing[0],wanted);
    for(let q=0;q<4;q++){
      approx(auto.quarters[q].newARR,target*shares[q]/100);
      approx(chosen.quarters[q].newARR,target*shares[q]/100);
    }
    assert.throws(()=>forecastSaaS({...base,signingPattern:preset,
      phasePercent:range[0]-2}),/must be finite/);
    assert.throws(()=>forecastSaaS({...base,signingPattern:preset,
      phasePercent:range[1]+2}),/exceeds/);
  }
});
