import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  animals,targetDefaults,toEUR,currencyFormats,paybackBenchmarks,cacRatios,
  growthMultipliers,growthMaxMonths,budgetDefaults,funnels
} from '../src/domain/saas-profiles.js';
import { annualGrossProfitLtv } from '../src/engine/unit-economics.js';
import { forecastSaaS,buildRevenueBridge,churnPeriodRates,PLAN_GRANULARITIES,SIGNING_PATTERNS } from '../src/engine/cohort-budget.js';
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
    plChurnSlider:25,plExpansionSlider:25,plNewCustomerPhasingSlider:100,
    cashOpening:0,cashOtherOpex:1000,cashCollectionLag:0
  }).forEach(([id,v])=>node(id).value=String(v));
  const timeframeInputs=[6,12,24,36,48,60].map(value=>({value:String(value),checked:value===timeframe}));
  const doc={
    getElementById:node,
    querySelector:selector=>{
      if(selector==='.container') return node('container');
      if(selector.includes('timeframe')) {
        if(selector.endsWith(':checked')) return timeframeInputs.find(input=>input.checked);
        const input=timeframeInputs.find(input=>selector.includes('"'+input.value+'"]'));
        if(!input) return null;
        return {set checked(value) {
          if(value) timeframeInputs.forEach(option=>{option.checked=option===input;});
        }};
      }
      return {value:selector.includes('currency')?'SEK':selector.includes('companyStage')?'early':''};
    },
    querySelectorAll:()=>[],
  };
  const win={_qtr:{},scrollTo(){},confirm(){return true;}};
  const factory=new Function('document','window','animals','targetDefaults','toEUR',
    'currencyFormats','paybackBenchmarks','cacRatios','growthMultipliers',
    'growthMaxMonths','budgetDefaults','funnels','annualGrossProfitLtv',
    'forecastSaaS','churnPeriodRates','PLAN_GRANULARITIES','SIGNING_PATTERNS','renderCashPanel',appBody);
  const app=factory(doc,win,animals,targetDefaults,toEUR,currencyFormats,
    paybackBenchmarks,cacRatios,growthMultipliers,growthMaxMonths,budgetDefaults,
    funnels,annualGrossProfitLtv,forecastSaaS,churnPeriodRates,PLAN_GRANULARITIES,SIGNING_PATTERNS,renderCashPanel);
  app.goToStep2();
  app.goToStep3();
  return {app,node,win};
}
const width=node=>{
  const m=node('plTable').innerHTML.match(/grid-template-columns:([^;]+);gap:5px;width:/);
  assert.ok(m,'Missing original forecast grid');
  return m[1].trim().split(/\s+/).length;
};
const setTarget=({app,node},amount)=>{
  node('planTargetARR').value=String(amount);
  app.onPlanInputsChange();
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
test('first-month phasing slider modifies the same cohort engine while preserving open month columns',()=>{
  const {app,node,win}=createApp(36);
  app.togglePlQtr(0);
  app.togglePlMonth(0,0);
  const initial=win._latestMonthlyPlan.summary.totalRecognizedRevenue;
  app.onNewCustomerPhasingChange('50');
  assert.equal(width(node),11); // 1 label + 3 months + 4 quarter totals + Y1 total + Y2 + Y3
  assert.match(node('plTable').innerHTML,/Y1 Q1 ▲/);
  assert.equal(node('plNewCustomerPhasingDisplay').textContent,'50.0%');
  win._latestMonthlyPlan.periodPhasing.forEach(p=>close(p,50));
  assert.notEqual(win._latestMonthlyPlan.summary.totalRecognizedRevenue,initial);
  for(const year of win._latestMonthlyPlan.years){
    close(year.originalNetRevenue+year.earlierNewNetRevenue+year.currentNewNetRevenue,year.recognizedRevenue);
    close(year.startCustomers-year.churnCustomers+year.newCustomers,year.endCustomers);
  }
  app.resetPL();
  assert.equal(node('plNewCustomerPhasingDisplay').textContent,'100.0%');
  win._latestMonthlyPlan.periodPhasing.forEach(p=>close(p,100));
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
    'B1 – Accumulated',
    '>Opening CARR</div>',
    '+ Transferred from B2',
    '>− Churn CARR</div>',
    '>+ Expansion CARR</div>',
    '>Closing CARR</div>',
    '>Recognized Revenue</div>',
    'B2 – New in period',
    '>New CARR</div>',
    '>Recognized Revenue</div>',
    '>Closing CARR</div>',
    '>Revenue · Existing</div>',
    '>Revenue · New</div>',
    '>Total Recognized Revenue</div>'
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

test('matrix totals view preserves open columns and cohort details when reopened',()=>{
  const {app,node,win}=createApp(12);
  const plan=win._latestMonthlyPlan;
  app.togglePlQtr(0);
  app.togglePlMonth(0,0);
  app.togglePlCohort('B');
  const detailed=node('plTable').innerHTML;
  app.togglePlMatrix();
  const compact=node('plTable').innerHTML;
  assert.equal(width(node),9);
  assert.deepEqual([...compact.matchAll(/>(Opening CARR|Closing CARR|Recognized Revenue)<\/div>/g)]
    .map(match=>match[1]),['Opening CARR','Closing CARR','Recognized Revenue']);
  assert.doesNotMatch(compact,/EXISTING CUSTOMERS|Revenue · Existing|Gross profit|Unit Economics/);
  assert.equal(node('plMatrixToggle').textContent,'Show details');
  app.togglePlMatrix();
  assert.equal(node('plTable').innerHTML,detailed);
  assert.equal(node('plMatrixToggle').textContent,'Show totals only');
  assert.equal(win._latestMonthlyPlan,plan);
});

test('A and B1 toggle independently, while B2 always shows its two summary rows',()=>{
  const {app,node,win}=createApp(12);
  const plan=win._latestMonthlyPlan;
  const html=()=>node('plTable').innerHTML;
  for(const key of ['A','B']) {
    assert.match(html(),new RegExp('id="plCohortToggle'+key+'" aria-expanded="false"'));
  }
  assert.equal((html().match(/>Recognized Revenue<\/div>/g)??[]).length,3);
  assert.doesNotMatch(html(),/plCohortToggleC/);
  assert.doesNotMatch(html(),/Revenue before changes|− Revenue phasing|Transferred from B2/);
  app.togglePlCohort('B');
  assert.match(html(),/id="plCohortToggleB" aria-expanded="true"/);
  assert.doesNotMatch(html(),/− Revenue phasing/);
  assert.match(html(),/Transferred from B2/);
  assert.match(html(),/id="plCohortToggleA" aria-expanded="false"/);
  app.togglePlQtr(0);
  app.togglePlMonth(0,1);
  assert.match(html(),/id="plCohortToggleB" aria-expanded="true"/);
  app.togglePlCohort('B');
  assert.doesNotMatch(html(),/Transferred from B2/);
  assert.equal(win._latestMonthlyPlan,plan);
});

test('Churn period changes the rate interval while forecasts remain monthly and target-driven',()=>{
  const scenario=createApp(12);
  const {app,node,win}=scenario;
  setTarget(scenario,1000000);
  node('plChurnSlider').value='25';
  node('plExpansionSlider').value='0';
  app.onPLSlider();
  const expected={year:[63,1],quarter:[124,4],month:[305,12]};
  for(const [period,[customers,periods]] of Object.entries(expected)){
    app.onChurnPeriodChange(period);
    const plan=win._latestMonthlyPlan;
    assert.equal(plan.churnPeriod,period);
    assert.equal(plan.granularity,'month');
    assert.equal(plan.summary.newCustomersNeeded,customers);
    close(plan.years[0].originalEndARR,500000*.75**periods);
    assert.equal(plan.manualBudget,false);
    assert.equal(width(node),2);
  }
  assert.match(node('plChurnEquivalents').textContent,/96\.83% annually/);
  assert.ok(node('plDistributionretention').hidden);
  assert.ok(!node('plDistributionacquisition').hidden);
  assert.match(node('planNewARRNote').textContent,/calculated from the closing CARR target/);
});

test('manual distribution weights start populated and control timing without setting an ARR amount',()=>{
  const scenario=createApp(12);
  const {app,node,win}=scenario;
  setTarget(scenario,1000000);
  node('plChurnSlider').value='25';
  node('plExpansionSlider').value='0';
  app.onPLSlider();
  close(Number(node('plWeightretention0Q').value),25);
  for(const kind of ['retention','acquisition']){
    app.onDistributionWeightChange(kind,3,null,'100');
    app.onDistributionWeightChange(kind,3,2,'100');
    assert.equal(node('plDistributionStatus'+kind).textContent,'Custom');
  }
  const {monthlyBridge}=win._latestMonthlyPlan;
  monthlyBridge.slice(0,-1).forEach(month=>{
    close(month.originalChurnARR,0);
    close(month.currentNewARR,0);
  });
  close(monthlyBridge.at(-1).originalChurnARR,125000);
  close(monthlyBridge.at(-1).currentNewARR,630000);
  close(monthlyBridge.at(-1).originalChurnThisMonth,-125000/12);
});

test('YEAR retention explicitly derives 25% churn and 51% expansion from opening CARR in the ORIGINAL matrix',()=>{
  const {app,node,win}=createApp(12);
  setTarget({app,node},400000);
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
  close(win._latestMonthlyPlan.monthlyBridge[0].originalChurnThisMonth,-125000/144);
  assert.equal(node('plExistingPhaseValue').textContent,'100%');
  assert.equal(node('plExistingPhaseNote').textContent,'Full effect in the month of change');
  close(y.endACV,y.endARR/y.endCustomers);
  assert.match(node('plTable').innerHTML,/Contracted ACV \(end\) = Closing CARR \/ Customers/);
  assert.match(node('planNewARRNote').textContent,/Existing customers/);
  assert.ok(node('plNewCustomerPhasingSlider').disabled,'No new cohort means phasing has no relevance');
  assert.equal(node('plNewCustomerPhasingDisplay').textContent,'—');
  const before=win._latestMonthlyPlan.summary.totalRecognizedRevenue;
  app.onNewCustomerPhasingChange('50');
  close(win._latestMonthlyPlan.summary.totalRecognizedRevenue,before);
  app.togglePlQtr(0);
  const qs=win._latestMonthlyPlan.quarters;
  close(qs.reduce((n,q)=>n+q.churnARR,0),125000);
  close(qs.reduce((n,q)=>n+q.expansionARR,0),255000);
  close(qs.reduce((n,q)=>n+q.recognizedRevenue,0),y.recognizedRevenue);
});

test('Existing A shows the full revenue bridge, month-only detail and customer counts in the same grid',()=>{
  const {app,node,win}=createApp(12);
  setTarget({app,node},400000);
  node('plChurnSlider').value='25';
  node('plExpansionSlider').value='20';
  app.onPLSlider();
  node('plExistingPhase').value='50';
  app.onExistingRetentionChange();
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
  assert.equal(node('plExistingPhaseNote').textContent,'Full effect from the following month');
  app.resetPL();
  assert.equal(node('plExistingPhaseValue').textContent,'100%');
});

test('A valid explicit phase survives a new quarter preset without changing Existing A',()=>{
  const {app,node,win}=createApp(12);
  setTarget({app,node},2000000);
  app.setDistributionPreset('acquisition','FRONT');
  assert.equal(node('plDistributionStatusacquisition').textContent,'FRONT');
  const front=win._latestMonthlyPlan;
  assert.ok(front.summary.annualizedNewARR>0,'Expected New CARR to exercise signing presets');
  const frontPhasing=67;
  app.onNewCustomerPhasingChange(String(frontPhasing));
  assert.equal(node('plNewCustomerPhasingDisplay').textContent,'67.0%');
  const existingBefore=win._latestMonthlyPlan.years[0];
  const q1Front=win._latestMonthlyPlan.quarters[0].newARR;
  app.setDistributionPreset('acquisition','BACK');
  assert.equal(node('plDistributionStatusacquisition').textContent,'BACK');
  const back=win._latestMonthlyPlan;
  assert.ok(back.quarters[0].newARR<q1Front,'BACK should defer first invoiced New CARR');
  close(back.years[0].originalChurnARR,existingBefore.originalChurnARR);
  close(back.years[0].originalExpansionARR,existingBefore.originalExpansionARR);
  close(back.years[0].originalNetRevenue,existingBefore.originalNetRevenue);
  assert.equal(node('plNewCustomerPhasingDisplay').textContent,'67.0%');
  app.setDistributionPreset('acquisition','EVEN');
  assert.equal(node('plDistributionStatusacquisition').textContent,'EVEN');
  app.setDistributionPreset('acquisition','FRONT');
  assert.equal(node('plDistributionStatusacquisition').textContent,'FRONT');
});

test('67% first-month phasing reduces B2 without reducing later B1 revenue',()=>{
  const {app,node,win}=createApp(12);
  setTarget({app,node},2000000);
  const before=win._latestMonthlyPlan;
  app.onNewCustomerPhasingChange('67');
  const plan=win._latestMonthlyPlan;
  const [jan,feb,mar]=plan.monthlyBridge;
  const mrr=jan.currentNewARR/12;
  assert.ok(mrr>0);
  close(jan.currentNewNetRevenue,mrr*.67);
  close(jan.earlierNewNetRevenue,0);
  close(feb.earlierNewNetRevenue,mrr);
  close(mar.earlierNewNetRevenue,mrr*2);
  close(plan.quarters[0].currentNewNetRevenue,mrr*3*.67);
  close(plan.quarters[0].earlierNewNetRevenue,mrr*3);
  close(plan.quarters[0].newRevenue,mrr*5.01);
  close(before.quarters[0].endARR,plan.quarters[0].endARR);
  close(plan.quarters[0].recognizedRevenue,
    jan.recognizedRevenue+feb.recognizedRevenue+mar.recognizedRevenue);
  assert.equal(node('plNewCustomerPhasingDisplay').textContent,'67.0%');
});

test('the churn slider updates the equivalent compound monthly and quarterly rates',()=>{
  const {app,node}=createApp(12);
  node('plChurnSlider').value='25';
  app.onPLSlider();
  assert.match(node('plChurnEquivalents').textContent,/2\.37% monthly · 6\.94% quarterly/);
  node('plChurnSlider').value='0';
  app.onPLSlider();
  assert.match(node('plChurnEquivalents').textContent,/0\.00% monthly · 0\.00% quarterly/);
});

test('Step 3 changes update the opening ACV, profile and horizon without clearing scenario choices',()=>{
  const {app,node,win}=createApp(12);
  assert.equal(node('planStartARR').value,'500000');
  assert.equal(node('planOpeningCustomers').value,'50');
  assert.equal(node('planTimePeriod').value,'12');
  const animal=node('planAnimal').textContent;
  app.onChurnPeriodChange('month');
  app.setDistributionPreset('acquisition','BACK');
  node('planOpeningCustomers').value='5';
  node('planStartARR').value='900000';
  node('planTargetARR').value='1800000';
  node('planTimePeriod').value='24';
  node('planGrossMargin').value='75';
  app.onPlanInputsChange();
  const plan=win._latestMonthlyPlan;
  assert.equal(plan.months.length,24);
  assert.equal(plan.churnPeriod,'month');
  assert.equal(node('plDistributionStatusacquisition').textContent,'BACK');
  close(plan.months[0].startARR,900000);
  close(plan.months[0].newACV,180000);
  close(plan.months[0].grossProfit,plan.months[0].recognizedRevenue*.75);
  assert.notEqual(node('planAnimal').textContent,animal);
  assert.equal(node('customers').value,'5');
  assert.equal(node('targetRevenue').value,'1800000');
  assert.equal(node('timeframeDisplay').textContent,'24 months');
  node('planOpeningCustomers').value='0';
  app.onPlanInputsChange();
  assert.equal(win._latestMonthlyPlan,plan);
  assert.match(node('planInputsError').textContent,/valid opening values/);
});
