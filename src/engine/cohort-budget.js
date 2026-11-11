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

export function churnPeriodRates(rate, period, annualExpansion) {
  const width=periodMonths(period);
  if(finite(rate,"Churn rate")>=1) throw new RangeError("Churn rate must be below 100%");
  finite(annualExpansion,"Annual expansion");
  const periods=12/width;
  const expansion=Math.expm1(Math.log1p(annualExpansion)/periods);
  return {
    width, churn:rate, expansion,
    annualGrossRetention:(1-rate)**periods,
    annualNRR:(1-rate+expansion)**periods,
  };
}

function validateMonthlyWeights(weights) {
  if(weights.length!==12 || weights.some(weight=>!Number.isFinite(weight)||weight<0) || sum(weights)<=0)
    throw new RangeError("Distribution must contain twelve nonnegative monthly weights with a positive total");
}
function monthToPeriod(month, granularity) {
  return Math.floor(month / periodMonths(granularity));
}
function monthsInPeriod(index, totalMonths, granularity) {
  const start = index * periodMonths(granularity);
  return Math.min(totalMonths - start, periodMonths(granularity));
}

/**
 * PLAN distinguishes signed Contracted ARR from the amount of that cohort's
 * subscription revenue realized in its ORIGINAL input-budget period.
 * Phase = earned current-period NEW revenue / theoretical full-period
 * new CARR revenue. Thus 100 New CARR in Q1 at 25% phase earns
 * 100 * 3/12 * 0.25 = 6.25, not 25 or 16.67.
 *
 * Zero through the naturally signable maximum is possible without
 * recognizing any revenue before the signed customer exists. Anything above
 * the signed-month maximum needs an explicit different signing allocation.
 */
export function feasiblePhasingRange(monthsInBudgetPeriod) {
  if(!Number.isInteger(monthsInBudgetPeriod)||monthsInBudgetPeriod<1)
    throw new RangeError("Budget period length must be a positive number of months");
  return [0,100];
}
function phaseFraction(monthWeights) {
  const total=sum(monthWeights);
  if(total<=0)return 1;
  return sum(monthWeights.map((w,i)=>w*(monthWeights.length-i)/monthWeights.length))/total;
}
// Between quarters: the user-approved annual FRONT/EVEN/BACK shares.
// Within a quarter: independent monthly signing weights. FRONT and BACK
// here are provisional symmetric presets (50/30/20 and 20/30/50);
// they are NOT inherited from the annual preset.
export const MONTH_SIGNING_PATTERNS=Object.freeze({
  FRONT:[50,30,20], EVEN:[1,1,1], BACK:[20,30,50],
});
function monthlyTemplateWeights(months,yearShares=[],quarterPattern="EVEN",
                                monthPattern="EVEN",monthlyPatternsByQuarter=null,monthlyWeights=null) {
  const quarterWeights=SIGNING_PATTERNS[quarterPattern];
  if(!quarterWeights)throw new RangeError("Unknown between-quarter pattern: "+quarterPattern);
  if(!MONTH_SIGNING_PATTERNS[monthPattern])
    throw new RangeError("Unknown within-quarter pattern: "+monthPattern);
  const years=Math.ceil(months/12);
  const shares=Array.from({length:years},(_,y)=>yearShares[y]??100/years);
  if(shares.some(x=>!Number.isFinite(x)||x<0)||sum(shares)<=0)
    throw new RangeError("Invalid yearly distribution");
  const result=[];
  if(monthlyWeights) validateMonthlyWeights(monthlyWeights);
  for(let y=0;y<years;y++) {
    const yMonths=Math.min(12,months-12*y);
    if(monthlyWeights) {
      const active=monthlyWeights.slice(0,yMonths);
      const activeWeight=sum(active);
      for(const weight of active) result.push(activeWeight>0?shares[y]*weight/activeWeight:0);
      continue;
    }
    const activeQ=Math.ceil(yMonths/3);
    const activeQWeight=sum(quarterWeights.slice(0,activeQ));
    for(let q=0;q<activeQ;q++){
      const qMonths=Math.min(3,yMonths-3*q);
      const override=monthlyPatternsByQuarter?.[4*y+q]??monthPattern;
      const monthWeights=MONTH_SIGNING_PATTERNS[override];
      if(!monthWeights)throw new RangeError("Unknown month pattern for Y"+(y+1)+" Q"+(q+1));
      const within=monthWeights.slice(0,qMonths),qTotal=sum(within);
      for(const weight of within)result.push(
        shares[y]/sum(shares)*quarterWeights[q]/activeQWeight*weight/qTotal
      );
    }
  }
  return result;
}
function firstInvoiceWeights(input) {
  const {months,granularity,phasePercent,phaseByPeriod,newARRByPeriod}=input;
  const firstMonthPhase=input.newCustomerFirstMonthPhasePercent;
  const width=periodMonths(granularity);
  const count=Math.ceil(months/width);
  const template=monthlyTemplateWeights(months,input.yearShares,input.signingPattern,
    input.monthlySigningPattern??"EVEN",input.monthlyPatternsByQuarter,input.newARRMonthlyWeights);
  const total=sum(template);
  const periodTotals=Array.from({length:count},(_,p)=>
    total>0?sum(template.slice(p*width,Math.min(months,(p+1)*width)))/total:0);
  if(newARRByPeriod!=null){
    if(newARRByPeriod.length!==count)throw new RangeError("Manual ARR needs one amount per budget period");
    newARRByPeriod.forEach(v=>finite(v,"period New ARR"));
  }
  const weights=[],intraPeriodWeights=[],phase=[],phaseRanges=[];
  for(let p=0;p<count;p++){
    const begin=p*width;
    const within=template.slice(begin,Math.min(months,begin+width));
    const withinSum=sum(within);
    const normalized=withinSum>0?within.map(v=>v/withinSum):
      Array(within.length).fill(1/within.length);
    const natural=phaseFraction(normalized)*100;
    // Each signing cohort contributes one acquisition month out of the period.
    const minimum=firstMonthPhase==null?0:Math.max(0,natural-100/within.length);
    const requested=firstMonthPhase==null
      ? phaseByPeriod?.[p]??phasePercent??natural
      : minimum+(natural-minimum)*firstMonthPhase/100;
    finite(requested,"Revenue phasing for period "+(p+1));
    if(requested>natural+1e-8&&!(newARRByPeriod&&newARRByPeriod[p]===0))throw new RangeError(
      "Revenue phasing "+Number(requested).toFixed(2)+"% exceeds "+
      natural.toFixed(2)+"% realizable with the chosen signing months "+
      "in budget period "+(p+1)+
      ". Choose an earlier within-quarter signing pattern or edit signing amounts.");
    phaseRanges.push([minimum,natural]);
    phase.push(requested);
    weights.push(...normalized.map(v=>v*periodTotals[p]));
    intraPeriodWeights.push(...normalized);
  }
  return {weights,phase,phaseRanges,periodTotals,intraPeriodWeights};
}

export function maximumNewRevenuePhase({months,granularity,yearShares,signingPattern,monthlySigningPattern}) {
  const {phaseRanges}=firstInvoiceWeights({
    months,granularity,yearShares,signingPattern,monthlySigningPattern,
  });
  return Math.min(...phaseRanges.map(([,maximum])=>maximum));
}

/** Different acquisition cohorts are never collapsed before churn / expansion. */
function makeARRRows(input, monthlySignedARR) {
  const {months,openingARR,annualChurn,annualExpansionComp,granularity,acv,existingRetention,retention}=input;
  const newCustomerRetentionEnabled=input.newCustomerRetentionEnabled;
  const openingCustomers=input.openingCustomers??openingARR/acv;
  const newACVByMonth=input.newACVByMonth??Array(months).fill(acv);
  const budgetWidth=periodMonths(granularity);
  const width=retention?.width??budgetWidth;
  const annualGrossRetention=1-annualChurn;
  const annualNRR=annualGrossRetention+annualExpansionComp;
  const monthlyGrossRetention=(retention?.annualGrossRetention??annualGrossRetention)**(1/12);
  const monthlyNetRetention=(retention?.annualNRR??annualNRR)**(1/12);
  const monthlyChurn=1-monthlyGrossRetention;
  const monthlyExpansion=monthlyNetRetention-monthlyGrossRetention;
  const cohorts=[{firstInvoiceMonth:-1,arr:openingARR,count:openingCustomers}];
  const rows=[];
  let yearOpeningARR=0, priorExistingChurn=0, priorExistingExpansion=0;
  for(let m=0;m<months;m++) {
    const monthOfYear=m%12;
    const yearStart=m-monthOfYear;
    const existingWeight=existingRetention?.weights[monthOfYear];
    if(existingRetention && monthOfYear===0) {
      yearOpeningARR=0;
      priorExistingChurn=0;
      priorExistingExpansion=0;
      for(const c of cohorts) {
        yearOpeningARR+=c.arr;
      }
    }
    if(existingRetention && m%existingRetention.width===0) {
      for(const c of cohorts) {
        if(c.firstInvoiceMonth>=yearStart) continue;
        c.retentionOpeningARR=c.arr;
        c.retentionOpeningCustomers=c.count;
      }
    }
    const periodStart=Math.floor(m/width)*width;
    const periodLength=Math.min(width,months-periodStart);
    if(m===periodStart) {
      const churn=retention?.churn??1-Math.pow(annualGrossRetention,periodLength/12);
      const expansion=retention?.expansion??Math.pow(annualNRR,periodLength/12)-(1-churn);
      for(const c of cohorts) {
        if(existingRetention && c.firstInvoiceMonth<yearStart) continue;
        const eligible=c.firstInvoiceMonth<periodStart;
        c.periodChurnPerMonth=eligible?c.arr*churn/periodLength:0;
        c.periodExpansionPerMonth=eligible?c.arr*expansion/periodLength:0;
        c.periodLostCustomersPerMonth=eligible?c.count*churn/periodLength:0;
      }
    }
    if(monthlySignedARR[m]>0)cohorts.push({
      firstInvoiceMonth:m,arr:monthlySignedARR[m],count:monthlySignedARR[m]/newACVByMonth[m],
      periodChurnPerMonth:0,periodExpansionPerMonth:0,periodLostCustomersPerMonth:0
    });
    const vintageRows=[];
    let startARR=0,churnARR=0,expansionARR=0,endARR=0;
    let startCustomers=0,churnCustomers=0,endCustomers=0;
    let existingChurn=0, existingExpansion=0;
    for(const c of cohorts) {
      const newlyAdded=c.firstInvoiceMonth===m;
      const before=newlyAdded?0:c.arr;
      const beforeCustomers=newlyAdded?0:c.count;
      const useYearOpening=existingRetention && c.firstInvoiceMonth<yearStart;
      const cohortWeight=retention&&existingRetention?existingWeight*periodLength:1;
      let churn=useYearOpening
        ? c.retentionOpeningARR*existingRetention.churn*existingWeight : c.periodChurnPerMonth*cohortWeight;
      let expansion=useYearOpening
        ? c.retentionOpeningARR*existingRetention.expansion*existingWeight : c.periodExpansionPerMonth*cohortWeight;
      let lostCustomers=useYearOpening
        ? c.retentionOpeningCustomers*existingRetention.churn*existingWeight : c.periodLostCustomersPerMonth*cohortWeight;
      if(newCustomerRetentionEnabled!=null && c.firstInvoiceMonth>=yearStart) {
        const eligible=newCustomerRetentionEnabled&&!newlyAdded;
        churn=eligible?before*monthlyChurn:0;
        expansion=eligible?before*monthlyExpansion:0;
        lostCustomers=eligible?beforeCustomers*monthlyChurn:0;
      }
      const retentionPhase=existingRetention&&(useYearOpening||retention||newCustomerRetentionEnabled!=null)
        ?existingRetention.phase:1;
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
      const recognizedRevenue=(newlyAdded?c.arr:before+(expansion-churn)*retentionPhase)/12;
      if(useYearOpening) {
        existingChurn+=churn;
        existingExpansion+=expansion;
      }
      vintageRows.push({
        firstInvoiceMonth:c.firstInvoiceMonth,
        startARR:before,churnARR:churn,expansionARR:expansion,
        startCustomers:beforeCustomers,churnCustomers:lostCustomers,
        newCustomers:newlyAdded?c.count:0,endCustomers:c.count,
        newARR:newlySigned,endARR:c.arr,recognizedRevenue,retentionPhase,
      });
    }
    const newARR=monthlySignedARR[m];
    const existingRevenue=sum(vintageRows.filter(c=>c.firstInvoiceMonth<yearStart).map(c=>c.recognizedRevenue));
    const newRevenue=sum(vintageRows.filter(c=>c.firstInvoiceMonth>=yearStart).map(c=>c.recognizedRevenue));
    let originalRevenueBridge;
    if(existingRetention) {
      const originalChurnThisMonth=-existingChurn*existingRetention.phase/12;
      const originalExpansionThisMonth=existingExpansion*existingRetention.phase/12;
      originalRevenueBridge={
        originalBaseRevenue:yearOpeningARR/12,
        originalChurnRevenueImpact:originalChurnThisMonth-priorExistingChurn/12,
        originalExpansionRevenueImpact:originalExpansionThisMonth+priorExistingExpansion/12,
        originalChurnThisMonth,
        originalExpansionThisMonth,
      };
      priorExistingChurn+=existingChurn;
      priorExistingExpansion+=existingExpansion;
    }
    rows.push({
      index:m,month:m+1,year:Math.floor(m/12),quarter:Math.floor(monthOfYear/3),
      budgetPeriod:Math.floor(m/budgetWidth),
      startARR,churnARR,expansionARR,newARR,endARR,
      startCustomers,churnCustomers,endCustomers,
      newCustomers:newARR/newACVByMonth[m],newACV:newACVByMonth[m],
      recognizedRevenue:existingRevenue+newRevenue,
      existingRevenue,newRevenue,originalRevenueBridge,
      cohortFlows:vintageRows,
    });
  }
  return rows;
}

/**
 * Keep cohort membership monthly in every view. A is the year-opening
 * base, C is the acquisition month, and B is subsequent months that year.
 */
export function buildRevenueBridge(monthly, view = "quarter") {
  const width=periodMonths(view);
  const output=[];
  for(let start=0;start<monthly.length;start+=width) {
    const slice=monthly.slice(start,start+width), first=slice[0],last=slice.at(-1);
    const yearStart=Math.floor(start/12)*12;
    const hasYearOpeningBridge=first.originalRevenueBridge!=null;
    const metrics={
      originalBaseRevenue:0,originalChurnRevenueImpact:0,originalExpansionRevenueImpact:0,
      originalOpeningRevenue:0,originalMonthlyChurnImpact:0,originalMonthlyExpansionImpact:0,
      earlierNewBaseRevenue:0,earlierNewChurnRevenueImpact:0,earlierNewExpansionRevenueImpact:0,
      earlierNewRealizationImpact:0,
      currentNewRevenue:0,currentNewChurnRevenueImpact:0,currentNewExpansionRevenueImpact:0,
      currentNewRealizationImpact:0,
    };
    const cohortARR = {};
    const cohortMovementKeys=["StartARR","ChurnARR","ExpansionARR","NewARR","EndARR",
      "StartCustomers","ChurnCustomers","NewCustomers","EndCustomers"];
    for(const prefix of ["original","earlier","current"]){
      for(const key of cohortMovementKeys)
        cohortARR[prefix+key] = 0;
    }
    const classify = (vintage,monthIndex) => vintage<yearStart
      ? "original" : vintage<monthIndex ? "earlier" : "current";
    let earlierTransferARR=0, earlierTransferCustomers=0;
    for(const c of first.cohortFlows) {
      const bucket=classify(c.firstInvoiceMonth,first.index);
      cohortARR[bucket+"StartARR"]+=c.startARR;
      cohortARR[bucket+"StartCustomers"]+=c.startCustomers;
      if(bucket==="original" && !hasYearOpeningBridge) metrics.originalBaseRevenue+=c.startARR*slice.length/12;
    }
    slice.forEach((month,i)=>{
      if(hasYearOpeningBridge) {
        const bridge=month.originalRevenueBridge;
        metrics.originalBaseRevenue+=bridge.originalBaseRevenue;
        metrics.originalChurnRevenueImpact+=bridge.originalChurnRevenueImpact;
        metrics.originalExpansionRevenueImpact+=bridge.originalExpansionRevenueImpact;
        metrics.originalMonthlyChurnImpact+=bridge.originalChurnThisMonth;
        metrics.originalMonthlyExpansionImpact+=bridge.originalExpansionThisMonth;
      }
      const revenueWeight=(slice.length-i)/12;
      for(const c of month.cohortFlows) {
        const bucket=classify(c.firstInvoiceMonth,month.index);
        cohortARR[bucket+"ChurnARR"]+=c.churnARR;
        cohortARR[bucket+"ExpansionARR"]+=c.expansionARR;
        cohortARR[bucket+"NewARR"]+=c.newARR;
        cohortARR[bucket+"ChurnCustomers"]+=c.churnCustomers;
        cohortARR[bucket+"NewCustomers"]+=c.newCustomers;
        if(bucket==="original") {
          metrics.originalOpeningRevenue+=c.startARR/12;
          if(!hasYearOpeningBridge) {
            metrics.originalChurnRevenueImpact-=c.churnARR*revenueWeight;
            metrics.originalExpansionRevenueImpact+=c.expansionARR*revenueWeight;
            metrics.originalMonthlyChurnImpact-=c.churnARR/12;
            metrics.originalMonthlyExpansionImpact+=c.expansionARR/12;
          }
        } else if(bucket==="earlier") {
          // Transfers at the opening boundary are already in B's opening stock.
          if(i>0 && c.firstInvoiceMonth===month.index-1) {
            earlierTransferARR+=c.startARR;
            earlierTransferCustomers+=c.startCustomers;
          }
          metrics.earlierNewBaseRevenue+=c.startARR/12;
          metrics.earlierNewChurnRevenueImpact-=c.churnARR*(c.retentionPhase??1)/12;
          metrics.earlierNewExpansionRevenueImpact+=c.expansionARR*(c.retentionPhase??1)/12;
          metrics.earlierNewRealizationImpact+=c.realizationAdjustment??0;
        } else {
          metrics.currentNewRevenue+=c.newARR/12;
          metrics.currentNewRealizationImpact+=c.realizationAdjustment??0;
        }
      }
    });
    const originalNet=metrics.originalBaseRevenue+
      metrics.originalChurnRevenueImpact+metrics.originalExpansionRevenueImpact;
    const earlierNet=metrics.earlierNewBaseRevenue+
      metrics.earlierNewChurnRevenueImpact+metrics.earlierNewExpansionRevenueImpact+
      metrics.earlierNewRealizationImpact;
    const currentNet=metrics.currentNewRevenue+metrics.currentNewRealizationImpact;
    for(const c of last.cohortFlows) {
      const prefix=classify(c.firstInvoiceMonth,last.index);
      cohortARR[prefix+"EndARR"]+=c.endARR;
      cohortARR[prefix+"EndCustomers"]+=c.endCustomers;
    }
    for(const prefix of ["original","earlier","current"]){
      const transferDirection=prefix==="earlier"?1:prefix==="current"?-1:0;
      if(!near(cohortARR[prefix+"StartARR"]-
               cohortARR[prefix+"ChurnARR"]+
               cohortARR[prefix+"ExpansionARR"]+
               cohortARR[prefix+"NewARR"]+transferDirection*earlierTransferARR,
               cohortARR[prefix+"EndARR"]))
        throw new Error("Cohort ARR bridge does not reconcile: "+prefix+
          " months "+(start+1)+"-"+(start+slice.length));
      if(!near(cohortARR[prefix+"StartCustomers"]-
               cohortARR[prefix+"ChurnCustomers"]+
               cohortARR[prefix+"NewCustomers"]+transferDirection*earlierTransferCustomers,
               cohortARR[prefix+"EndCustomers"]))
        throw new Error("Cohort customer bridge does not reconcile: "+prefix+
          " months "+(start+1)+"-"+(start+slice.length));
    }
    for(const key of cohortMovementKeys)
      cohortARR["acquired"+key]=cohortARR["earlier"+key]+cohortARR["current"+key];
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
      netRevenueRetention:first.startARR>0?retainedBaseARR/first.startARR:null,
      ...cohortARR,
      earlierTransferARR,earlierTransferCustomers,
      recognizedRevenue:flow("recognizedRevenue"),
      existingRevenue:originalNet,newRevenue:earlierNet+currentNet,
      originalNetRevenue:originalNet,earlierNewNetRevenue:earlierNet,currentNewNetRevenue:currentNet,
      ...metrics,
      ...(view==="month" && hasYearOpeningBridge ? {
        originalChurnThisMonth:first.originalRevenueBridge.originalChurnThisMonth,
        originalExpansionThisMonth:first.originalRevenueBridge.originalExpansionThisMonth,
      } : {}),
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
 * newCustomerFirstMonthPhasePercent applies only to the acquisition month.
 * Otherwise phasePercent/phaseByPeriod apply to the acquisition budget period.
 * existingRetention allocates start-of-year cohorts' annual changes over 12 months
 * and sets the fraction of each change earned in its first month.
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
  if(input.newCustomerRetentionEnabled!=null&&typeof input.newCustomerRetentionEnabled!=="boolean")
    throw new TypeError("New customer retention must be enabled or disabled");
  const annualExpansionComp=finite(input.annualExpansionComp,"annualExpansionComp");
  const retention=input.churnPeriod==null?null:
    churnPeriodRates(input.churnRate,input.churnPeriod,annualExpansionComp);
  const annualChurn=retention?1-retention.annualGrossRetention:finite(input.annualChurn,"annualChurn");
  const grossMargin=finite(input.grossMargin,"grossMargin");
  if(annualChurn>=1||grossMargin>1||1-annualChurn+annualExpansionComp<=0)
    throw new RangeError("Churn, NRR or margin outside valid range");
  const collectionLagMonths=finite(input.collectionLagMonths??0,"collectionLagMonths");
  if(!Number.isInteger(collectionLagMonths)||collectionLagMonths>12)
    throw new RangeError("Collection lag must be whole months from 0 to 12");
  const openingCash=finite(input.openingCash??0,"openingCash",-1e15);
  const otherOpexMonthly=finite(input.otherOpexMonthly??0,"otherOpexMonthly");
  const firstMonthPhase=input.newCustomerFirstMonthPhasePercent;
  if(firstMonthPhase!=null && finite(firstMonthPhase,"New customer first-month revenue phasing")>100)
    throw new RangeError("New customer first-month revenue phasing must be <= 100%");
  const yearsCount=Math.ceil(months/12);
  const {weights,phase,phaseRanges,periodTotals,intraPeriodWeights}=
    firstInvoiceWeights({...input,months,granularity});
  const nrrAnnual=retention?.annualNRR??1-annualChurn+annualExpansionComp;
  const factor=nrrAnnual/(retention?.annualGrossRetention??1-annualChurn);
  const newACV=Array.from({length:months},(_,m)=>
    acv*Math.pow(factor,Math.floor(m/12)+(input.priceNewOnExpansion?1:0)));
  let existingRetention;
  if(input.existingRetention) {
    const {pattern="EVEN",phasePercent=50,monthlyWeights}=input.existingRetention;
    finite(phasePercent,"Existing customer revenue phasing");
    if(phasePercent>100) throw new RangeError("Existing customer revenue phasing must be <= 100%");
    const template=monthlyWeights??monthlyTemplateWeights(12,[],pattern);
    validateMonthlyWeights(template);
    const retentionWidth=retention?.width??12;
    const weights=Array.from({length:12/retentionWidth},(_,p)=>{
      const period=template.slice(p*retentionWidth,(p+1)*retentionWidth);
      const total=sum(period);
      return period.map(weight=>total>0?weight/total:1/retentionWidth);
    }).flat();
    existingRetention={
      width:retentionWidth, weights, phase:phasePercent/100,
      churn:retention?.churn??annualChurn, expansion:retention?.expansion??annualExpansionComp,
    };
  }
  const retentionInput={months,openingARR,openingCustomers:input.openingCustomers,acv,
    annualChurn,annualExpansionComp,granularity,newACVByMonth:newACV,existingRetention,retention,
    newCustomerRetentionEnabled:input.newCustomerRetentionEnabled};
  let newCustomersNeeded;
  let monthNewARR;
  if(input.newARRByPeriod != null) {
    monthNewARR=intraPeriodWeights.map((weight,m)=>weight*input.newARRByPeriod[Math.floor(m/width)]);
    newCustomersNeeded=sum(monthNewARR.map((arr,m)=>arr/newACV[m]));
  } else {
    const zeros=Array(months).fill(0);
    const baseline=makeARRRows(retentionInput,zeros).at(-1).endARR;
    const unitARR=weights.map((w,m)=>w*newACV[m]);
    const withOne=makeARRRows(retentionInput,unitARR).at(-1).endARR;
    const endingContribution=withOne-baseline;
    newCustomersNeeded=targetARR>baseline && sum(unitARR)>0?
      Math.ceil((targetARR-baseline)/endingContribution-1e-10):0;
    if(!Number.isSafeInteger(newCustomersNeeded)||newCustomersNeeded>1e8)throw new RangeError("Target requires too many customers");
    monthNewARR=unitARR.map(v=>v*newCustomersNeeded);
  }
  const monthly=makeARRRows(retentionInput,monthNewARR);
  monthly.forEach((m,i)=>{
    m.newACV=newACV[i];
    m.newCustomers=m.newARR/newACV[i];
    m.signedMRR=m.newARR/12;
    m.closingMRR=m.endARR/12;
    m.budgetPeriod=monthToPeriod(i,granularity);
    m.effectivePeriodPhasing=phase[m.budgetPeriod];
  });
  // Store realization once in the monthly ledger for TRACK and every view.
  // Contracted New ARR and cohort churn are calculated independently.
  for(let p=0;p<periodTotals.length;p++){
    const begin=p*width,end=Math.min(months,begin+width);
    const budget=monthly.slice(begin,end);
    const signed=sum(budget.map(row=>row.newARR));
    const unphased=sum(budget.flatMap(row=>row.cohortFlows
      .filter(c=>c.firstInvoiceMonth>=begin&&c.firstInvoiceMonth<end)
      .map(c=>c.recognizedRevenue)));
    const target=signed*(end-begin)/12*phase[p]/100;
    if(target>unphased+1e-7*Math.max(1,unphased))throw new Error(
      "Period "+(p+1)+" cannot recognize more new revenue than signed-month activity");
    const scale=unphased>0?target/unphased:1;
    for(const row of budget){
      for(const c of row.cohortFlows){
        const currentBudgetCohort=c.firstInvoiceMonth>=begin&&c.firstInvoiceMonth<end;
        const raw=c.recognizedRevenue;
        if(firstMonthPhase!=null) {
          if(c.firstInvoiceMonth===row.index) c.recognizedRevenue=raw*firstMonthPhase/100;
        } else if(currentBudgetCohort) {
          c.recognizedRevenue=raw*scale;
        }
        c.realizationAdjustment=c.recognizedRevenue-raw;
      }
      row.recognizedRevenue=sum(row.cohortFlows.map(c=>c.recognizedRevenue));
      const yearStart=Math.floor(row.index/12)*12;
      row.existingRevenue=sum(row.cohortFlows.filter(c=>c.firstInvoiceMonth<yearStart)
        .map(c=>c.recognizedRevenue));
      row.newRevenue=row.recognizedRevenue-row.existingRevenue;
    }
    if(signed>0&&!near(sum(budget.flatMap(row=>row.cohortFlows
      .filter(c=>c.firstInvoiceMonth>=begin&&c.firstInvoiceMonth<end)
      .map(c=>c.recognizedRevenue))),target))
      throw new Error("Budget-period revenue phasing failed to reconcile for period "+(p+1));
  }
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
  const monthlyBridge=buildRevenueBridge(monthly,"month");
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
    months:monthly,monthlyBridge,quarters,years,summary,
    annualCustomers,annualSM,quarterSM,
    signingPattern:input.signingPattern||"EVEN",
    monthlySigningPattern:input.monthlySigningPattern||"EVEN",
    granularity, churnPeriod:input.churnPeriod, periodPhasing:phase,periodPhaseRanges:phaseRanges,
    newCustomerRetentionEnabled:input.newCustomerRetentionEnabled,
    periodCount:periodTotals.length,
    manualBudget:input.newARRByPeriod!=null,
    assumptions:{
      subscription:"Monthly SaaS: customer starts at first invoicing month.",
      acquisition:"New Contracted ARR enters signed cohorts immediately.",
      phasing:firstMonthPhase!=null
        ? "First-month phasing is applied once to signed CARR / 12. Full recurring revenue starts the following month."
        : "Year/quarter/month budget recognition percentage is applied once to the new cohort's maximum period revenue; the result is allocated to months and preserved in views.",
      churn:input.newCustomerRetentionEnabled===true
        ? "New cohorts use equivalent monthly churn and expansion from the month after acquisition."
        :input.newCustomerRetentionEnabled===false
          ? "Current-year acquisitions start churn and expansion next year when they join the opening base."
          :retention?"New cohorts start churn and expansion in the next churn period."
            :"New cohorts start churn and expansion in the next budget period.",
      costs:"COGS paid in revenue month; other operating outflows entered separately.",
      collections:"Monthly invoices, whole-month collection delay; no opening receivables.",
      cash:"No annual upfront billing, financing, tax or capex in this PLAN version.",
    },
  };
}
