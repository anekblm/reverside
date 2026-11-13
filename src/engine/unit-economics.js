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

// Shared by PLAN's period metrics and annual acquisition strategy. All CARR
// inputs are annualized, even when the matrix displays Period CARR.
export function contractedUnitEconomics(period, grossMargin, annualChurn) {
  const acv = period.endCustomers > 0 ? period.endACV : null;
  const ltv = acv === null ? null : annualGrossProfitLtv(acv, grossMargin, annualChurn);
  return { acv, ltv, maxCAC: ltv === null ? null : ltv / 3,
    recommendedCAC: ltv === null ? null : ltv / 5 };
}
