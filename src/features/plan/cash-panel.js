/** PLAN cash-flow readout. Presentation only; all numbers come from monthly-plan.js. */
const amountCell = (n, format, strong = false) =>
  '<td style="padding:8px;text-align:right;border-bottom:1px solid #e5e7eb;' +
  (strong ? 'font-weight:600;' : '') + '">' + format(Math.round(n)) + '</td>';
export function renderCashPanel(forecast, format) {
  const s = forecast.summary;
  const metric = (label, value, note) => `
    <div class="metric-box">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${format(Math.round(value))}</div>
      <div class="form-helper">${note}</div>
    </div>`;
  const quarterRows = forecast.quarters.map(q => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #e5e7eb;">Y${q.year + 1} Q${q.quarter + 1}</td>
      ${amountCell(q.cashCollected,format)}
      ${amountCell(-q.smPaid,format)}
      ${amountCell(q.opCF,format,true)}
      ${amountCell(q.endCash,format,true)}
    </tr>`).join('');
  const monthRows = forecast.months.map(m => `
    <tr>
      <td style="padding:7px;border-bottom:1px solid #eee;">M${m.month}</td>
      ${amountCell(m.endARR,format)}
      ${amountCell(m.recognizedRevenue,format)}
      ${amountCell(m.cashCollected,format)}
      ${amountCell(-m.smPaid,format)}
      ${amountCell(m.opCF,format,true)}
      ${amountCell(m.endCash,format,true)}
    </tr>`).join('');
  return `
    <div class="metric-grid" style="margin-bottom:1.25rem;">
      ${metric('S&M cash out · plan', s.totalSM, 'Total across selected horizon')}
      ${metric('Cash-neutral S&M capacity', s.cashNeutralSMCapacity, 'Period total, BEFORE S&M')}
      ${metric('Operating cash flow', s.totalOpCF, 'Cash in less cash operating out')}
      ${metric('Additional liquidity needed', s.additionalLiquidityRequired, 'To avoid a negative cash balance')}
    </div>
    <div class="form-helper" style="margin-bottom:12px;">
      Target closing ARR: <strong>${format(s.endingARR)}</strong> ·
      Customers to sign: <strong>${s.newCustomersNeeded.toLocaleString()}</strong> ·
      Months with negative OpCF: <strong>${s.monthsWithNegativeOpCF}</strong>
    </div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap;">
        <thead><tr><th align="left">Quarter</th><th align="right">Cash in</th><th align="right">S&M out</th><th align="right">OpCF</th><th align="right">Closing cash</th></tr></thead>
        <tbody>${quarterRows}</tbody>
      </table>
    </div>
    <details style="margin-top:14px;">
      <summary style="cursor:pointer;font-size:12px;">View monthly cash flow and ARR reconciliation</summary>
      <div style="overflow-x:auto;margin-top:10px;">
        <table style="width:100%;border-collapse:collapse;font-size:11px;white-space:nowrap;">
          <thead><tr><th align="left">Month</th><th align="right">End ARR</th><th align="right">Revenue</th><th align="right">Cash in</th><th align="right">S&M out</th><th align="right">OpCF</th><th align="right">Cash</th></tr></thead>
          <tbody>${monthRows}</tbody>
        </table>
      </div>
    </details>
    <div class="form-helper" style="margin-top:12px;line-height:1.6;">
      Assumptions: contracts sign mid-month; collections lag by the selected number of months;
      COGS are paid in the month of revenue. Opening receivables, financing, taxes and capex
      are not included. ARR is an annualized stock and is <strong>not cash in</strong>.
      Operating cash flow is an estimate until all operating payments are included.
    </div>
  `;
}
