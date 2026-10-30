/**
 * Estimated gross-profit lifetime value under the simplified constant annual
 * logo-churn assumption. This is NOT realized cash flow or an observed LTV.
 * Future cohorts and cash-flow models must remain distinct from this proxy.
 */
export function annualGrossProfitLtv(acv, grossMargin, annualChurn) {
  if (!Number.isFinite(acv) || !Number.isFinite(grossMargin) || !Number.isFinite(annualChurn)) {
    return null;
  }
  if (acv < 0 || grossMargin < 0 || grossMargin > 1 || annualChurn <= 0 || annualChurn > 1) {
    return null;
  }
  return (acv * grossMargin) / annualChurn;
}
