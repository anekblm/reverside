/**
 * ReverSide PLAN: customer cohorts are the single source of truth.
 * One monthly subledger supports yearly, quarterly or monthly input.
 * ARR/MRR are stocks; revenue, bookings, S&M and cash are flows.
 */
export const SIGNING_PATTERNS = Object.freeze({
  FRONT: [35, 30, 20, 15],
  EVEN: [25, 25, 25, 25],
  BACK: [15, 20, 25, 40],
});
export const PLAN_GRANULARITIES = Object.freeze({ year: 12, quarter: 3, month: 1 });
const sum = arr => arr.reduce((a, b) => a + b, 0);
function finite(value, name, low = 0) {
  if (!Number.isFinite(value) || value < low) throw new RangeError(name + " must be finite and >= " + low);
  return value;
}
const near = (a, b, tolerance = 1e-8) =>
  Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
function periodMonths(granularity) {
  const width = PLAN_GRANULARITIES[granularity];
  if (!width) throw new RangeError("Unknown planning granularity");
  return width;
}
function monthToPeriod(month, granularity) {
  return Math.floor(month / periodMonths(granularity));
}
function monthsInPeriod(index, totalMonths, granularity) {
  const start = index * periodMonths(granularity);
  return Math.min(totalMonths - start, periodMonths(granularity));
}

/** Fixed whole-month invoices imply a feasible first-period realization range [1 / L, 1]. */
export function feasiblePhasingRange(monthsInBudgetPeriod) {
  return [100 / monthsInBudgetPeriod, 100];
}
function phaseFraction(monthWeights) {
  const length = monthWeights.length;
  const total = sum(monthWeights);
  return sum(monthWeights.map((w, i) => w * (length - i) / length)) / total;
}
/** Tilt baseline shares until implied revenue realization equals requested phase.
 * This does not invent a delayed activation or fraction of a first invoice.
 */
function tiltToPhasing(baseline, percent, name) {
  const length = baseline.length;
  if (percent == null) return baseline.slice();
  if (length === 1) {
    if (!near(Number(percent),100,1e-9)) throw new RangeError(
      name+" must be 100% for a one-month budget period with immediate billing");
    return baseline.slice();
  }
  const target = finite(percent, name) / 100;
  const min = 1 / length;
  if (target < min - 1e-10 || target > 1 + 1e-10) {
    throw new RangeError(name + " must be between " + (100*min).toFixed(2) +
      "% and 100% when each new subscription earns a full first month's MRR");
  }
  const all = sum(baseline);
  if (all <= 0) throw new RangeError("Period needs positive signing weights");
  if (near(target, min, 1e-11)) return baseline.map((_, i) => i === length - 1 ? all : 0);
  if (near(target, 1, 1e-11)) return baseline.map((_, i) => i === 0 ? all : 0);
  // f(theta) is monotonic: earlier months have higher monthly-invoice contribution.
  const weighted = theta => {
    const exps = baseline.map((w, i) => w * Math.exp(Math.max(-700, Math.min(700, theta * (length - i) / length))));
    const divisor = sum(exps);
    return exps.map(v => v / divisor);
  };
  let lo = -60, hi = 60;
  for (let step = 0; step < 110; step++) {
    const mid = (lo + hi) / 2;
    if (phaseFraction(weighted(mid)) < target) lo = mid;
    else hi = mid;
  }
  return weighted((lo + hi) / 2).map(v => v * all);
}

function monthlyTemplateWeights(months, yearShares = [], pattern = "EVEN") {
  const quarterPattern = SIGNING_PATTERNS[pattern];
  if (!quarterPattern) throw new RangeError("Unknown signing pattern: " + pattern);
  const years = Math.ceil(months / 12);
  const shares = Array.from({length:years},(_,y)=>yearShares[y] ?? 100 / years);
  if (shares.some(v=>!Number.isFinite(v)||v<0)||sum(shares)<=0) throw new RangeError("Invalid yearly distribution");
  const result = [];
  for (let y=0;y<years;y++) {
    const yMonths = Math.min(12,months-12*y);
    const qs = Math.ceil(yMonths/3);
    const activeQWeight = sum(quarterPattern.slice(0,qs));
    for (let m=0;m<yMonths;m++) {
      const q = Math.floor(m/3), qMonths=Math.min(3,yMonths-3*q);
      result.push((shares[y]/sum(shares))*(quarterPattern[q]/activeQWeight)/qMonths);
    }
  }
  return result;
}
function firstInvoiceWeights(input) {
  const {months,granularity,phasePercent,phaseByPeriod,newARRByPeriod}=input;
  const width = periodMonths(granularity);
  const count = Math.ceil(months/width);
  const template = monthlyTemplateWeights(months,input.yearShares,input.signingPattern);
  const total = sum(template);
  const periodTotals = Array.from({length:count},(_,p)=>sum(template.slice(p*width,Math.min(months,(p+1)*width)))/total);
  if (newARRByPeriod != null) {
    if (newARRByPeriod.length !== count) throw new RangeError("Manual ARR needs one amount per budget period");
    newARRByPeriod.forEach(v=>finite(v,"period New ARR"));
  }
  const weights = [];
  const intraPeriodWeights = [];
  const phase = [];
  for(let p=0;p<count;p++) {
    const begin=p*width;
    const within=template.slice(begin,Math.min(months,begin+width));
    const withinSum=sum(within);
    const normalized=withinSum>0?within.map(v=>v/withinSum):Array(within.length).fill(1/within.length);
    const requested=granularity==="month"?null:(phaseByPeriod?.[p] ?? phasePercent ?? null);
    const adjusted=tiltToPhasing(normalized,requested,"Revenue phasing for period "+(p+1));
    phase.push(phaseFraction(adjusted)*100);
    weights.push(...adjusted.map(v=>v*periodTotals[p]));
    intraPeriodWeights.push(...adjusted);
  }
  return {weights,phase,periodTotals,intraPeriodWeights};
}
/** Different acquisition cohorts are never collapsed before churn / expansion. */
function makeARRRows(input, monthlySignedARR) {
  const {months,openingARR,annualChurn,annualExpansionComp,granularity,acv}=input;
  const openingCustomers=input.openingCustomers??openingARR/acv;
  const newACVByMonth=input.newACVByMonth??Array(months).fill(acv);
  const width=periodMonths(granularity);
  const annualGrossRetention=1-annualChurn;
  const annualNRR=annualGrossRetention+annualExpansionComp;
  const cohorts=[{firstInvoiceMonth:-1,arr:openingARR,count:openingCustomers}];
  const rows=[];
  for(let m=0;m<months;m++) {
    const periodStart=Math.floor(m/width)*width;
    const periodLength=Math.min(width,months-periodStart);
    if(m===periodStart) {
      // Apply retention ONCE to opening CARR of the selected budget period.
      // Changes are allocated evenly to months, not recomputed monthly.
      const grossRetention=Math.pow(annualGrossRetention,periodLength/12);
      const netRetention=Math.pow(annualNRR,periodLength/12);
      for(const c of cohorts) {
        const eligible=c.firstInvoiceMonth<periodStart;
        c.periodChurnPerMonth=eligible?c.arr*(1-grossRetention)/periodLength:0;
        c.periodExpansionPerMonth=eligible?c.arr*(netRetention-grossRetention)/periodLength:0;
        c.periodLostCustomersPerMonth=eligible?c.count*(1-grossRetention)/periodLength:0;
      }
    }
    if(monthlySignedARR[m]>0)cohorts.push({
      firstInvoiceMonth:m,arr:monthlySignedARR[m],count:monthlySignedARR[m]/newACVByMonth[m],
      periodChurnPerMonth:0,periodExpansionPerMonth:0,periodLostCustomersPerMonth:0
    });
    const vintageRows=[];
    let startARR=0,churnARR=0,expansionARR=0,endARR=0;
    let startCustomers=0,churnCustomers=0,endCustomers=0;
    for(const c of cohorts) {
      const newlyAdded=c.firstInvoiceMonth===m;
      const before=newlyAdded?0:c.arr;
      const beforeCustomers=newlyAdded?0:c.count;
      const churn=newlyAdded?0:c.periodChurnPerMonth;
      const expansion=newlyAdded?0:c.periodExpansionPerMonth;
      const lostCustomers=newlyAdded?0:c.periodLostCustomersPerMonth;
      if(!newlyAdded) {
        c.arr=before-churn+expansion;
        c.count=beforeCustomers-lostCustomers;
      }
      const newlySigned=newlyAdded?c.arr:0;
      startCustomers+=beforeCustomers;
      churnCustomers+=lostCustomers;
      endCustomers+=c.count;
      startARR+=before;
      churnARR+=churn;
      expansionARR+=expansion;
      endARR+=c.arr;
      vintageRows.push({
        firstInvoiceMonth:c.firstInvoiceMonth,
        startARR:before,churnARR:churn,expansionARR:expansion,
        startCustomers:beforeCustomers,churnCustomers:lostCustomers,
        newCustomers:newlyAdded?c.count:0,endCustomers:c.count,
        newARR:newlySigned,endARR:c.arr,recognizedRevenue:c.arr/12,
      });
    }
    const newARR=monthlySignedARR[m];
    const recognizedRevenue=endARR/12;
    rows.push({
      index:m,month:m+1,year:Math.floor(m/12),quarter:Math.floor((m%12)/3),
      budgetPeriod:Math.floor(m/width),
      startARR,churnARR,expansionARR,newARR,endARR,
      startCustomers,churnCustomers,endCustomers,
      newCustomers:newARR/newACVByMonth[m],newACV:newACVByMonth[m],
      recognizedRevenue,
      existingRevenue:sum(vintageRows.filter(c=>c.firstInvoiceMonth<0).map(c=>c.recognizedRevenue)),
      newRevenue:sum(vintageRows.filter(c=>c.firstInvoiceMonth>=0).map(c=>c.recognizedRevenue)),
      cohortFlows:vintageRows,
    });
  }
  return rows;
}

/**
 * Build a bridge for each displayed period, reclassifying vintages based on
 * the DISPLAYED period (not the source budget's granularity).
 * "Original" always means already present at that calendar year's start.
 */
export function buildRevenueBridge(monthly, view = "quarter") {
  const width=periodMonths(view);
  const output=[];
  for(let start=0;start<monthly.length;start+=width) {
    const slice=monthly.slice(start,start+width), first=slice[0],last=slice.at(-1);
    const yearStart=Math.floor(start/12)*12;
    const metrics={
      originalBaseRevenue:0,originalChurnRevenueImpact:0,originalExpansionRevenueImpact:0,
      earlierNewBaseRevenue:0,earlierNewChurnRevenueImpact:0,earlierNewExpansionRevenueImpact:0,
      currentNewRevenue:0,currentNewChurnRevenueImpact:0,currentNewExpansionRevenueImpact:0,
    };
    // Reconcile earned revenue from the SAME opening CARR shown in the
    // matrix. The effect of each monthly CARR change persists through all
    // remaining months of the selected DISPLAY period, including that month.
    //
    // Base earned revenue = opening contracted ARR × displayed months / 12.
    // Churn/expansion earned impact = change in ARR × remaining months / 12.
    // New first invoices use the same remaining-month rule. These are flows,
    // not annualized ARR stocks, and no hidden revenue-phasing multiplier exists.
    const classifyRevenue = vintage => vintage<yearStart
      ? "original" : vintage<start ? "earlier" : "current";
    for(const c of first.cohortFlows) {
      const bucket=classifyRevenue(c.firstInvoiceMonth);
      if(bucket==="original") metrics.originalBaseRevenue+=c.startARR*slice.length/12;
      if(bucket==="earlier") metrics.earlierNewBaseRevenue+=c.startARR*slice.length/12;
    }
    slice.forEach((month,i)=>{
      const revenueWeight=(slice.length-i)/12;
      for(const c of month.cohortFlows) {
        const bucket=classifyRevenue(c.firstInvoiceMonth);
        if(bucket==="original") {
          metrics.originalChurnRevenueImpact-=c.churnARR*revenueWeight;
          metrics.originalExpansionRevenueImpact+=c.expansionARR*revenueWeight;
        } else if(bucket==="earlier") {
          metrics.earlierNewChurnRevenueImpact-=c.churnARR*revenueWeight;
          metrics.earlierNewExpansionRevenueImpact+=c.expansionARR*revenueWeight;
        } else {
          metrics.currentNewRevenue+=c.newARR*revenueWeight;
          metrics.currentNewChurnRevenueImpact-=c.churnARR*revenueWeight;
          metrics.currentNewExpansionRevenueImpact+=c.expansionARR*revenueWeight;
        }
      }
    });
    const originalNet=metrics.originalBaseRevenue+
      metrics.originalChurnRevenueImpact+metrics.originalExpansionRevenueImpact;
    const earlierNet=metrics.earlierNewBaseRevenue+
      metrics.earlierNewChurnRevenueImpact+metrics.earlierNewExpansionRevenueImpact;
    const currentNet=metrics.currentNewRevenue+
      metrics.currentNewChurnRevenueImpact+metrics.currentNewExpansionRevenueImpact;
    // Stock/flow cohort bridge for the DISPLAYED period, independent of the
    // budgeting granularity and with no double-counting of earlier new ARR.
    const cohortARR = {};
    for(const prefix of ["original","earlier","current"]){
      for(const key of ["StartARR","ChurnARR","ExpansionARR","NewARR","EndARR",
                         "StartCustomers","ChurnCustomers","NewCustomers","EndCustomers"])
        cohortARR[prefix+key] = 0;
    }
    const classify=vintage=>vintage<yearStart?"original":vintage<start?"earlier":"current";
    // Only the FIRST month establishes a period's opening stock.
    for(const c of first.cohortFlows) {
      const prefix=classify(c.firstInvoiceMonth);
      cohortARR[prefix+"StartARR"]+=c.startARR;
      cohortARR[prefix+"StartCustomers"]+=c.startCustomers;
    }
    for(const month of slice)for(const c of month.cohortFlows) {
      const prefix=classify(c.firstInvoiceMonth);
      cohortARR[prefix+"ChurnARR"]+=c.churnARR;
      cohortARR[prefix+"ExpansionARR"]+=c.expansionARR;
      cohortARR[prefix+"NewARR"]+=c.newARR;
      cohortARR[prefix+"ChurnCustomers"]+=c.churnCustomers;
      cohortARR[prefix+"NewCustomers"]+=c.newCustomers;
    }
    for(const c of last.cohortFlows) {
      const prefix=classify(c.firstInvoiceMonth);
      cohortARR[prefix+"EndARR"]+=c.endARR;
      cohortARR[prefix+"EndCustomers"]+=c.endCustomers;
    }
    for(const prefix of ["original","earlier","current"]){
      if(!near(cohortARR[prefix+"StartARR"]-
               cohortARR[prefix+"ChurnARR"]+
               cohortARR[prefix+"ExpansionARR"]+
               cohortARR[prefix+"NewARR"],
               cohortARR[prefix+"EndARR"]))
        throw new Error("Cohort ARR bridge does not reconcile: "+prefix+
          " months "+(start+1)+"-"+(start+slice.length));
      if(!near(cohortARR[prefix+"StartCustomers"]-
               cohortARR[prefix+"ChurnCustomers"]+
               cohortARR[prefix+"NewCustomers"],
               cohortARR[prefix+"EndCustomers"]))
        throw new Error("Cohort customer bridge does not reconcile: "+prefix+
          " months "+(start+1)+"-"+(start+slice.length));
    }
    const retainedOpeningCohorts=last.cohortFlows.filter(c=>c.firstInvoiceMonth<start);
    const retainedBaseARR=sum(retainedOpeningCohorts.map(c=>c.endARR));
    const retainedBaseCustomers=sum(retainedOpeningCohorts.map(c=>c.endCustomers));
    const flow=k=>sum(slice.map(m=>m[k]));
    const result={
      startMonth:start+1,endMonth:start+slice.length,
      year:Math.floor(start/12),quarter:Math.floor((start%12)/3),
      monthsInPeriod:slice.length,startARR:first.startARR,endARR:last.endARR,
      startCash:first.startCash,endCash:last.endCash,
      newARR:flow("newARR"),churnARR:flow("churnARR"),expansionARR:flow("expansionARR"),
      startCustomers:first.startCustomers,
      churnCustomers:flow("churnCustomers"),
      newCustomers:flow("newCustomers"),
      endCustomers:last.endCustomers,
      startACV:first.startCustomers>0?first.startARR/first.startCustomers:0,
      endACV:last.endCustomers>0?last.endARR/last.endCustomers:0,
      retainedBaseACV:retainedBaseCustomers>0?retainedBaseARR/retainedBaseCustomers:0,
      ...cohortARR,
      recognizedRevenue:flow("recognizedRevenue"),
      existingRevenue:originalNet,newRevenue:earlierNet+currentNet,
      originalNetRevenue:originalNet,earlierNewNetRevenue:earlierNet,currentNewNetRevenue:currentNet,
      ...metrics,
      signedMRR:flow("newARR")/12,closingMRR:last.endARR/12,
      cashCollected:flow("cashCollected"),cogsPaid:flow("cogsPaid"),
      smPaid:flow("smPaid"),otherOpexPaid:flow("otherOpexPaid"),
      grossProfit:flow("grossProfit"),
      operatingContribution:flow("operatingContribution"),
      cashNeutralSMCapacity:flow("cashNeutralSMCapacity"),opCF:flow("opCF"),
    };
    if(!near(result.originalStartARR+result.earlierStartARR+result.currentStartARR,result.startARR) ||
       !near(result.originalEndARR+result.earlierEndARR+result.currentEndARR,result.endARR))
      throw new Error("A+B+C ARR stocks do not reconcile for months "+(start+1)+"-"+(start+slice.length));
    if(!near(result.originalChurnARR+result.earlierChurnARR+result.currentChurnARR,result.churnARR) ||
       !near(result.originalExpansionARR+result.earlierExpansionARR+result.currentExpansionARR,result.expansionARR) ||
       !near(result.originalNewARR+result.earlierNewARR+result.currentNewARR,result.newARR))
      throw new Error("A+B+C ARR flows do not reconcile for months "+(start+1)+"-"+(start+slice.length));
    if(!near(originalNet+earlierNet+currentNet,result.recognizedRevenue)) {
      throw new Error("Revenue bridge does not reconcile for months "+(start+1)+"-"+(start+slice.length));
    }
    if(!near(result.startCustomers-result.churnCustomers+result.newCustomers,result.endCustomers)) {
      throw new Error("Customer bridge does not reconcile for months "+(start+1)+"-"+(start+slice.length));
    }
    if(!near(result.startARR-result.churnARR+result.expansionARR+result.newARR,result.endARR)) {
      throw new Error("ARR bridge does not reconcile for months "+(start+1)+"-"+(start+slice.length));
    }
    output.push(result);
  }
  return output;
}

/**
 * Full monthly SaaS plan. Budget level changes input assumptions; view level
 * only re-groups the SAME saved monthly cohort ledger.
 *
 * phasePercent/phaseByPeriod are only applicable to year/quarter budgets.
 * For monthly planning, a new invoice always yields full month's MRR.
 * For quarter/year, phase acts by modifying auto first-invoice month weights,
 * never by discounting recognized revenue or imposing fictitious delays.
 */
export function forecastSaaS(input) {
  const months=finite(input.months,"months",1);
  if(!Number.isInteger(months)||months>120) throw new RangeError("months must be an integer from 1 to 120");
  const granularity=input.granularity||"month";
  const width=periodMonths(granularity);
  const acv=finite(input.acv,"acv",Number.EPSILON);
  const openingARR=finite(input.openingARR,"openingARR");
  if(input.openingCustomers != null){
    finite(input.openingCustomers,"openingCustomers");
    if((input.openingCustomers===0)!==(openingARR===0))
      throw new RangeError("Opening customers and opening ARR must both be zero, or both be positive");
  }
  const targetARR=finite(input.targetARR,"targetARR");
  const annualChurn=finite(input.annualChurn,"annualChurn");
  const annualExpansionComp=finite(input.annualExpansionComp,"annualExpansionComp");
  const grossMargin=finite(input.grossMargin,"grossMargin");
  if(annualChurn>=1||grossMargin>1||1-annualChurn+annualExpansionComp<=0)
    throw new RangeError("Churn, NRR or margin outside valid range");
  const collectionLagMonths=finite(input.collectionLagMonths??0,"collectionLagMonths");
  if(!Number.isInteger(collectionLagMonths)||collectionLagMonths>12)
    throw new RangeError("Collection lag must be whole months from 0 to 12");
  const openingCash=finite(input.openingCash??0,"openingCash",-1e15);
  const otherOpexMonthly=finite(input.otherOpexMonthly??0,"otherOpexMonthly");
  const yearsCount=Math.ceil(months/12);
  const {weights,phase,periodTotals,intraPeriodWeights}=firstInvoiceWeights({...input,months,granularity});
  const nrrAnnual=1-annualChurn+annualExpansionComp;
  const factor=nrrAnnual/(1-annualChurn);
  const newACV=Array.from({length:months},(_,m)=>
    acv*Math.pow(factor,Math.floor(m/12)+(input.priceNewOnExpansion?1:0)));
  let newCustomersNeeded;
  let monthNewARR;
  if(input.newARRByPeriod != null) {
    monthNewARR=intraPeriodWeights.map((weight,m)=>weight*input.newARRByPeriod[Math.floor(m/width)]);
    newCustomersNeeded=sum(monthNewARR.map((arr,m)=>arr/newACV[m]));
  } else {
    const zeros=Array(months).fill(0);
    const baseline=makeARRRows({months,openingARR,openingCustomers:input.openingCustomers,acv,annualChurn,annualExpansionComp,granularity,newACVByMonth:newACV},zeros).at(-1).endARR;
    const unitARR=weights.map((w,m)=>w*newACV[m]);
    const withOne=makeARRRows({months,openingARR,openingCustomers:input.openingCustomers,acv,annualChurn,annualExpansionComp,granularity,newACVByMonth:newACV},unitARR).at(-1).endARR;
    const endingContribution=withOne-baseline;
    newCustomersNeeded=targetARR>baseline?
      Math.ceil((targetARR-baseline)/endingContribution-1e-10):0;
    if(!Number.isSafeInteger(newCustomersNeeded)||newCustomersNeeded>1e8)throw new RangeError("Target requires too many customers");
    monthNewARR=unitARR.map(v=>v*newCustomersNeeded);
  }
  const monthly=makeARRRows({months,openingARR,openingCustomers:input.openingCustomers,acv,annualChurn,annualExpansionComp,granularity,newACVByMonth:newACV},monthNewARR);
  monthly.forEach((m,i)=>{
    m.newACV=newACV[i];
    m.newCustomers=m.newARR/newACV[i];
    m.signedMRR=m.newARR/12;
    m.closingMRR=m.endARR/12;
    m.budgetPeriod=monthToPeriod(i,granularity);
    m.effectivePeriodPhasing=phase[m.budgetPeriod];
  });
  const annualCustomers=Array.from({length:yearsCount},(_,y)=>
    sum(monthly.slice(12*y,Math.min(months,12*(y+1))).map(m=>m.newCustomers)));
  const annualCAC=Array.from({length:yearsCount},(_,y)=>finite(input.cacByYear?.[y]??0,"CAC"));
  const smAllocation=Array.from({length:yearsCount},(_,y)=>finite(input.smBudgetPercentByYear?.[y]??100,"S&M allocation"));
  const annualSM=annualCustomers.map((count,y)=>count*annualCAC[y]*smAllocation[y]/100);
  const quarterSM=Array.from({length:yearsCount},(_,y)=>{
    const active=Math.ceil(Math.min(12,months-12*y)/3);
    const shares=(input.quarterSMSharesByYear?.[y]??Array(active).fill(100/active)).slice(0,active);
    if(shares.length!==active||shares.some(v=>!Number.isFinite(v)||v<0)||!near(sum(shares),100,1e-10))
      throw new RangeError("S&M quarter shares for Year "+(y+1)+" must total 100%");
    return shares.map(s=>annualSM[y]*s/100);
  });

  let cash=openingCash;
  monthly.forEach((m,i)=>{
    const first=12*m.year+3*m.quarter;
    const active=Math.min(3,months-first);
    const smPaid=quarterSM[m.year][m.quarter]/active;
    const cashCollected=i>=collectionLagMonths?monthly[i-collectionLagMonths].recognizedRevenue:0;
    const cogsPaid=m.recognizedRevenue*(1-grossMargin);
    const grossProfit=m.recognizedRevenue*grossMargin;
    const cashNeutralSMCapacity=cashCollected-cogsPaid-otherOpexMonthly;
    const opCF=cashNeutralSMCapacity-smPaid;
    const startCash=cash;
    cash+=opCF;
    Object.assign(m,{smPaid,cashCollected,cogsPaid,grossProfit,
      operatingContribution:grossProfit-smPaid,
      otherOpexPaid:otherOpexMonthly,cashNeutralSMCapacity,opCF,startCash,endCash:cash});
  });
  const quarters=buildRevenueBridge(monthly,"quarter");
  const years=buildRevenueBridge(monthly,"year");
  const total=key=>sum(monthly.map(m=>m[key]));
  const minimumCash=Math.min(openingCash,...monthly.map(m=>m.endCash));
  const summary={
    newCustomersNeeded,endingARR:monthly.at(-1).endARR,
    endingCash:cash,minimumCash,additionalLiquidityRequired:Math.max(0,-minimumCash),
    totalRecognizedRevenue:total("recognizedRevenue"),
    totalCashCollected:total("cashCollected"),totalSM:total("smPaid"),
    totalOpCF:total("opCF"),cashNeutralSMCapacity:total("cashNeutralSMCapacity"),
    monthsWithNegativeOpCF:monthly.filter(m=>m.opCF<0).length,
    annualizedNewARR:total("newARR"),
    targetGap:monthly.at(-1).endARR-targetARR,
  };
  return{
    months:monthly,quarters,years,summary,
    annualCustomers,annualSM,quarterSM,
    signingPattern:input.signingPattern||"EVEN",
    granularity,periodPhasing:phase,periodCount:periodTotals.length,
    manualBudget:input.newARRByPeriod!=null,
    assumptions:{
      subscription:"Monthly SaaS: customer starts at first invoicing month.",
      acquisition:"Signed MRR and recognized MRR coincide in first invoice month.",
      phasing:"Only year/quarter plan: first-invoice timing changes period recognition; no revenue discount.",
      churn:"New cohorts start churn/expansion in following BUDGET period.",
      costs:"COGS paid in revenue month; other operating outflows entered separately.",
      collections:"Monthly invoices, whole-month collection delay; no opening receivables.",
      cash:"No annual upfront billing, financing, tax or capex in this PLAN version.",
    },
  };
}
