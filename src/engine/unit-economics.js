/** Expected lifetime gross profit at acquisition ACV, without future expansion.
 * Acquisition-year retention follows B; following years repeat A's calendar
 * profile. A geometric tail covers the entire lifetime, not just PLAN's horizon.
 * This is an undiscounted model estimate, not realized profit or cash.
 */
export function cohortLifetimeGrossProfit(acv, grossMargin, {
  churnRate, churnPeriod = 'year', acquisitionMonth = 0,
  monthlyWeights = Array(12).fill(1), retentionPhasePercent = 100,
  firstMonthPhasePercent = 100, newCustomerRetentionEnabled = true,
} = {}) {
  const width = {year:12, quarter:3, month:1}[churnPeriod];
  if (![acv,grossMargin,churnRate,retentionPhasePercent,firstMonthPhasePercent].every(Number.isFinite) ||
      acv < 0 || grossMargin < 0 || grossMargin > 1 || churnRate <= 0 || churnRate >= 1 ||
      retentionPhasePercent < 0 || retentionPhasePercent > 100 || firstMonthPhasePercent < 0 || firstMonthPhasePercent > 100 ||
      !width || !Number.isInteger(acquisitionMonth) || acquisitionMonth < 0 || acquisitionMonth > 11 ||
      monthlyWeights.length !== 12 || monthlyWeights.some(w=>!Number.isFinite(w)||w<0) ||
      monthlyWeights.reduce((a,b)=>a+b,0) <= 0 || typeof newCustomerRetentionEnabled !== 'boolean') return null;

  const phase = retentionPhasePercent / 100;
  const monthlyChurn = -Math.expm1(Math.log1p(-churnRate) / width);
  let surviving = 1;
  let acquisitionRevenue = firstMonthPhasePercent / 100 / 12;
  for (let m=acquisitionMonth+1; m<12; m++) {
    const lost = newCustomerRetentionEnabled ? surviving * monthlyChurn : 0;
    acquisitionRevenue += (surviving - lost * phase) / 12;
    surviving -= lost;
  }

  let retained = 1, annualRevenue = 0;
  for (let start=0; start<12; start+=width) {
    const opening = retained;
    const weights = monthlyWeights.slice(start,start+width);
    const total = weights.reduce((a,b)=>a+b,0);
    for (const weight of weights) {
      const lost = opening * churnRate * (total > 0 ? weight / total : 1 / width);
      annualRevenue += (retained - lost * phase) / 12;
      retained -= lost;
    }
  }
  const annualLoss = -Math.expm1(Math.log1p(-churnRate) * (12 / width));
  return acv * grossMargin * (acquisitionRevenue + surviving * annualRevenue / annualLoss);
}

// Step 2 illustration: January acquisition, Year + Even, full first-month revenue.
// PLAN uses the actual acquisition dates and timing.
export function annualGrossProfitLtv(acv, grossMargin, annualChurn) {
  return cohortLifetimeGrossProfit(acv,grossMargin,{churnRate:annualChurn});
}

export function cacLimits(ltv, monthlyGrossProfit, profilePaybackMonths = null) {
  if (ltv === null || !Number.isFinite(ltv) || ltv < 0 || !Number.isFinite(monthlyGrossProfit) || monthlyGrossProfit < 0)
    return {maxCAC:null,recommendedCAC:null};
  const profileCap = Number.isFinite(profilePaybackMonths) && profilePaybackMonths > 0
    ? monthlyGrossProfit * profilePaybackMonths : Infinity;
  return {maxCAC:ltv/3,recommendedCAC:Math.min(ltv/5,profileCap)};
}
