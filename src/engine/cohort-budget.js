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
