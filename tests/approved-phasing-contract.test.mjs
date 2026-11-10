import test from 'node:test';
import assert from 'node:assert/strict';
import {forecastSaaS,buildRevenueBridge} from '../src/engine/cohort-budget.js';

const close=(got,expected)=>assert.ok(
  Math.abs(got-expected)<=1e-7*Math.max(1,Math.abs(got),Math.abs(expected)),
  got+' != '+expected);
const common={months:12,openingARR:0,openingCustomers:0,acv:100,
  targetARR:100,grossMargin:1,annualChurn:0,annualExpansionComp:0,
  cacByYear:[0],signingPattern:'EVEN',monthlySigningPattern:'EVEN'};
const sum=(rows,key)=>rows.reduce((x,row)=>x+row[key],0);

test('USER APPROVED: 100 New CARR Q1, 25% revenue phasing => 6.25/25/25/25 and 81.25',()=>{
  const plan=forecastSaaS({...common,granularity:'quarter',
    newARRByPeriod:[100,0,0,0],phasePercent:25});
  const qs=plan.quarters;
  close(qs[0].newARR,100);
  [6.25,25,25,25].forEach((rev,q)=>close(qs[q].recognizedRevenue,rev));
  close(plan.summary.totalRecognizedRevenue,81.25);
  close(plan.summary.endingARR,100);
  close(qs[0].currentNewRevenue+qs[0].currentNewRealizationImpact,3.125);
  close(qs[0].earlierNewNetRevenue,3.125);
  close(qs[0].currentNewRealizationImpact+qs[0].earlierNewRealizationImpact,-(100/6-6.25));
  close(plan.years[0].currentNewNetRevenue,3.125);
  close(plan.years[0].earlierNewNetRevenue,78.125);
  close(sum(plan.months.slice(0,3),'recognizedRevenue'),6.25);
  close(sum(plan.months,'recognizedRevenue'),81.25);
  close(sum(buildRevenueBridge(plan.months,'month'),'recognizedRevenue'),81.25);
  close(sum(buildRevenueBridge(plan.months,'quarter'),'recognizedRevenue'),81.25);
  close(sum(buildRevenueBridge(plan.months,'year'),'recognizedRevenue'),81.25);
});

test('Month input accepts 25% PHASING as a new input calculation, not a view recalculation',()=>{
  const amounts=[100,...Array(11).fill(0)];
  const plan=forecastSaaS({...common,granularity:'month',
    newARRByPeriod:amounts,phasePercent:25});
  close(plan.months[0].recognizedRevenue,100/12*.25);
  close(plan.months[1].recognizedRevenue,100/12);
  close(plan.summary.totalRecognizedRevenue,(11+.25)*100/12);
  close(plan.summary.endingARR,100);
  const other=forecastSaaS({...common,granularity:'month',
    newARRByPeriod:amounts,phasePercent:100});
  assert.notEqual(other.summary.totalRecognizedRevenue,plan.summary.totalRecognizedRevenue);
});

test('Two independent signing distributions: yearly FRONT and within-quarter EVEN',()=>{
  const plan=forecastSaaS({...common,granularity:'year',newARRByPeriod:[100],
    signingPattern:'FRONT',monthlySigningPattern:'EVEN'});
  [35,30,20,15].forEach((v,q)=>close(plan.quarters[q].newARR,v));
  close(plan.months[0].newARR,plan.months[1].newARR);
  close(plan.months[1].newARR,plan.months[2].newARR);
});

test('Within-quarter FRONT/BACK does not overwrite between-quarter shares',()=>{
  const amount=100;
  const e=forecastSaaS({...common,granularity:'year',newARRByPeriod:[amount],
    signingPattern:'BACK',monthlySigningPattern:'EVEN'});
  const f=forecastSaaS({...common,granularity:'year',newARRByPeriod:[amount],
    signingPattern:'BACK',monthlySigningPattern:'FRONT'});
  const b=forecastSaaS({...common,granularity:'year',newARRByPeriod:[amount],
    signingPattern:'BACK',monthlySigningPattern:'BACK'});
  [15,20,25,40].forEach((v,q)=>{
    close(e.quarters[q].newARR,v);
    close(f.quarters[q].newARR,v);
    close(b.quarters[q].newARR,v);
  });
  assert.ok(f.months[0].newARR>f.months[2].newARR);
  assert.ok(b.months[0].newARR<b.months[2].newARR);
  close(f.summary.endingARR,e.summary.endingARR);
  close(b.summary.endingARR,e.summary.endingARR);
});

test('Each quarter may have a different month signing pattern in the engine',()=>{
  const plan=forecastSaaS({...common,granularity:'year',newARRByPeriod:[100],
    signingPattern:'EVEN',monthlySigningPattern:'EVEN',
    monthlyPatternsByQuarter:['BACK','FRONT','EVEN','BACK']});
  for(let q=0;q<4;q++)close(plan.quarters[q].newARR,25);
  assert.ok(plan.months[0].newARR<plan.months[2].newARR);
  assert.ok(plan.months[3].newARR>plan.months[5].newARR);
  close(plan.months[6].newARR,plan.months[8].newARR);
});

test('Calculated period totals are immutable when only displaying another granularity',()=>{
  const p=forecastSaaS({...common,months:24,granularity:'quarter',
    openingARR:500000,openingCustomers:50,acv:10000,targetARR:900000,
    annualChurn:.25,annualExpansionComp:.51,
    newARRByPeriod:[35000,30000,20000,15000,40000,30000,20000,10000],
    cacByYear:[1200,1200],signingPattern:'FRONT',
    monthlySigningPattern:'BACK',phasePercent:25});
  const q=buildRevenueBridge(p.months,'quarter'),y=buildRevenueBridge(p.months,'year');
  for(const k of ['recognizedRevenue','churnARR','expansionARR','newARR',
                  'smPaid','cashCollected','opCF']){
    close(sum(p.months,k),sum(q,k));
    close(sum(q,k),sum(y,k));
  }
  close(q[3].endARR,y[0].endARR);
  close(q[7].endARR,y[1].endARR);
  for(const period of [...q,...y]){
    close(period.originalNetRevenue+period.earlierNewNetRevenue+
          period.currentNewNetRevenue,period.recognizedRevenue);
    close(period.startARR-period.churnARR+period.expansionARR+period.newARR,
          period.endARR);
  }
});
