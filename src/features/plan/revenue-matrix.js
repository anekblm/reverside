import { buildRevenueBridge } from "../../engine/cohort-budget.js";

const money = (value, currency) => new Intl.NumberFormat("sv-SE", {
  style:"currency",currency:currency||"EUR",minimumFractionDigits:0,maximumFractionDigits:2,
}).format(Math.abs(value)<1e-9?0:value);
const cell = (value, cc, bold=false) => `<td style="padding:8px 10px;min-width:92px;text-align:right;white-space:nowrap;
  font-variant-numeric:tabular-nums;border-bottom:1px solid #ececec;${bold?'font-weight:650;':''}">
  ${money(value,cc)}</td>`;
const lbl = (name, bold=false, indent=false) =>
  `<td style="position:sticky;left:0;background:white;z-index:1;border-bottom:1px solid #ececec;
    padding:8px 12px;min-width:240px;white-space:nowrap;font-size:11px;
    ${bold?"font-weight:650;":"color:#666;"}${indent?"padding-left:26px;":""}">${name}</td>`;
const titleFor = (period,view) => view==="year"?"Year "+(period.year+1) :
  view==="quarter"?"Y"+(period.year+1)+" Q"+(period.quarter+1) : "M"+period.startMonth;
export function renderRevenueMatrix(model, currency="EUR", view="quarter") {
  const periods=buildRevenueBridge(model.months,view);
  const row=(name,key,{bold=false,indent=false,negative=false}={}) =>
    `<tr>${lbl(name,bold,indent)}${periods.map(p=>cell((negative?-1:1)*p[key],currency,bold)).join("")}</tr>`;
  const section=name=>`<tr><td colspan="${periods.length+1}" style="background:#f5f7fa;
    padding:8px 12px;font-size:11px;font-weight:650;color:#334155;">${name}</td></tr>`;
  const heading=`<thead><tr><th style="position:sticky;left:0;background:#f5f7fa;z-index:2;
    text-align:left;font-size:11px;min-width:240px;padding:10px 12px;">Measure</th>
    ${periods.map(p=>`<th style="text-align:right;min-width:92px;background:#f5f7fa;
    padding:10px 12px;font-size:11px;">${titleFor(p,view)}</th>`).join("")}</tr></thead>`;
  const rows=[
    section("A · ARR bridge (annualized run rate)"),
    row("Opening ARR","startARR",{bold:true}),
    row("− Churn ARR","churnARR",{indent:true,negative:true}),
    row("+ Expansion ARR","expansionARR",{indent:true}),
    row("+ New ARR · first invoiced","newARR",{indent:true}),
    row("Closing ARR","endARR",{bold:true}),
    section("B · MRR bridge (monthly run rate)"),
    row("New signed & realized MRR","signedMRR",{indent:true}),
    row("Closing MRR","closingMRR",{bold:true}),
    section("C · Recognized revenue (earned IN each displayed period)"),
    row("Original base · pre-churn revenue","originalBaseRevenue"),
    row("− Churn effect · original base","originalChurnRevenueImpact",{indent:true}),
    row("+ Expansion effect · original base","originalExpansionRevenueImpact",{indent:true}),
    row("Net revenue · opening-year base","originalNetRevenue",{bold:true}),
    row("Earlier new cohorts · pre-churn","earlierNewBaseRevenue"),
    row("− Churn effect · earlier cohorts","earlierNewChurnRevenueImpact",{indent:true}),
    row("+ Expansion effect · earlier cohorts","earlierNewExpansionRevenueImpact",{indent:true}),
    row("− Revenue phasing · earlier cohorts","earlierNewRealizationImpact",{indent:true}),
    row("Net revenue · earlier new cohorts","earlierNewNetRevenue",{bold:true}),
    row("Revenue · new customers in their first month","currentNewNetRevenue",{bold:true}),
    row("TOTAL recognized revenue","recognizedRevenue",{bold:true}),
  ];
  return `<div style="overflow:auto;max-width:100%;border:1px solid #e6e6e6;border-radius:8px;">
    <table style="width:100%;border-collapse:collapse;font-size:11px;">${heading}
      <tbody>${rows.join("")}</tbody></table></div>
    <div style="font-size:11px;color:#777;line-height:1.6;margin-top:10px;">
      ARR/MRR are <strong>run rates</strong> (closing value, never summed over months).
      Recognized revenue is <strong>earned during each column's period</strong>.
      "Original base" resets at the start of each plan year. New customers move
      to "Earlier" after their first month. Quarter and year views sum this
      monthly split. New customer phasing applies in the acquisition budget period.
    </div>`;
}
