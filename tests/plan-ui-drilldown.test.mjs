import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  animals,targetDefaults,toEUR,currencyFormats,paybackBenchmarks,cacRatios,
  growthMultipliers,growthMaxMonths,budgetDefaults,funnels
} from '../src/domain/saas-profiles.js';
import { annualGrossProfitLtv } from '../src/engine/unit-economics.js';
import { forecastSaaS,buildRevenueBridge,maximumNewRevenuePhase } from '../src/engine/cohort-budget.js';
import { renderCashPanel } from '../src/features/plan/cash-panel.js';

const originalApp=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const appBody=originalApp.replace(/^import .*;$/gm,'') + '\nreturn window;';

function createApp(timeframe=36){
  const controls={};
  const node=id=>controls[id]??(controls[id]={
    value:'',checked:false,innerHTML:'',textContent:'',style:{},dataset:{},
    classList:{add(){},remove(){},contains(){return false}},
    querySelector(){return {style:{}}}
  });
  Object.entries({
    customers:50,revenue:500000,expectedACV:10000,targetRevenue:1000000,
    productName:'Regression',churnSlider:25,cogsSlider:80,newCustomersPercentSlider:60,
    plChurnSlider:25,plExpansionSlider:25,plQuarterPhasingSlider:66.7,
    cashOpening:0,cashOtherOpex:1000,cashCollectionLag:0
  }).forEach(([id,v])=>node(id).value=String(v));
  const doc={
    getElementById:node,
    querySelector:selector=>selector==='.container'?node('container'):
      {value:selector.includes('currency')?'SEK':
        selector.includes('companyStage')?'early':
        selector.includes('timeframe')?String(timeframe):''},
    querySelectorAll:()=>[],
  };
  const win={_qtr:{},scrollTo(){},confirm(){return true;}};
  const factory=new Function('document','window','animals','targetDefaults','toEUR',
    'currencyFormats','paybackBenchmarks','cacRatios','growthMultipliers',
    'growthMaxMonths','budgetDefaults','funnels','annualGrossProfitLtv',
    'forecastSaaS','maximumNewRevenuePhase','renderCashPanel',appBody);
  const app=factory(doc,win,animals,targetDefaults,toEUR,currencyFormats,
    paybackBenchmarks,cacRatios,growthMultipliers,growthMaxMonths,budgetDefaults,
    funnels,annualGrossProfitLtv,forecastSaaS,maximumNewRevenuePhase,renderCashPanel);
  app.goToStep2();
  app.goToStep3();
  return {app,node,win};
}
const width=node=>{
  const m=node('plTable').innerHTML.match(/grid-template-columns:([^;]+);gap:5px;width:/);
  assert.ok(m,'Missing original forecast grid');
  return m[1].trim().split(/\s+/).length;
};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6*Math.max(1,Math.abs(a),Math.abs(b)),a+' != '+b);

test('36 months starts with 3 year columns; Y2 Q3 expands only Jul–Sep, then collapses',()=>{
  const {app,node}=createApp(36);
  assert.equal(width(node),4);
  app.togglePlQtr(1);
  assert.equal(width(node),8);
  app.togglePlMonth(1,2);
  assert.equal(width(node),11);
  for(const month of ['Jul','Aug','Sep'])
    assert.match(node('plTable').innerHTML,new RegExp('>'+month+'</div>'));
  assert.match(node('plTable').innerHTML,/Y2 Q3 ▲/);
  app.togglePlMonth(1,2);
  assert.equal(width(node),8);
  app.togglePlQtr(1);
  assert.equal(width(node),4);
});
test('A six-month plan displays only modeled quarters and no premature break-even marker',()=>{
  const {app,node,win}=createApp(6);
  const plan=win._latestMonthlyPlan;
  assert.equal(width(node),2);
  assert.doesNotMatch(node('plTable').innerHTML,/Year 1 ✓/);
  app.togglePlQtr(0);
  assert.equal(width(node),4);
  assert.doesNotMatch(node('plTable').innerHTML,/Y1 Q[34]/);
  app.togglePlMonth(0,1);
  assert.equal(width(node),7);
  assert.match(node('plTable').innerHTML,/>Jun<\/div>/);
  assert.doesNotMatch(node('plTable').innerHTML,/>Jul<\/div>/);
  assert.equal(win._latestMonthlyPlan,plan);
});
test('Period CARR scales the displayed rate to the column length without recalculating the plan',()=>{
  const {app,node,win}=createApp(6);
  const plan=win._latestMonthlyPlan;
  const opening=()=>node('plTable').innerHTML.split('>Opening CARR</div>')[1];
  const firstCell=()=>opening().match(/^<div[^>]*>\s*([^<]+)/)[1].trim();
  assert.equal(firstCell(),currencyFormats.SEK(500000));
  app.setPlCarrView('period');
  assert.equal(firstCell(),currencyFormats.SEK(250000));
  app.togglePlQtr(0);
  assert.equal(firstCell(),currencyFormats.SEK(125000));
  app.togglePlMonth(0,0);
  assert.equal(firstCell(),currencyFormats.SEK(500000/12));
  const withMonths=node('plTable').innerHTML;
  app.setPlCarrView('fullYear');
  assert.equal(firstCell(),currencyFormats.SEK(500000));
  assert.equal(win._latestMonthlyPlan,plan);
  assert.equal(width(node),7);
  const revenueCell=html=>html.split('>Recognized Revenue</div>')[1].match(/^<div[^>]*>\s*([^<]+)/)[1].trim();
  assert.equal(revenueCell(node('plTable').innerHTML),revenueCell(withMonths));
});
test('quarter phasing slider modifies the same cohort engine while preserving open month columns',()=>{
  const {app,node,win}=createApp(36);
  app.togglePlQtr(0);
  app.togglePlMonth(0,0);
  const initial=win._latestMonthlyPlan.summary.totalRecognizedRevenue;
  app.onQuarterPhasingChange('50');
  assert.equal(width(node),11); // 1 label + 3 months + 4 quarter totals + Y1 total + Y2 + Y3
  assert.match(node('plTable').innerHTML,/Y1 Q1 ▲/);
  assert.equal(node('plQuarterPhasingDisplay').textContent,'50.0%');
  win._latestMonthlyPlan.periodPhasing.forEach(p=>close(p,50));
  assert.notEqual(win._latestMonthlyPlan.summary.totalRecognizedRevenue,initial);
  for(const year of win._latestMonthlyPlan.years){
    close(year.originalNetRevenue+year.earlierNewNetRevenue+year.currentNewNetRevenue,year.recognizedRevenue);
    close(year.startCustomers-year.churnCustomers+year.newCustomers,year.endCustomers);
  }
  app.resetPL();
  win._latestMonthlyPlan.periodPhasing.forEach(p=>close(p,200/3));
});
test('normal strategy and cash panel stay operational with nested expansion',()=>{
  const {app,node,win}=createApp(12);
  app.togglePlQtr(0);
  app.togglePlMonth(0,0);
  app.selectStrategy('efficient');
  assert.match(node('cashFlowPanel').innerHTML,/Operating cash flow/);
  assert.match(node('plTable').innerHTML,/B – NEW CUSTOMERS/);
  assert.equal(win._latestMonthlyPlan.months.length,12);
});

test('existing forecast grid shows full A/B/C Revenue Bridge and reconciles in every view',()=>{
  const {app,node,win}=createApp(36);
  const required=[
    '>Opening CARR</div>',
    'A – EXISTING CUSTOMERS',
    '(from previous year)',
    '>Opening CARR</div>',
    '>− Churn CARR</div>',
    '>+ Expansion CARR</div>',
    '>Closing CARR</div>',
    '>Recognized Revenue</div>',
    'B – NEW CUSTOMERS',
    '(acquired this year - accumulated)',
    '>Opening CARR</div>',
    '+ Transferred from C',
    '>− Churn CARR</div>',
    '>+ Expansion CARR</div>',
    '>Closing CARR</div>',
    '>Recognized Revenue</div>',
    'C – NEW CUSTOMERS',
    '(acquired this year - new in period)',
    '>New CARR</div>',
    '>Recognized Revenue</div>',
    'Recognized Revenue – Existing (A)',
    'Recognized Revenue – New (B+C)',
    'Total Recognized Revenue',
    'Closing CARR · A + B + C'
  ];
  const checkLabels=()=>{
    const html=node('plTable').innerHTML;
    let position=-1;
    for(const label of required) {
      position=html.indexOf(label,position+1);
      assert.notEqual(position,-1,'Missing or out-of-order label '+label);
    }
    assert.ok(!html.includes('id="revenueMatrix"'),'A separate revenue table must not be added');
    assert.ok(!html.includes('New MRR · first invoice'),
      'Remove the obsolete duplicate ARR/MRR block');
  };
  const reconcile=p=>{
    close(p.originalBaseRevenue+p.originalChurnRevenueImpact+
      p.originalExpansionRevenueImpact,p.originalNetRevenue);
    close(p.earlierNewBaseRevenue+p.earlierNewChurnRevenueImpact+
      p.earlierNewExpansionRevenueImpact+p.earlierNewRealizationImpact,p.earlierNewNetRevenue);
    close(p.originalNetRevenue+p.earlierNewNetRevenue+
      p.currentNewNetRevenue,p.recognizedRevenue);
    close(p.existingRevenue,p.originalNetRevenue);
    close(p.newRevenue,p.earlierNewNetRevenue+p.currentNewNetRevenue);
    close(p.existingRevenue+p.newRevenue,p.recognizedRevenue);
    close(p.originalStartARR+p.earlierStartARR+p.currentStartARR,p.startARR);
    close(p.originalEndARR+p.earlierEndARR+p.currentEndARR,p.endARR);
    for(const x of ['original','earlier','current']) {
      const transferDirection=x==='earlier'?1:x==='current'?-1:0;
      close(p[x+'StartARR']-p[x+'ChurnARR']+p[x+'ExpansionARR']+
        p[x+'NewARR']+transferDirection*p.earlierTransferARR,p[x+'EndARR']);
    }
  };
  for(const key of ['A','B']) app.togglePlCohort(key);
  checkLabels();
  win._latestMonthlyPlan.years.forEach(reconcile);
  app.togglePlQtr(0);
  checkLabels();
  win._latestMonthlyPlan.quarters.forEach(reconcile);
  app.togglePlMonth(0,1);
  checkLabels();
  buildRevenueBridge(win._latestMonthlyPlan.months,'month').forEach(reconcile);
  const q2=win._latestMonthlyPlan.quarters[1];
  assert.ok(q2.earlierNewNetRevenue>0,'Q2 must include prior Q1 new customers');
  assert.ok(win._latestMonthlyPlan.years[0].earlierNewNetRevenue>0,
    'Year totals include revenue from subsequent months in B');
});

test('A and B toggle independently, while C always shows only its two summary rows',()=>{
  const {app,node,win}=createApp(12);
  const plan=win._latestMonthlyPlan;
  const html=()=>node('plTable').innerHTML;
  for(const key of ['A','B']) {
    assert.match(html(),new RegExp('id="plCohortToggle'+key+'" aria-expanded="false"'));
  }
  assert.equal((html().match(/>Recognized Revenue<\/div>/g)??[]).length,3);
  assert.doesNotMatch(html(),/plCohortToggleC/);
  assert.doesNotMatch(html(),/Revenue before changes|− Revenue phasing|Transferred from C/);
  app.togglePlCohort('B');
  assert.match(html(),/id="plCohortToggleB" aria-expanded="true"/);
  assert.match(html(),/− Revenue phasing/);
  assert.match(html(),/Transferred from C/);
  assert.match(html(),/id="plCohortToggleA" aria-expanded="false"/);
  app.togglePlQtr(0);
  app.togglePlMonth(0,1);
  assert.match(html(),/id="plCohortToggleB" aria-expanded="true"/);
  app.togglePlCohort('B');
  assert.doesNotMatch(html(),/− Revenue phasing/);
  assert.equal(win._latestMonthlyPlan,plan);
});

test('budget granularity Year/Quarter/Month changes the input engine, not the display layout',()=>{
  const {app,node,win}=createApp(36);
  assert.equal(width(node),4);
  assert.equal(win._latestMonthlyPlan.granularity,'quarter');
  assert.ok(!node('planPatternEVEN').disabled);
  app.onPlanBudgetGranularityChange('year');
  assert.equal(win._latestMonthlyPlan.granularity,'year');
  assert.equal(win._latestMonthlyPlan.periodPhasing.length,3);
  assert.match(node('plQuarterPhasingNote').textContent,/acquisition year/);
  assert.equal(Number(node('plQuarterPhasingSlider').min),0);
  assert.ok(Number(node('plQuarterPhasingSlider').max)>50);
  const signedBefore=win._latestMonthlyPlan.quarters.map(p=>p.newARR);
  app.onQuarterPhasingChange('50');
  win._latestMonthlyPlan.periodPhasing.forEach(p=>close(p,50));
  win._latestMonthlyPlan.quarters.forEach((q,i)=>close(q.newARR,signedBefore[i]));
  app.onQuarterPhasingChange('25'); // valid independent revenue realization
  win._latestMonthlyPlan.periodPhasing.forEach(p=>close(p,25));
  assert.equal(width(node),4);
  app.onPlanBudgetGranularityChange('quarter');
  assert.equal(win._latestMonthlyPlan.granularity,'quarter');
  assert.equal(win._latestMonthlyPlan.periodPhasing.length,12);
  assert.equal(Number(node('plQuarterPhasingSlider').min),0);
  app.onPlanBudgetGranularityChange('month');
  assert.equal(win._latestMonthlyPlan.granularity,'month');
  assert.equal(win._latestMonthlyPlan.periodPhasing.length,36);
  assert.ok(!node('plQuarterPhasingSlider').disabled);
  assert.ok(node('planPatternFRONT').disabled && node('planPatternBACK').disabled);
  assert.ok(node('planMonthPatternFRONT').disabled && node('planMonthPatternBACK').disabled);
  assert.equal(width(node),4);
  const before=win._latestMonthlyPlan.summary.totalRecognizedRevenue;
  app.onQuarterPhasingChange('50');
  assert.notEqual(win._latestMonthlyPlan.summary.totalRecognizedRevenue,before);
  assert.equal(node('plQuarterPhasingDisplay').textContent,'50.0%');
  app.onPlanBudgetGranularityChange('quarter');
  assert.ok(!node('planPatternFRONT').disabled);
  app.setQtrScenario('FRONT');
  assert.equal(win._latestMonthlyPlan.signingPattern,'FRONT');
  assert.equal(width(node),4);
  app.togglePlQtr(0);
  assert.equal(width(node),8);
  assert.ok(!node('planPatternFRONT').disabled);
});

test('manual New CARR inputs obey budget periods and deactivate preset buttons without moving the grid',()=>{
  const {app,node,win}=createApp(36);
  app.togglePlanPeriodInputs();
  assert.equal(node('planPeriodEditor').style.display,'block');
  assert.ok(node('planPeriodInputGrid').innerHTML.includes('Y1 Q1'));
  app.onPlanPeriodValueChange(0,'125000');
  close(win._latestMonthlyPlan.quarters[0].newARR,125000);
  assert.ok(node('planPatternEVEN').disabled);
  assert.ok(node('planPatternFRONT').disabled);
  assert.equal(width(node),4);
  app.setQtrScenario('BACK'); // ignored while manual values are authoritative
  assert.notEqual(win._latestMonthlyPlan.signingPattern,'BACK');
  app.resetPlanPeriodInputs();
  assert.equal(win._latestMonthlyPlan.manualBudget,false);
  assert.ok(!node('planPatternEVEN').disabled);
  assert.equal(width(node),4);
  app.togglePlanPeriodInputs();
  assert.equal(node('planPeriodEditor').style.display,'none');
});

test('YEAR retention explicitly derives 25% churn and 51% expansion from opening CARR in the ORIGINAL matrix',()=>{
  const {app,node,win}=createApp(12);
  app.onPlanBudgetGranularityChange('year');
  app.togglePlanPeriodInputs();
  app.onPlanPeriodValueChange(0,'0'); // remove New CARR to isolate existing cohort
  node('plChurnSlider').value='25';
  node('plExpansionSlider').value='51';
  app.onPLSlider();
  const y=win._latestMonthlyPlan.years[0];
  close(y.startARR,500000);
  close(y.churnARR,125000);
  close(y.expansionARR,255000);
  close(y.newARR,0);
  close(y.endARR,630000);
  close(y.originalBaseRevenue,500000);
  close(y.originalChurnRevenueImpact,-62500);
  close(y.originalExpansionRevenueImpact,127500);
  close(y.recognizedRevenue,565000);
  close(y.endACV,y.endARR/y.endCustomers);
  assert.match(node('plTable').innerHTML,/Contracted ACV \(end\) = Closing CARR \/ Customers/);
  assert.match(node('planBudgetGranularityNote').textContent,/New ARR budget: YEAR/);
  assert.ok(node('plQuarterPhasingSlider').disabled,'No new cohort means phasing has no relevance');
  assert.equal(node('plQuarterPhasingDisplay').textContent,'—');
  const before=win._latestMonthlyPlan.summary.totalRecognizedRevenue;
  app.onQuarterPhasingChange('50');
  close(win._latestMonthlyPlan.summary.totalRecognizedRevenue,before);
  app.togglePlQtr(0);
  const qs=win._latestMonthlyPlan.quarters;
  close(qs.reduce((n,q)=>n+q.churnARR,0),125000);
  close(qs.reduce((n,q)=>n+q.expansionARR,0),255000);
  close(qs.reduce((n,q)=>n+q.recognizedRevenue,0),y.recognizedRevenue);
});

test('Existing A shows the full revenue bridge, month-only detail and customer counts in the same grid',()=>{
  const {app,node,win}=createApp(12);
  app.onPlanBudgetGranularityChange('year');
  app.onPlanPeriodValueChange(0,'0');
  node('plChurnSlider').value='25';
  node('plExpansionSlider').value='20';
  app.onPLSlider();
  const plan=win._latestMonthlyPlan;
  const year=plan.years[0];
  close(year.originalEndARR,475000);
  close(year.originalChurnCustomers,12.5);
  close(year.originalEndCustomers,37.5);
  close(year.originalBaseRevenue,500000);
  close(year.originalChurnRevenueImpact,-62500);
  close(year.originalExpansionRevenueImpact,50000);
  close(year.existingRevenue,487500);
  close(plan.quarters[0].existingRevenue,124218.75);
  close(plan.monthlyBridge[1].originalChurnRevenueImpact,-1302.0833333333);
  close(plan.monthlyBridge[1].originalChurnThisMonth,-434.0277777778);
  close(plan.monthlyBridge[1].originalExpansionRevenueImpact,1041.6666666667);
  close(plan.monthlyBridge[1].originalExpansionThisMonth,347.2222222222);
  assert.doesNotMatch(node('plTable').innerHTML,/pl-month-impact/);
  app.togglePlCohort('A');
  app.togglePlQtr(0);
  app.togglePlMonth(0,0);
  assert.equal(win._latestMonthlyPlan,plan);
  const html=node('plTable').innerHTML;
  assert.equal((html.match(/pl-month-impact/g)??[]).length,6);
  assert.match(html,/of which <span>−434 kr/);
  assert.match(html,/of which <span>\+347 kr/);
  assert.match(html,/50 cust\./);
  assert.match(html,/lost cust\./);
  node('plExistingPhase').value='0';
  app.onExistingRetentionChange();
  close(win._latestMonthlyPlan.monthlyBridge[0].existingRevenue,500000/12);
  close(win._latestMonthlyPlan.years[0].originalEndARR,475000);
  assert.equal(node('plExistingPhaseValue').textContent,'0%');
});

test('A valid explicit phase survives a new quarter preset without changing Existing A',()=>{
  const {app,node,win}=createApp(12);
  app.onPlanBudgetGranularityChange('year');
  app.setQtrScenario('FRONT');
  assert.equal(win._latestMonthlyPlan.signingPattern,'FRONT');
  const front=win._latestMonthlyPlan;
  assert.ok(front.summary.annualizedNewARR>0,'Expected New CARR to exercise signing presets');
  const frontPhasing=(front.periodPhaseRanges[0][0]+front.periodPhaseRanges[0][1])/2;
  app.onQuarterPhasingChange(String(frontPhasing));
  close(win._latestMonthlyPlan.periodPhasing[0],frontPhasing);
  const existingBefore=win._latestMonthlyPlan.years[0];
  const q1Front=win._latestMonthlyPlan.quarters[0].newARR;
  app.setQtrScenario('BACK');
  assert.equal(win._latestMonthlyPlan.signingPattern,'BACK');
  const back=win._latestMonthlyPlan;
  assert.ok(back.quarters[0].newARR<q1Front,'BACK should defer first invoiced New CARR');
  close(back.years[0].originalChurnARR,existingBefore.originalChurnARR);
  close(back.years[0].originalExpansionARR,existingBefore.originalExpansionARR);
  close(back.years[0].originalNetRevenue,existingBefore.originalNetRevenue);
  close(back.periodPhasing[0],frontPhasing);
  assert.ok(node('plQuarterPhasingSlider').max>node('plQuarterPhasingSlider').min);
  app.setQtrScenario('EVEN');
  assert.equal(win._latestMonthlyPlan.signingPattern,'EVEN');
  app.setQtrScenario('FRONT');
  assert.equal(win._latestMonthlyPlan.signingPattern,'FRONT');
});

test('An incompatible signing preset explains the phasing limit and leaves the plan intact',()=>{
  const {app,node,win}=createApp(12);
  app.setMonthScenario('FRONT');
  app.onQuarterPhasingChange('70');
  const front=win._latestMonthlyPlan;
  app.setMonthScenario('BACK');
  assert.equal(win._latestMonthlyPlan,front);
  assert.equal(front.monthlySigningPattern,'FRONT');
  assert.match(node('planNewARRNotice').textContent,/Lower phasing to 56\.6%/);
  app.onQuarterPhasingChange('25');
  app.setMonthScenario('BACK');
  assert.equal(win._latestMonthlyPlan.monthlySigningPattern,'BACK');
  assert.equal(win._latestMonthlyPlan.periodPhasing[0],25);
  assert.equal(node('planNewARRNotice').textContent,'');
});

test('Budget level only clears manual amounts and explicit phase after confirmation',()=>{
  const {app,node,win}=createApp(12);
  app.onPlanPeriodValueChange(0,'50000');
  app.onQuarterPhasingChange('25');
  const manual=win._latestMonthlyPlan;
  const confirmations=[];
  win.confirm=message=>{confirmations.push(message);return false;};
  node('planBudgetGranularity').value='month';
  app.onPlanBudgetGranularityChange('month');
  assert.equal(win._latestMonthlyPlan,manual);
  assert.equal(node('planBudgetGranularity').value,'quarter');
  assert.match(confirmations[0],/clear your manual New ARR amounts and reset new customer phasing/);
  win.confirm=()=>true;
  app.onPlanBudgetGranularityChange('month');
  assert.equal(win._latestMonthlyPlan.granularity,'month');
  assert.equal(win._latestMonthlyPlan.manualBudget,false);
  assert.equal(win._latestMonthlyPlan.periodPhasing[0],100);
});

test('independent quarter and month presets preserve one matrix and period revenue total',()=>{
  const {app,node,win}=createApp(12);
  app.onPlanBudgetGranularityChange('year');
  app.setQtrScenario('FRONT');
  app.setMonthScenario('EVEN');
  const original=win._latestMonthlyPlan;
  assert.equal(original.monthlySigningPattern,'EVEN');
  close(original.quarters[0].newARR,original.years[0].newARR*.35);
  close(original.months[0].newARR,original.months[1].newARR);
  app.setMonthScenario('FRONT');
  const front=win._latestMonthlyPlan;
  assert.equal(front.signingPattern,'FRONT');
  assert.equal(front.monthlySigningPattern,'FRONT');
  close(front.quarters[0].newARR,original.quarters[0].newARR);
  assert.ok(front.months[0].newARR>front.months[2].newARR);
  assert.ok(node('planMonthPatternEVEN').disabled===false);
  app.setMonthScenario('BACK');
  const back=win._latestMonthlyPlan;
  close(back.quarters[0].newARR,original.quarters[0].newARR);
  assert.ok(back.months[0].newARR<back.months[2].newARR);
  app.setMonthScenario('EVEN');
  close(win._latestMonthlyPlan.quarters[0].newARR,original.quarters[0].newARR);
  assert.equal(width(node),2);
});
