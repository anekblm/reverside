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
  if (percent == null || length === 1) return baseline.slice();
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
  }
  return {weights,phase,periodTotals};
}
/** Different acquisition cohorts are never collapsed before churn / expansion. */
function makeARRRows(input, monthlySignedARR) {
  const {months,openingARR,annualChurn,annualExpansionComp,granularity,acv}=input;
  const grr=Math.pow(1-annualChurn,1/12);
  const nrr=Math.pow(1-annualChurn+annualExpansionComp,1/12);
  const holdMonths=periodMonths(granularity);
  const cohorts=[{firstInvoiceMonth:-1,arr:openingARR}];
  const rows=[];
  for(let m=0;m<months;m++) {
    if(monthlySignedARR[m]>0) cohorts.push({firstInvoiceMonth:m,arr:monthlySignedARR[m]});
    const vintageRows=[];
    let startARR=0,churnARR=0,expansionARR=0,endARR=0;
    for(const c of cohorts) {
      const newlyAdded=c.firstInvoiceMonth===m;
      const isEligible=c.firstInvoiceMonth<0 || m>= (Math.floor(c.firstInvoiceMonth/holdMonths)+1)*holdMonths;
      const before=newlyAdded?0:c.arr;
      const churn=(!newlyAdded&&isEligible)?before*(1-grr):0;
      const expansion=(!newlyAdded&&isEligible)?before*(nrr-grr):0;
      if(!newlyAdded)c.arr=before-churn+expansion;
      const newlySigned=newlyAdded?c.arr:0;
      startARR+=before;
      churnARR+=churn;
      expansionARR+=expansion;
      endARR+=c.arr;
      vintageRows.push({
        firstInvoiceMonth:c.firstInvoiceMonth,
        startARR:before,churnARR:churn,expansionARR:expansion,
        newARR:newlySigned,endARR:c.arr,recognizedRevenue:c.arr/12,
      });
    }
    const newARR=monthlySignedARR[m];
    const recognizedRevenue=endARR/12;
    rows.push({
      index:m,month:m+1,year:Math.floor(m/12),quarter:Math.floor((m%12)/3),
      startARR,churnARR,expansionARR,newARR,endARR,
      newCustomers:newARR/acv, newACV:acv,
      recognizedRevenue,
      existingRevenue:sum(vintageRows.filter(c=>c.firstInvoiceMonth<0).map(c=>c.recognizedRevenue)),
      newRevenue:sum(vintageRows.filter(c=>c.firstInvoiceMonth>=0).map(c=>c.recognizedRevenue)),
      cohortFlows:vintageRows,
    });
  }
  return rows;
}
