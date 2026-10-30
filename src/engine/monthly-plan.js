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
  return Array.from({ length: months }, (_, i) => {
    const year = Math.floor(i / 12), quarter = Math.floor((i % 12) / 3);
    const startARR = arr;
    const churnARR = startARR * (1 - grr);
    const expansionARR = startARR * (nrr - grr);
    const retainedARR = startARR - churnARR + expansionARR;
    const newACV = acv * Math.pow(acvFactor, year + (priceNewOnExpansion ? 1 : 0));
    const newARR = monthlyCustomers[i] * newACV;
    arr = retainedARR + newARR;
    return {
      index: i, month: i + 1, year, quarter, startARR, churnARR, expansionARR,
      newCustomers: monthlyCustomers[i], newACV, newARR, endARR: arr,
      existingRevenue: (startARR + retainedARR) / 24,
      newRevenue: newARR / 24,
      recognizedRevenue: (startARR + retainedARR + newARR) / 24,
    };
  });
}
