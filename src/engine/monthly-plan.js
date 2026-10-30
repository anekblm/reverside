/**
 * SaaS PLAN monthly engine. ARR is an annualized stock; revenue and cash are
 * monthly flows. Signing timing is independent of S&M cash timing.
 */
export const SIGNING_PATTERNS = Object.freeze({
  FRONT: [0.35, 0.30, 0.20, 0.15],
  EVEN: [0.25, 0.25, 0.25, 0.25],
  BACK: [0.15, 0.20, 0.25, 0.40],
});
const sum = values => values.reduce((a, b) => a + b, 0);
function number(value, name, min = 0) {
  if (!Number.isFinite(value) || value < min) throw new RangeError(name + " must be finite and >= " + min);
  return value;
}
function weightsFor(months, yearShares = [], signingPattern = "EVEN") {
  const pattern = SIGNING_PATTERNS[signingPattern];
  if (!pattern) throw new RangeError("Unknown signing pattern");
  const years = Math.ceil(months / 12);
  const shares = Array.from({ length: years }, (_, y) => yearShares[y] ?? 100 / years);
  const total = sum(shares);
  if (total <= 0 || shares.some(v => !Number.isFinite(v) || v < 0)) throw new RangeError("Invalid year shares");
  const weights = [];
  for (let year = 0; year < years; year++) {
    const count = Math.min(12, months - year * 12);
    const activeQs = Math.ceil(count / 3);
    const qTotal = sum(pattern.slice(0, activeQs));
    for (let m = 0; m < count; m++) {
      const q = Math.floor(m / 3);
      weights.push((shares[year] / total) * pattern[q] / qTotal / Math.min(3, count - 3 * q));
    }
  }
  return weights;
}
function apportion(total, weights) {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError("Invalid customer count");
  const raw = weights.map(w => total * w);
  const result = raw.map(Math.floor);
  const missing = total - sum(result);
  const ranks = raw.map((v, i) => ({ i, rest: v - Math.floor(v) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let k = 0; k < missing; k++) result[ranks[k].i]++;
  return result;
}
function arrSchedule(settings, monthlyCustomers) {
  const { months, openingARR, acv, annualChurn, annualExpansionComp, priceNewOnExpansion } = settings;
  const grr = Math.pow(1 - annualChurn, 1 / 12);
  const nrrAnnual = 1 - annualChurn + annualExpansionComp;
  const nrr = Math.pow(nrrAnnual, 1 / 12);
  const acvFactor = nrrAnnual / (1 - annualChurn);
  let arr = openingARR;
  let yearNewARRStock = 0;
  return Array.from({ length: months }, (_, i) => {
    const year = Math.floor(i / 12), quarter = Math.floor((i % 12) / 3);
    const startARR = arr;
    const churnARR = startARR * (1 - grr);
    const expansionARR = startARR * (nrr - grr);
    const retainedARR = startARR - churnARR + expansionARR;
    const newACV = acv * Math.pow(acvFactor, year + (priceNewOnExpansion ? 1 : 0));
    const newARR = monthlyCustomers[i] * newACV;
    if (i % 12 === 0) yearNewARRStock = 0;
    const retainedNewCohorts = yearNewARRStock * nrr;
    const revenueNewInYear = (yearNewARRStock + retainedNewCohorts + newARR) / 24;
    yearNewARRStock = retainedNewCohorts + newARR;
    arr = retainedARR + newARR;
    return {
      index: i, month: i + 1, year, quarter, startARR, churnARR, expansionARR,
      newCustomers: monthlyCustomers[i], newACV, newARR, endARR: arr,
      existingRevenue: (startARR + retainedARR + newARR) / 24 - revenueNewInYear,
      newRevenue: revenueNewInYear,
      recognizedRevenue: (startARR + retainedARR + newARR) / 24,
    };
  });
}

function aggregate(rows, size) {
  const groups = [];
  for (let start = 0; start < rows.length; start += size) {
    const group = rows.slice(start, start + size);
    const first = group[0], last = group.at(-1);
    const total = key => sum(group.map(r => r[key]));
    groups.push({
      year: Math.floor(start / 12), quarter: Math.floor((start % 12) / 3),
      startMonth: start + 1, endMonth: start + group.length,
      startARR: first.startARR, endARR: last.endARR,
      startCash: first.startCash, endCash: last.endCash,
      newCustomers: total("newCustomers"), churnARR: total("churnARR"),
      expansionARR: total("expansionARR"), newARR: total("newARR"),
      existingRevenue: total("existingRevenue"), newRevenue: total("newRevenue"),
      recognizedRevenue: total("recognizedRevenue"),
      cashCollected: total("cashCollected"), cogsPaid: total("cogsPaid"),
      smPaid: total("smPaid"), otherOpexPaid: total("otherOpexPaid"),
      grossProfit: total("grossProfit"), operatingContribution: total("operatingContribution"),
      opCF: total("opCF"), cashNeutralSMCapacity: total("cashNeutralSMCapacity"),
    });
  }
  return groups;
}

/**
 * Monthly ARR / recognized revenue / operating cash forecast.
 * Cash assumptions: same-month COGS, no opening receivables or financing.
 */
export function forecastSaaS(input) {
  const months = number(input.months, "months", 1);
  if (!Number.isInteger(months) || months > 120) throw new RangeError("months must be integer 1-120");
  const openingARR = number(input.openingARR, "openingARR");
  const acv = number(input.acv, "acv", Number.EPSILON);
  const targetARR = number(input.targetARR, "targetARR");
  const annualChurn = number(input.annualChurn, "annualChurn");
  const annualExpansionComp = number(input.annualExpansionComp, "annualExpansionComp");
  const grossMargin = number(input.grossMargin, "grossMargin");
  if (annualChurn >= 1 || grossMargin > 1) throw new RangeError("Invalid churn or margin");
  if (1 - annualChurn + annualExpansionComp <= 0) throw new RangeError("NRR must exceed zero");
  const openingCash = number(input.openingCash ?? 0, "openingCash", -1e15);
  const otherOpexMonthly = number(input.otherOpexMonthly ?? 0, "otherOpexMonthly");
  const collectionLagMonths = number(input.collectionLagMonths ?? 0, "collectionLagMonths");
  if (!Number.isInteger(collectionLagMonths) || collectionLagMonths > 12) throw new RangeError("Collection delay must be 0-12 months");
  const yearsCount = Math.ceil(months / 12);
  const weights = weightsFor(months, input.yearShares, input.signingPattern || "EVEN");
  const scenario = { months, openingARR, acv, annualChurn, annualExpansionComp, priceNewOnExpansion: !!input.priceNewOnExpansion };
  const endingARR = count => arrSchedule(scenario, apportion(count, weights)).at(-1).endARR;
  let newCustomersNeeded = 0;
  if (endingARR(0) < targetARR) {
    let lower = 0, upper = Math.max(1, Math.ceil(targetARR / acv));
    while (endingARR(upper) < targetARR) {
      lower = upper;
      upper *= 2;
      if (!Number.isSafeInteger(upper) || upper > 1e8) throw new RangeError("Too many customers needed");
    }
    while (lower + 1 < upper) {
      const mid = Math.floor((lower + upper) / 2);
      if (endingARR(mid) >= targetARR) upper = mid;
      else lower = mid;
    }
    newCustomersNeeded = upper;
  }

  const customerSchedule = apportion(newCustomersNeeded, weights);
  const arrRows = arrSchedule(scenario, customerSchedule);
  const yearlyCustomers = Array.from({ length: yearsCount }, (_, y) =>
    sum(customerSchedule.slice(y * 12, Math.min(months, (y + 1) * 12))));
  const annualCAC = Array.from({ length: yearsCount }, (_, y) => number(input.cacByYear?.[y] ?? 0, "CAC"));
  const budgetPercent = Array.from({ length: yearsCount }, (_, y) => number(input.smBudgetPercentByYear?.[y] ?? 100, "S&M allocation"));
  const annualSM = yearlyCustomers.map((count, y) => count * annualCAC[y] * budgetPercent[y] / 100);
  const quarterSM = Array.from({ length: yearsCount }, (_, y) => {
    const active = Math.ceil(Math.min(12, months - y * 12) / 3);
    const shares = (input.quarterSMSharesByYear?.[y] || Array(active).fill(100 / active)).slice(0, active);
    if (shares.length !== active || shares.some(v => !Number.isFinite(v) || v < 0) || Math.abs(sum(shares) - 100) > 1e-6) {
      throw new RangeError("S&M quarter shares for Year " + (y + 1) + " must total 100%");
    }
    return shares.map(v => annualSM[y] * v / 100);
  });
  let cash = openingCash;
  const monthly = arrRows.map((r, i) => {
    const year = r.year, quarter = r.quarter;
    const firstMonthInQuarter = year * 12 + quarter * 3;
    const monthsInQuarter = Math.min(3, months - firstMonthInQuarter);
    const smPaid = quarterSM[year][quarter] / monthsInQuarter;
    const cashCollected = i >= collectionLagMonths ? arrRows[i - collectionLagMonths].recognizedRevenue : 0;
    const cogsPaid = r.recognizedRevenue * (1 - grossMargin);
    const grossProfit = r.recognizedRevenue * grossMargin;
    const cashNeutralSMCapacity = cashCollected - cogsPaid - otherOpexMonthly;
    const opCF = cashNeutralSMCapacity - smPaid;
    const startCash = cash;
    cash += opCF;
    return { ...r, smPaid, cashCollected, cogsPaid, grossProfit,
      operatingContribution: grossProfit - smPaid,
      otherOpexPaid: otherOpexMonthly, cashNeutralSMCapacity, opCF, startCash, endCash: cash };
  });

  const total = key => sum(monthly.map(m => m[key]));
  const minimumCash = Math.min(openingCash, ...monthly.map(m => m.endCash));
  const summary = {
    newCustomersNeeded, endingARR: monthly.at(-1).endARR,
    endingCash: cash, minimumCash,
    additionalLiquidityRequired: Math.max(0, -minimumCash),
    totalRecognizedRevenue: total("recognizedRevenue"),
    totalCashCollected: total("cashCollected"),
    totalSM: total("smPaid"), totalOpCF: total("opCF"),
    cashNeutralSMCapacity: total("cashNeutralSMCapacity"),
    monthsWithNegativeOpCF: monthly.filter(m => m.opCF < 0).length,
  };
  return {
    months: monthly, quarters: aggregate(monthly, 3), years: aggregate(monthly, 12),
    summary, annualCustomers: yearlyCustomers, annualSM, quarterSM,
    signingPattern: input.signingPattern || "EVEN",
    assumptions: {
      signing: "Contracts sign mid-month; first month recognizes 50% of new ARR / 12.",
      cash: "Cash excludes financing, tax, capex and non-operating movements.",
      costs: "COGS paid in revenue month; other operating outflows set by user.",
      collections: "Collection lag shifts recognized revenue; opening receivables not modeled.",
      metrics: "ARR is an annualized stock; revenue and cash are period flows.",
    },
  };
}
