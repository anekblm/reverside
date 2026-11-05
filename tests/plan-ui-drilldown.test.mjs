import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  animals,targetDefaults,toEUR,currencyFormats,paybackBenchmarks,cacRatios,
  growthMultipliers,growthMaxMonths,budgetDefaults,funnels
} from '../src/domain/saas-profiles.js';
import { annualGrossProfitLtv } from '../src/engine/unit-economics.js';
import { forecastSaaS,buildRevenueBridge } from '../src/engine/cohort-budget.js';
import { renderCashPanel } from '../src/features/plan/cash-panel.js';

const originalApp=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const appBody=originalApp.replace(/^import .*;$/gm,'') +
  '\nreturn {goToStep2,goToStep3,selectStrategy,setQtrScenario,onQuarterPhasingChange,togglePlQtr,togglePlMonth,resetPL,onPLSlider,onPlanBudgetGranularityChange,togglePlanPeriodInputs,onPlanPeriodValueChange,resetPlanPeriodInputs};';

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
  const win={_qtr:{},scrollTo(){}};
  const factory=new Function('document','window','animals','targetDefaults','toEUR',
    'currencyFormats','paybackBenchmarks','cacRatios','growthMultipliers',
    'growthMaxMonths','budgetDefaults','funnels','annualGrossProfitLtv',
    'forecastSaaS','renderCashPanel','buildRevenueBridge',appBody);
  const app=factory(doc,win,animals,targetDefaults,toEUR,currencyFormats,
    paybackBenchmarks,cacRatios,growthMultipliers,growthMaxMonths,budgetDefaults,
    funnels,annualGrossProfitLtv,forecastSaaS,renderCashPanel,buildRevenueBridge);
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
  assert.match(node('plTable').innerHTML,/B\. New Customers – Earlier This Year/);
  assert.equal(win._latestMonthlyPlan.months.length,12);
});

test('existing forecast grid shows full A/B/C Revenue Bridge and reconciles in every view',()=>{
  const {app,node,win}=createApp(36);
  const required=[
    'Contracted ARR (start of period)',
    'A. Existing Customers – Start of Year',
    'Of which: Opening CARR – Existing (A)',
    '− Churn CARR – A',
    '+ Expansion CARR – A',
    'Closing CARR – A',
    'B. New Customers – Earlier This Year',
    'Of which: Opening CARR – Earlier New (B)',
    '− Churn CARR – B',
    '+ Expansion CARR – B',
    'Closing CARR – B',
    'C. New Customers – Current Period',
    '+ First-invoiced New CARR – Current (C)',
    '− Churn CARR – C',
    '+ Expansion CARR – C',
    'Closing CARR – C',
    'Recognized Revenue – Existing (A)',
    'Recognized Revenue – New (B+C)',
    'Total Recognized Revenue',
    'Contracted ARR (end of period) = A + B + C'
  ];
  const checkLabels=()=>{
    const html=node('plTable').innerHTML;
    required.forEach(label=>assert.ok(html.includes(label),'Missing label '+label));
    assert.ok(!html.includes('id="revenueMatrix"'),'A separate revenue table must not be added');
    const positions=required.map(label=>html.indexOf(label));
    assert.ok(positions.every((v,i)=>v>=0&&(i===0||v>positions[i-1])),
      'Opening CARR, cohort changes, recognized revenue totals and closing CARR must appear in the agreed order');
    assert.ok(!html.includes('New MRR · first invoice'),
      'Remove the obsolete duplicate ARR/MRR block');
  };
  const reconcile=p=>{
    close(p.originalBaseRevenue+p.originalChurnRevenueImpact+
      p.originalExpansionRevenueImpact,p.originalNetRevenue);
    close(p.earlierNewBaseRevenue+p.earlierNewChurnRevenueImpact+
      p.earlierNewExpansionRevenueImpact,p.earlierNewNetRevenue);
    close(p.originalNetRevenue+p.earlierNewNetRevenue+
      p.currentNewNetRevenue,p.recognizedRevenue);
    close(p.existingRevenue,p.originalNetRevenue);
    close(p.newRevenue,p.earlierNewNetRevenue+p.currentNewNetRevenue);
    close(p.existingRevenue+p.newRevenue,p.recognizedRevenue);
    close(p.originalStartARR+p.earlierStartARR+p.currentStartARR,p.startARR);
    close(p.originalEndARR+p.earlierEndARR+p.currentEndARR,p.endARR);
    for(const x of ['original','earlier','current']) {
      close(p[x+'StartARR']-p[x+'ChurnARR']+p[x+'ExpansionARR']+
        p[x+'NewARR'],p[x+'EndARR']);
    }
  };
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
  assert.ok(win._latestMonthlyPlan.years[0].earlierNewNetRevenue===0,
    'The current year acquired cohort remains current within the year view');
});

test('budget granularity Year/Quarter/Month changes the input engine, not the display layout',()=>{
  const {app,node,win}=createApp(36);
  assert.equal(width(node),4);
  assert.equal(win._latestMonthlyPlan.granularity,'quarter');
  assert.ok(!node('planPatternEVEN').disabled);
  app.onPlanBudgetGranularityChange('year');
  assert.equal(win._latestMonthlyPlan.granularity,'year');
  assert.equal(win._latestMonthlyPlan.periodPhasing.length,3);
  assert.equal(node('plQuarterPhasingLabel').textContent,'Revenue phasing · yearly');
  assert.ok(Number(node('plQuarterPhasingSlider').min)>45);
  assert.ok(Number(node('plQuarterPhasingSlider').max)<63);
  const signedBefore=win._latestMonthlyPlan.quarters.map(p=>p.newARR);
  app.onQuarterPhasingChange('55');
  win._latestMonthlyPlan.periodPhasing.forEach(p=>close(p,55));
  win._latestMonthlyPlan.quarters.forEach((q,i)=>close(q.newARR,signedBefore[i]));
  app.onQuarterPhasingChange('25'); // outside feasible range: ignored
  win._latestMonthlyPlan.periodPhasing.forEach(p=>close(p,55));
  assert.equal(width(node),4);
  app.onPlanBudgetGranularityChange('quarter');
  assert.equal(win._latestMonthlyPlan.granularity,'quarter');
  assert.equal(win._latestMonthlyPlan.periodPhasing.length,12);
  assert.ok(Number(node('plQuarterPhasingSlider').min)>33);
  app.onPlanBudgetGranularityChange('month');
  assert.equal(win._latestMonthlyPlan.granularity,'month');
  assert.equal(win._latestMonthlyPlan.periodPhasing.length,36);
  assert.ok(node('plQuarterPhasingSlider').disabled);
  assert.ok(node('planPatternFRONT').disabled && node('planPatternBACK').disabled);
  assert.equal(width(node),4);
  const before=win._latestMonthlyPlan.summary.totalRecognizedRevenue;
  app.onQuarterPhasingChange('50');
  assert.equal(win._latestMonthlyPlan.summary.totalRecognizedRevenue,before);
  assert.equal(node('plQuarterPhasingDisplay').textContent,'100%');
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
  close(y.originalChurnRevenueImpact,-125000*13/24);
  close(y.originalExpansionRevenueImpact,255000*13/24);
  close(y.recognizedRevenue,500000+130000*13/24);
  close(y.endACV,y.endARR/y.endCustomers);
  assert.match(node('plTable').innerHTML,/Contracted ACV \(end\) = Closing CARR \/ Customers/);
  assert.match(node('planBudgetGranularityNote').textContent,/Churn 25% annually → 25% of opening CARR per year/);
  assert.match(node('planBudgetGranularityNote').textContent,/Expansion 51% annually → 51% of opening CARR per year/);
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
