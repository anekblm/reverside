import { animals, targetDefaults, toEUR, currencyFormats, paybackBenchmarks, cacRatios, growthMultipliers, growthMaxMonths, budgetDefaults, funnels } from "./domain/saas-profiles.js";
import { annualGrossProfitLtv } from "./engine/unit-economics.js";
import { forecastSaaS, buildRevenueBridge } from "./engine/cohort-budget.js";
import { renderCashPanel } from "./features/plan/cash-panel.js";




  // Approximate FX rates to EUR (used only for animal classification)
  function acvToEUR(acv) { return acv * (toEUR[state.currency] || 1.0); }
  function eurToLocal(eur) { return Math.round(eur / (toEUR[state.currency] || 1.0)); }

  let state = { stage: 'early', expectedACV: 10000, currency: 'EUR', productName: '', customers: 50, revenue: 500000, churn: 0.40, grossMargin: 0.80, targetRevenue: 100000, timeframe: 12, newCustomersPercent: 0, animal: null, acv: 0, ltv: 0, maxCAC: 0, totalBudget: 0, newCustomersNeeded: 0 };

  function updateCurrency() {
    state.currency = document.querySelector('input[name="currency"]:checked').value;
    state.targetRevenue = targetDefaults[state.currency];
    document.getElementById('currencySymbol').textContent = state.currency;
    document.getElementById('targetCurrency').textContent = state.currency;
    document.getElementById('targetRevenue').value = state.targetRevenue;
    document.getElementById('targetDisplay').textContent = currencyFormats[state.currency](state.targetRevenue);
  }

  function onStageChange() {
    state.stage = document.querySelector('input[name="companyStage"]:checked').value;
    const pre = state.stage === 'pre';
    document.getElementById('expectedACVGroup').style.display = pre ? 'block' : 'none';
    document.getElementById('stageInputNote').style.display = pre ? 'block' : 'none';
    for (const id of ['customers', 'revenue']) {
      const input = document.getElementById(id);
      if (pre && !input.disabled) input.dataset.previousValue = input.value;
      input.disabled = pre;
      input.value = pre ? '0' : (input.dataset.previousValue ?? input.value);
    }
    document.getElementById('step1Error').style.display = 'none';
  }

  function classifyAnimal() {
    const errorEl = document.getElementById('step1Error');
    const pre = state.stage === 'pre';
    const customers = Number(document.getElementById('customers').value);
    const revenue = Number(document.getElementById('revenue').value);
    const expected = Number(document.getElementById('expectedACV').value);
    const invalid = pre
      ? !(Number.isFinite(expected) && expected > 0)
      : !(Number.isInteger(customers) && customers > 0 && Number.isFinite(revenue) && revenue > 0);
    if (invalid) {
      errorEl.textContent = pre ? 'Enter a positive expected annual contract value.' : 'Enter positive annual revenue and a positive whole number of customers. For zero customers or zero revenue, choose Pre-revenue / pilots.';
      errorEl.style.display = 'block';
      return false;
    }
    errorEl.style.display = 'none';
    state.customers = pre ? 0 : customers;
    state.revenue = pre ? 0 : revenue;
    state.expectedACV = expected;
    state.acv = pre ? expected : revenue / customers;
    // Classify using assumed ACV for pre-revenue startups; otherwise observed ACV.
    const acvEUR = acvToEUR(state.acv);
    let closest = null, minDist = Infinity;
    for (let [name, data] of Object.entries(animals)) {
      const d = Math.abs(Math.log(acvEUR) - Math.log(data.acv));
      if (d < minDist) { minDist = d; closest = name; }
    }
    state.animal = closest;
    return true;
  }

  function goToStep2() {
    state.productName = document.getElementById('productName').value || 'My Product';
    if (!classifyAnimal()) return;
    // Keep the initial target above the company's ARR when moving from Step 1.
    // A user-selected target in Step 2 is not overwritten on subsequent visits.
    const targetField = document.getElementById('targetRevenue');
    if (state.revenue >= targetDefaults[state.currency] && Number(targetField.value) === targetDefaults[state.currency]) {
      const unit = targetDefaults[state.currency];
      state.targetRevenue = Math.ceil((state.revenue * 2) / unit) * unit;
      targetField.value = state.targetRevenue;
    }
    document.getElementById('headerAnimal').textContent = state.productName;
    document.getElementById('headerAnimalEmoji').textContent = animals[state.animal].emoji + ' ' + state.animal;
    updateStep2Display();
    switchStep(2);
  }

  function updateStep2Display() {
    const bench = animals[state.animal];
    const fmt = currencyFormats[state.currency];
    const pre = state.stage === 'pre';
    document.getElementById('preRevenueNotice').style.display = pre ? 'block' : 'none';
    document.getElementById('s2SituationTitle').textContent = pre ? '📊 Pre-revenue scenario assumptions' : '📊 Your Current Situation (from Step 1)';
    document.getElementById('newCustomersPercentSlider').value = pre ? '100' : document.getElementById('newCustomersPercentSlider').value;
    document.getElementById('newCustomersPercentSlider').disabled = pre;
    document.getElementById('s2Animal').textContent = bench.emoji + ' ' + state.animal;
    document.getElementById('s2ACV').textContent = fmt(state.acv);
    document.getElementById('s2Customers').textContent = state.customers.toLocaleString();
    document.getElementById('s2Revenue').textContent = fmt(state.revenue);
    document.getElementById('benchChurn').textContent = Math.round(bench.churn * 100) + '%';
    document.getElementById('benchChurnNum').textContent = Math.round(bench.churn * 100) + '%';

    // Compute benchmark LTV and rec CAC dynamically using animal's benchmark ACV,
    // current gross margin, and payback benchmarks — so they always match Updated Metrics logic
    const paybackBenchmarks = { Mice: 7, Rabbits: 12, Deer: 21, Elephants: 27, Whales: 36 };
    const cacRatios = { Mice: 0.20, Rabbits: 0.25, Deer: 0.30, Elephants: 0.35, Whales: 0.40 };
    const benchPayback = paybackBenchmarks[state.animal] || 12;
    const benchCacRatio = cacRatios[state.animal] || 0.25;
    const grossMarginForBench = state.grossMargin || 0.80;

    const dynamicBenchLTV = Math.round(annualGrossProfitLtv(bench.acv, grossMarginForBench, bench.churn));
    // Use same ratio logic as Updated Metrics for consistency
    const benchMaxCAC = Math.round(dynamicBenchLTV / 3.0);  // LTV:CAC ≥ 3× = absolute limit
    const dynamicBenchRecCAC = Math.round(dynamicBenchLTV / 5.0);  // LTV:CAC ~5× = well-run target
    const benchEffPayback = grossMarginForBench > 0 && bench.acv > 0
      ? Math.round(dynamicBenchRecCAC / ((bench.acv / 12) * grossMarginForBench))
      : 0;

    document.getElementById('benchLTV').textContent = fmt(dynamicBenchLTV);
    document.getElementById('benchCAC').textContent = fmt(dynamicBenchRecCAC);
    const benchCACLabelEl = document.getElementById('benchCACLabel');
    if (benchCACLabelEl) benchCACLabelEl.textContent = '(' + benchEffPayback + '-month payback)';

    const gtmMap = { Mice: ['PLG', 'Product-Led Growth'], Rabbits: ['MLG + Self', 'Marketing-Led Growth + Self-Serve'], Deer: ['MLG + Sales', 'Marketing-Led + Sales-Led Growth'], Elephants: ['SLG', 'Sales-Led Growth'], Whales: ['Founder-Led', 'Founder-Led Sales'] };
    document.getElementById('benchGTM').textContent = gtmMap[state.animal][0];
    document.getElementById('benchGTMFull').textContent = gtmMap[state.animal][1];
    document.getElementById('animalIntroTitle').textContent = bench.emoji + ' About ' + state.animal;
    document.getElementById('animalCharacteristics').textContent = bench.characteristics;
    const gcEl = document.getElementById('animalGrowthChar');
    if (gcEl) gcEl.textContent = bench.growthChar || '';
    document.getElementById('animalExamples').textContent = bench.companies;
    document.getElementById('animalSummary').textContent = bench.summary;
    const gtmExp = { Mice: 'For Mice (PLG): Users discover through organic adoption and viral features. Product is the primary growth lever.', Rabbits: 'For Rabbits (MLG + Self-Serve): Marketing generates inbound leads. Product remains mostly self-serve with optional light sales support.', Deer: 'For Deer (MLG + SLG): Marketing generates qualified leads at scale. Inside sales closes deals through demos and consultative selling.', Elephants: 'For Elephants (SLG): Enterprise sales team with field sales and ABM. Long cycles 1–2 quarters. High touch required.', Whales: 'For Whales (Founder-Led): Founder personally involved in closures. Strategic partnerships and deep relationships. Cycles 6–18 months.' };
    document.getElementById('gtmExplanation').textContent = gtmExp[state.animal] || '';
    document.getElementById('churnSlider').value = Math.round(bench.churn * 100);
    updateClassificationExplanation();
    updateMetrics();
  }

  function updateClassificationExplanation() {
    const a = state.animal;
    const bench = animals[a];
    const fmt = currencyFormats[state.currency];

    // ACV ranges per animal in EUR — convert to local currency for display
    const acvRangesEUR = {
      Mice:      { min: 0,      max: 500    },
      Rabbits:   { min: 500,    max: 5000   },
      Deer:      { min: 5000,   max: 50000  },
      Elephants: { min: 50000,  max: 500000 },
      Whales:    { min: 500000, max: Infinity }
    };

    const r = acvRangesEUR[a];

    // Spectrum bar labels — hardcoded clean numbers per currency
    const specLabelsByCurrency = {
      EUR: { Mice: '< €500',       Rabbits: '€500–€5K',      Deer: '€5K–€50K',       Elephants: '€50K–€500K',      Whales: '> €500K' },
      USD: { Mice: '< $500',       Rabbits: '$500–$5K',       Deer: '$5K–$50K',        Elephants: '$50K–$500K',       Whales: '> $500K' },
      SEK: { Mice: '< 5 000 kr',   Rabbits: '5K–50K kr',      Deer: '50K–500K kr',     Elephants: '500K–5M kr',       Whales: '> 5M kr' }
    };
    const specLabels = specLabelsByCurrency[state.currency] || specLabelsByCurrency.EUR;
    Object.entries(specLabels).forEach(([key, label]) => {
      const el = document.getElementById('spec' + key);
      if (el) el.textContent = label;
    });

    // Use same clean hardcoded ranges as spectrum bar
    const cleanRanges = {
      EUR: { Mice: 'under €500', Rabbits: '€500–€5K', Deer: '€5K–€50K', Elephants: '€50K–€500K', Whales: 'above €500K' },
      USD: { Mice: 'under $500', Rabbits: '$500–$5K',  Deer: '$5K–$50K',  Elephants: '$50K–$500K',  Whales: 'above $500K' },
      SEK: { Mice: 'under 5 000 kr', Rabbits: '5K–50K kr', Deer: '50K–500K kr', Elephants: '500K–5M kr', Whales: 'above 5M kr' }
    };
    const rangeLabel = (cleanRanges[state.currency] || cleanRanges.EUR)[a] || '';

    // Why this animal — ACV explanation
    document.getElementById('classificationACVReason').textContent =
      (state.stage === 'pre' ? 'Your assumed ACV of ' : 'Your ACV of ') + fmt(state.acv) + ' places you in the ' + a + ' range (' + rangeLabel + ' ACV).';

    // Classification logic narrative
    const logicMap = {
      Mice:      'Mice are high-volume, low-price businesses. At this ACV, customers self-serve — they would never sit through a sales call for a product this cheap. Growth comes from product virality, freemium conversion and word-of-mouth. Think Spotify, Duolingo or Dropbox.',
      Rabbits:   'Rabbits are SMB-focused with light sales support. At this ACV, customers need some guidance but mostly buy themselves. A short trial or demo call is enough. Think Notion, Zapier or Calendly — quick decisions, low friction.',
      Deer:      'Deer are mid-market businesses that require inside sales. At this ACV, no one buys without a demo and a proposal. You need a sales team, but deals close in weeks — not quarters. Think HubSpot, Datadog or Asana.',
      Elephants: 'Elephants are enterprise businesses with long, complex sales cycles. At this ACV, procurement teams, legal reviews and executive sign-off are the norm. Field sales reps, RFPs and relationship-building define how you win. Think Workday, ServiceNow or Salesforce Enterprise.',
      Whales:    'Whales are strategic, founder-led deals. At this ACV, you are not selling a product — you are selling a partnership. Deals take 6–18 months, involve the CEO on both sides, and often require custom implementation. Think Palantir or Bloomberg Terminal.'
    };
    document.getElementById('classificationLogic').textContent = logicMap[a];

    // Mismatch detection — based on actual EUR ACV spans, not log-distance hacks
    const warningEl = document.getElementById('classificationWarning');
    const altEl = document.getElementById('classificationAlternative');
    warningEl.style.display = 'none';
    altEl.style.display = 'none';

    // Span boundaries in EUR
    const spanBounds = {
      Mice:      { min: 0,      max: 500    },
      Rabbits:   { min: 500,    max: 5000   },
      Deer:      { min: 5000,   max: 50000  },
      Elephants: { min: 50000,  max: 500000 },
      Whales:    { min: 500000, max: Infinity }
    };
    const prevAnimal = { Rabbits: 'Mice', Deer: 'Rabbits', Elephants: 'Deer', Whales: 'Elephants' };
    const nextAnimal = { Mice: 'Rabbits', Rabbits: 'Deer', Deer: 'Elephants', Elephants: 'Whales' };

    const acvEUR = acvToEUR(state.acv);
    const span = spanBounds[a];
    const spanSize = span.max === Infinity ? span.min : span.max - span.min;

    // Position within span: 0 = bottom, 1 = top
    let positionInSpan = null;
    if (span.max !== Infinity) {
      positionInSpan = (acvEUR - span.min) / (span.max - span.min);
    }

    let warnings = [];
    let altSuggestion = null;

    // Check 1: Position within span — only warn if genuinely close to boundary (top/bottom 15%)
    if (positionInSpan !== null) {
      if (positionInSpan > 0.85 && nextAnimal[a]) {
        altSuggestion = nextAnimal[a];
        const pct = Math.round(positionInSpan * 100);
        warnings.push('Your ACV (' + fmt(state.acv) + ') is in the top ' + (100 - pct) + '% of the ' + a + ' range — close to the ' + nextAnimal[a] + ' boundary. If your deals require a sales team or take more than a few weeks to close, you may already be operating like a ' + nextAnimal[a] + '.');
      } else if (positionInSpan < 0.15 && prevAnimal[a]) {
        altSuggestion = prevAnimal[a];
        const pct = Math.round(positionInSpan * 100);
        warnings.push('Your ACV (' + fmt(state.acv) + ') is in the bottom ' + pct + '% of the ' + a + ' range — close to the ' + prevAnimal[a] + ' boundary. If customers mostly self-serve without a sales call, you may operate more like a ' + prevAnimal[a] + '.');
      }
    }

    // Check 2: Very few customers for this ACV tier
    const expectedMinCustomers = { Mice: 500, Rabbits: 50, Deer: 10, Elephants: 3, Whales: 1 };
    if (state.stage !== 'pre' && state.customers < expectedMinCustomers[a]) {
      warnings.push('You have only ' + state.customers.toLocaleString() + ' customers — unusually few for a ' + a + ' business. ' + a + 's typically need ' + expectedMinCustomers[a] + '+ customers to build a viable recurring revenue base.');
    }

    if (warnings.length > 0) {
      warningEl.style.display = 'block';
      warningEl.innerHTML = warnings.map(w =>
        '<div style="background:#FAEEDA;border-left:3px solid #BA7517;border-radius:0 6px 6px 0;padding:0.75rem 1rem;margin-bottom:0.5rem;font-size:12px;color:#BA7517;line-height:1.6;">⚠️ ' + w + '</div>'
      ).join('');
    }

    if (altSuggestion) {
      const altBench = animals[altSuggestion];
      const altMaxCAC = Math.round((altBench.acv * 0.80 / altBench.churn) / 3);
      const altRecCAC = Math.round((altBench.acv * 0.80 / altBench.churn) / 5);
      altEl.style.display = 'block';
      altEl.innerHTML = '<div style="background:#fafafa;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.75rem 1rem;margin-top:0.5rem;font-size:12px;color:#666;line-height:1.6;">' +
        '<strong style="color:#333;">Could you be a ' + altBench.emoji + ' ' + altSuggestion + '?</strong><br>' +
        'Benchmark churn: ' + Math.round(altBench.churn * 100) + '% · ' +
        'Rec CAC: ~' + fmt(eurToLocal(altRecCAC)) + ' · ' +
        'Max CAC: ~' + fmt(eurToLocal(altMaxCAC)) + '<br>' +
        'If your sales motion, deal cycles and customer profile feel more like a ' + altSuggestion + ', these benchmarks may be more relevant for your planning.' +
        '</div>';
    }
  }

  function updateMetrics() {
    const churnEl = document.getElementById('churnSlider');
    const cogsEl = document.getElementById('cogsSlider');
    const targetEl = document.getElementById('targetRevenue');
    const timeframeEl = document.querySelector('input[name="timeframe"]:checked');
    const newCustEl = document.getElementById('newCustomersPercentSlider');
    if (!churnEl || !cogsEl || !targetEl || !timeframeEl || !newCustEl) return;
    if (!state.animal) return;

    state.churn = parseFloat(churnEl.value) / 100;
    state.grossMargin = parseFloat(cogsEl.value) / 100;
    state.targetRevenue = Math.max(1, Number(targetEl.value) || 0);
    state.timeframe = parseInt(timeframeEl.value) || 12;
    state.newCustomersPercent = state.stage === 'pre' ? 1 : parseFloat(newCustEl.value) / 100;
    const fmt = currencyFormats[state.currency];

    document.getElementById('churnDisplay').textContent = Math.round(state.churn * 100) + '%';
    document.getElementById('cogsDisplay').textContent = 'Gross Margin: ' + Math.round(state.grossMargin * 100) + '%';
    document.getElementById('targetDisplay').textContent = fmt(state.targetRevenue);
    document.getElementById('timeframeDisplay').textContent = state.timeframe + ' months';
    document.getElementById('newCustomersPercentDisplay').textContent = Math.round(state.newCustomersPercent * 100) + '%';

    // Max CAC = LTV / 3  → "what is the absolute limit before destroying value?" (industry standard LTV:CAC ≥ 3×)
    // Rec CAC = LTV / 5  → "what do well-run companies actually spend?" (LTV:CAC ~5× is healthy norm)
    // They can legitimately be equal when LTV is very low — that itself signals economic pressure
    const maxLtvcac = 3.0;  // below this = destroying value
    const recLtvcac = 5.0;  // well-run companies target this
    const cacRatio = 1 / maxLtvcac; // kept for label display

    // Current LTV: based on current ACV × grossMargin / churn
    state.ltv = Math.round(annualGrossProfitLtv(state.acv, state.grossMargin, state.churn));
    state.maxCAC = Math.round(state.ltv / maxLtvcac);

    // newCustomersNeeded for Step 3 budget (conservative: current ACV)
    const customersForTarget = Math.round(state.targetRevenue / state.acv);
    state.newCustomersNeeded = Math.max(0, customersForTarget - state.customers);
    // Use NRR-adjusted count from step 2 if available (respects new customer % split)
    if (state.newCustCount !== undefined) state.newCustomersNeeded = state.newCustCount;

    const years = state.timeframe / 12;
    const totalGrowth = state.targetRevenue - state.revenue;

    // Guard: if target <= current revenue, treat growth as zero
    const revFromNew = totalGrowth > 0 ? totalGrowth * state.newCustomersPercent : 0;
    const revFromExisting = state.targetRevenue - revFromNew;

    // Annualised NRR — guard against NaN from Math.pow with negative/zero inputs
    let nrrPct = 100;
    if (state.revenue > 0 && revFromExisting > 0) {
      nrrPct = Math.pow(revFromExisting / state.revenue, 1 / years) * 100;
    } else if (revFromExisting <= 0) {
      nrrPct = (1 - state.churn) * 100;
    }

    // ── TARGET STATE CALCULATION ──
    // Slider = % of ARR GROWTH from new customers (not % of total ARR)
    // Existing customers always contribute their ARR — it doesn't disappear
    const grr_step2 = Math.max(0.001, 1 - state.churn);
    const newCustFrac = state.newCustomersPercent || 0; // 0-1 decimal

    // Split growth between existing (via NRR/expansion) and new customers
    const growth = Math.max(0, state.targetRevenue - state.revenue);
    const arrGrowthFromNew      = growth * newCustFrac;
    const arrFromExisting       = state.revenue + growth * (1 - newCustFrac); // existing base + their growth

    // Annual NRR needed for existing base to reach arrFromExisting
    let annualNRR = grr_step2; // minimum = GRR (no expansion = flat)
    if (state.revenue > 0) {
      annualNRR = Math.pow(arrFromExisting / state.revenue, 1 / years);
    }

    // ACV growth per year for retained customers = NRR/GRR
    const acvGrowthPerYear = annualNRR / grr_step2;

    // Target ACV = current ACV compounded over full period
    const newACV = Math.round(state.acv * Math.pow(acvGrowthPerYear, years));

    // Surviving existing customers at end of period
    const survivingExisting = Math.round(state.customers * Math.pow(grr_step2, years));

    // New customers sign at CURRENT (entry) ACV
    const newCustCount = arrGrowthFromNew > 0 && state.acv > 0
      ? Math.ceil(arrGrowthFromNew / state.acv)
      : 0;

    // Total customers at target
    const totalCustAtTarget = survivingExisting + newCustCount;
    const newCustPerYear = years > 0 ? Math.ceil(newCustCount / years) : newCustCount;

    const existingSharePct = state.targetRevenue > 0 ? Math.round((revFromExisting / state.targetRevenue) * 100) : 0;
    const newSharePct = 100 - existingSharePct;

    document.getElementById('nrrPercentDisplay').textContent = existingSharePct + '%';
    document.getElementById('nrrValue').textContent = state.stage === 'pre' ? 'N/A' : Math.round(nrrPct) + '%';

    // Expansion needed calculation
    const grr = Math.max(0, 1 - state.churn);
    const impliedExpansionRate = grr > 0 ? Math.max(0, (nrrPct / 100) / grr - 1) : 0;
    const retainedCustCount = Math.round(state.customers * grr);
    const expansionPerCust = Math.max(0, newACV - state.acv);
    const expansionAmountVal = Math.round(retainedCustCount * expansionPerCust);
    const expansionBenchmarks = {
      Mice:      { low: 0.05, high: 0.15, label: '5–15%' },
      Rabbits:   { low: 0.10, high: 0.20, label: '10–20%' },
      Deer:      { low: 0.15, high: 0.30, label: '15–30%' },
      Elephants: { low: 0.20, high: 0.40, label: '20–40%' },
      Whales:    { low: 0.25, high: 0.50, label: '25–50%' }
    };
    const eb = expansionBenchmarks[state.animal] || expansionBenchmarks.Deer;
    const expansionRatePct = Math.round(impliedExpansionRate * 100);
    const grrPct = Math.round(grr * 100);
    let expansionBenchText = '';
    let expansionRateColor = '#555';
    if (impliedExpansionRate > eb.high * 1.5) {
      expansionRateColor = '#E24B4A';
      expansionBenchText = `⚠️ ${expansionRatePct}% is well above ${state.animal} benchmark (${eb.label}). Very difficult to sustain.`;
    } else if (impliedExpansionRate > eb.high) {
      expansionRateColor = '#BA7517';
      expansionBenchText = `⚠️ ${expansionRatePct}% is above ${state.animal} benchmark (${eb.label}). Requires strong upsell motion.`;
    } else if (impliedExpansionRate >= eb.low) {
      expansionRateColor = '#3B6D11';
      expansionBenchText = `✓ ${expansionRatePct}% is within ${state.animal} benchmark (${eb.label}). Realistic with active upsell.`;
    } else {
      expansionRateColor = '#999';
      expansionBenchText = `${expansionRatePct}% — low expansion assumption (benchmark: ${eb.label}).`;
    }
    const grEl = document.getElementById('expansionGRR');
    const erEl = document.getElementById('expansionRate');
    const eaEl = document.getElementById('expansionAmount');
    const ebEl2 = document.getElementById('expansionBenchmark');
    if (grEl) grEl.textContent = grrPct + '%';
    if (erEl) { erEl.textContent = expansionRatePct + '%'; erEl.style.color = expansionRateColor; }
    if (eaEl) eaEl.textContent = fmt(expansionAmountVal);
    if (ebEl2) { ebEl2.innerHTML = expansionBenchText; ebEl2.style.color = expansionRateColor; }
    document.getElementById('nrrAmount').textContent = fmt(revFromExisting);
    document.getElementById('newCustomersPercentDisplay2').textContent = newSharePct + '%';
    document.getElementById('newCustomersPerYearValue').textContent = newCustPerYear.toLocaleString();
    document.getElementById('newCustomersAmount').textContent = fmt(revFromNew);

    // New LTV: based on newACV (NRR-adjusted) × grossMargin / churn
    const newLTV = Math.round(annualGrossProfitLtv(newACV, state.grossMargin, state.churn));
    const newMaxCAC = Math.round(newLTV * cacRatio);

    // Helper: format a change value with sign and %
    const fmtChange = (current, next) => {
      const diff = next - current;
      const pct = current > 0 ? ((diff / current) * 100).toFixed(0) : 0;
      const sign = diff >= 0 ? '+' : '';
      return sign + fmt(diff) + ' (' + sign + pct + '%)';
    };

    // ACV row
    document.getElementById('metricsCurrentACV').textContent = fmt(state.acv);
    document.getElementById('metricsACVChange').textContent = fmtChange(state.acv, newACV);
    document.getElementById('metricsNewACV').textContent = fmt(newACV);

    // LTV row
    document.getElementById('metricsCurrentLTV').textContent = fmt(state.ltv);
    document.getElementById('metricsLTVChange').textContent = fmtChange(state.ltv, newLTV);
    document.getElementById('metricsNewLTV').textContent = fmt(newLTV);

    // Max CAC row
    document.getElementById('metricsCurrentCAC').textContent = fmt(state.maxCAC);
    document.getElementById('metricsCACChange').textContent = fmtChange(state.maxCAC, newMaxCAC);
    document.getElementById('metricsNewCAC').textContent = fmt(newMaxCAC);
    document.getElementById('cacRatioLabel').textContent = 'LTV:CAC ≥ 3× limit';

    // Recommended CAC = LTV / 5 (well-run companies target LTV:CAC ~5×)
    const paybackBenchmarks = { Mice: 7, Rabbits: 12, Deer: 21, Elephants: 27, Whales: 36 };
    const currentRecCAC = Math.round(state.ltv / recLtvcac);
    const newRecCAC     = Math.round(newLTV / recLtvcac);

    // Back-calculate effective payback for display
    const monthlyGPCurrent = (state.acv / 12) * state.grossMargin;
    const benchPayback = monthlyGPCurrent > 0 ? Math.round(currentRecCAC / monthlyGPCurrent) : 0;
    const paybackWasCapped = false;

    document.getElementById('metricsCurrentRecCAC').textContent = fmt(currentRecCAC);
    document.getElementById('metricsRecCACChange').textContent  = fmtChange(currentRecCAC, newRecCAC);
    document.getElementById('metricsNewRecCAC').textContent     = fmt(newRecCAC);
    document.getElementById('cacPaybackLabel').textContent = benchPayback + '-month payback (LTV:CAC 5×)';

    // Unit economics feedback — shown whenever churn caps the payback or metrics look off
    const cacWarningEl = document.getElementById('cacEconomicsWarning');
    if (cacWarningEl) {
      const benchPaybackIdeal = paybackBenchmarks[state.animal] || 12;
      const churnPct = Math.round(state.churn * 100);
      const animalBenchChurn = Math.round((animals[state.animal]?.churn || 0.12) * 100);

      let msgs = [];

      if (paybackWasCapped) {
        msgs.push(`⚠️ <strong>High churn is limiting your CAC budget.</strong> Your churn (${churnPct}%) is well above the ${state.animal} benchmark (${animalBenchChurn}%). 
          Recommended payback has been capped at ${benchPayback} months (vs ideal ${benchPaybackIdeal} months) to keep Rec CAC within Max CAC. 
          Reducing churn from ${churnPct}% to ${animalBenchChurn}% would increase your Rec CAC by ~${fmt(Math.round((state.acv/12 * state.grossMargin * benchPaybackIdeal) - currentRecCAC))}.`);
      }

      if (state.churn > 0.30 && state.animal !== 'Mice') {
        msgs.push(`⚠️ <strong>Churn of ${churnPct}% is unusually high for ${state.animal}.</strong> At this rate, the average customer stays only ${(1/state.churn).toFixed(1)} years. 
          Focus on retention before scaling acquisition — every lost customer increases the new customers needed to hit your target.`);
      }

      if (state.grossMargin < 0.60) {
        msgs.push(`⚠️ <strong>Gross margin of ${Math.round(state.grossMargin*100)}% is below SaaS norms.</strong> Low margin compresses LTV and shrinks the budget you can justify spending on acquisition. 
          SaaS benchmark is 70–80%. Consider infrastructure optimisation or pricing adjustments.`);
      }

      if (currentRecCAC > state.maxCAC * 0.9) {
        msgs.push(`⚠️ <strong>Rec CAC is close to Max CAC</strong> — there is little room between your recommended spend and the absolute ceiling. 
          Any inefficiency in acquisition will push you into loss-making territory per customer.`);
      }

      // Positive signals
      if (!paybackWasCapped && state.churn <= animalBenchChurn/100 && state.grossMargin >= 0.70) {
        msgs.push(`✓ <strong>Unit economics look healthy.</strong> Churn and margin are within ${state.animal} benchmarks, giving you a realistic CAC budget to work with.`);
      }

      if (msgs.length > 0) {
        cacWarningEl.style.display = 'block';
        cacWarningEl.innerHTML = msgs.map(m => {
          const isPositive = m.startsWith('✓');
          return `<div style="background:${isPositive?'#EAF3DE':'#FAEEDA'};border-left:3px solid ${isPositive?'#3B6D11':'#BA7517'};border-radius:0 6px 6px 0;padding:0.6rem 0.75rem;font-size:11px;color:${isPositive?'#3B6D11':'#BA7517'};line-height:1.6;margin-top:0.5rem;">${m}</div>`;
        }).join('');
      } else {
        cacWarningEl.style.display = 'none';
      }
    }

    // Customers row — TARGET STATE = total at target, CHANGE = new customers needed
    document.getElementById('metricsCurrentCustomers').textContent = state.customers.toLocaleString();
    document.getElementById('metricsNewCustomersNeeded').textContent = newCustCount > 0 ? '+' + newCustCount.toLocaleString() : '0';
    document.getElementById('metricsCustomersTarget').textContent = totalCustAtTarget.toLocaleString();

    // Store for Step 3
    state.newACV = newACV;
    state.newMaxCAC = newMaxCAC;
    state.newRecCAC = newRecCAC;
    state.benchPayback = benchPayback;
    state.newCustCount = newCustCount;  // new customers needed (= target total - surviving existing)

    const animalData = animals[state.animal];

    // Per-animal NRR benchmarks (annualised, based on industry data)
    const nrrBenchmarks = {
      Mice:      { low: 80,  mid: 90,  high: 100, top: 110 },
      Rabbits:   { low: 90,  mid: 100, high: 110, top: 120 },
      Deer:      { low: 100, mid: 110, high: 120, top: 130 },
      Elephants: { low: 105, mid: 115, high: 125, top: 135 },
      Whales:    { low: 110, mid: 120, high: 135, top: 150 }
    };

    // Per-animal typical new customer growth mix (% of total ARR growth)
    // i.e. how much of growth typically comes from NEW customers vs expansion
    const newCustMix = {
      Mice:      { low: 0.60, mid: 0.75, high: 0.90 },  // PLG = mostly new volume
      Rabbits:   { low: 0.45, mid: 0.60, high: 0.75 },  // balanced, marketing-driven
      Deer:      { low: 0.35, mid: 0.50, high: 0.65 },  // inside sales + expansion
      Elephants: { low: 0.20, mid: 0.35, high: 0.50 },  // expansion-heavy, few new logos
      Whales:    { low: 0.05, mid: 0.15, high: 0.25 }   // almost all expansion/upsell
    };

    const nb = nrrBenchmarks[state.animal];
    const nm = newCustMix[state.animal];
    const nrrRound = Math.round(nrrPct);
    const newPct = state.newCustomersPercent;

    // Timeframe context
    let timeframeComment = '';
    if (state.timeframe === 6) {
      timeframeComment = '6 months is very aggressive. NRR-driven growth is nearly impossible this fast — almost all growth must come from new customers or a major price increase.';
    } else if (state.timeframe === 12) {
      timeframeComment = '12 months is the standard planning horizon. Both NRR expansion and new customer acquisition contribute meaningfully.';
    } else if (state.timeframe === 24) {
      timeframeComment = '24 months gives room for compounding NRR. Existing customers can carry a larger share of growth, reducing pressure on new acquisition.';
    } else if (state.timeframe === 36) {
      timeframeComment = '36 months strongly favours NRR compounding. High-NRR businesses (Deer, Elephants, Whales) can reach targets mostly through expansion at this horizon.';
    } else if (state.timeframe === 48) {
      timeframeComment = '48 months (4 years) is a long-range strategic plan. Compounding NRR effects become significant — even moderate expansion rates drive meaningful ARR growth on the existing base.';
    } else if (state.timeframe === 60) {
      timeframeComment = '60 months (5 years) is a full strategic horizon, used for investor decks and exit planning. NRR compounding dominates — existing customers become the primary growth engine at this scale.';
    }

    // NRR assessment vs animal benchmark
    let nrrAssessment = '';
    let nrrOk = true;
    if (nrrRound >= nb.top) {
      nrrAssessment = '⚠️ Your implied NRR of <strong>' + nrrRound + '%</strong> is in top-decile territory for ' + state.animal + 's (benchmark: ' + nb.mid + '–' + nb.high + '%). Only companies like Snowflake or Twilio have sustained this. Assume this is optimistic unless you have strong evidence.';
      nrrOk = false;
    } else if (nrrRound >= nb.high) {
      nrrAssessment = '✓ Your implied NRR of <strong>' + nrrRound + '%</strong> is strong for ' + state.animal + 's (benchmark: ' + nb.mid + '–' + nb.high + '%). Achievable with good expansion pricing and low churn — but requires active upsell motions.';
    } else if (nrrRound >= nb.mid) {
      nrrAssessment = '✓ Your implied NRR of <strong>' + nrrRound + '%</strong> is right on benchmark for ' + state.animal + 's (' + nb.mid + '–' + nb.high + '%). This is realistic and well-validated by the market.';
    } else if (nrrRound >= nb.low) {
      nrrAssessment = '⚠️ Your implied NRR of <strong>' + nrrRound + '%</strong> is below the typical ' + state.animal + ' benchmark (' + nb.mid + '–' + nb.high + '%). You\'ll need to compensate with more new customer acquisition, or work on reducing churn and adding upsell.';
      nrrOk = false;
    } else {
      nrrAssessment = '⚠️ Your implied NRR of <strong>' + nrrRound + '%</strong> is well below benchmark for ' + state.animal + 's (' + nb.mid + '–' + nb.high + '%). At this level, churn is eroding your base faster than you can grow it — this target is very difficult to reach without fixing retention first.';
      nrrOk = false;
    }

    // Growth mix assessment vs animal benchmark
    let mixAssessment = '';
    let mixOk = true;
    const newPctRound = Math.round(newPct * 100);
    const midMixPct = Math.round(nm.mid * 100);
    const lowMixPct = Math.round(nm.low * 100);
    const highMixPct = Math.round(nm.high * 100);

    if (newPct < nm.low * 0.6) {
      mixAssessment = '⚠️ Only <strong>' + newPctRound + '%</strong> of growth from new customers is very low even for ' + state.animal + 's (typical: ' + lowMixPct + '–' + highMixPct + '%). You\'re relying almost entirely on expansion — this only works if you have a very mature, sticky customer base with clear upsell paths.';
      mixOk = false;
    } else if (newPct < nm.low) {
      mixAssessment = '⚠️ <strong>' + newPctRound + '%</strong> from new customers is on the low end for ' + state.animal + 's (typical: ' + lowMixPct + '–' + highMixPct + '%). Expansion-led is fine at longer timeframes, but watch that your base is large enough to carry the growth.';
    } else if (newPct <= nm.high) {
      mixAssessment = '✓ <strong>' + newPctRound + '%</strong> from new customers is well within the typical range for ' + state.animal + 's (' + lowMixPct + '–' + highMixPct + '%). This is a healthy, validated mix for your category.';
    } else if (newPct <= nm.high * 1.2) {
      mixAssessment = '⚠️ <strong>' + newPctRound + '%</strong> from new customers is above typical for ' + state.animal + 's (' + lowMixPct + '–' + highMixPct + '%). Acquisition-heavy strategies are more volatile — ensure your CAC and sales capacity can support this.';
      mixOk = false;
    } else {
      mixAssessment = '⚠️ <strong>' + newPctRound + '%</strong> from new customers is very high for ' + state.animal + 's (' + lowMixPct + '–' + highMixPct + '%). This puts extreme pressure on sales and marketing. Reconsider your mix or extend the timeframe.';
      mixOk = false;
    }

    // No historic retention or existing base means expansion/NRR cannot be measured.
    if (state.stage === 'pre') {
      nrrAssessment = 'Not applicable: there are no existing customers. Churn and expansion are hypothetical assumptions for future cohorts.';
      mixAssessment = 'All ARR must come from new customers. Customer acquisition targets are modelled using your expected contract value.';
    }
    // Overall verdict
    const overallOk = nrrOk && mixOk;
    const overallText = state.stage === 'pre'
      ? 'Pre-revenue planning scenario: these numbers are hypotheses to validate through pilots and initial signed contracts.'
      : overallOk
      ? '✓ <strong style="color:#3B6D11;">Your strategy is realistic for a ' + state.animal + ' over ' + state.timeframe + ' months.</strong> Both NRR and growth mix are within benchmarks. Proceed to Step 3 to plan your budget.'
      : '⚠️ <strong style="color:#BA7517;">One or more inputs are outside typical ' + state.animal + ' benchmarks.</strong> Review the points above before moving to Step 3 — adjusting your timeframe, churn rate or growth mix slider will often bring this into a realistic range.';

    document.getElementById('hybridRealism').innerHTML =
      '<strong style="font-size:13px;color:#333;">Timeframe:</strong> ' + timeframeComment +
      '<br><br><strong style="font-size:13px;color:#333;">NRR (existing customer growth):</strong> ' + nrrAssessment +
      '<br><br><strong style="font-size:13px;color:#333;">Growth mix (new vs existing):</strong> ' + mixAssessment +
      '<br><br><strong style="font-size:13px;color:#333;">Overall:</strong> ' + overallText;

    document.getElementById('animalBenchNRR').textContent = state.animal;
    document.getElementById('benchmarkNRR').textContent = animalData.nrrBench;
    document.getElementById('animalBenchNew').textContent = state.animal;
    document.getElementById('benchmarkNewCustomers').textContent = animalData.newCustBench;

    // Step 3 uses newMaxCAC (NRR-adjusted) if available, else falls back to maxCAC
    const budgetCAC = state.newMaxCAC || state.maxCAC;
    // For aggressive growth, total budget is sum of per-year (ramping) budgets
    if (selectedStrategy === 'growth' && years > 1) {
      let allocSoFar = 0;
      state.totalBudget = 0;
      for (let y = 0; y < years; y++) {
        const pct = yearSplit[y] || 0;
        const c = y === years - 1
          ? Math.max(0, state.newCustomersNeeded - allocSoFar)
          : Math.round(state.newCustomersNeeded * pct / 100);
        allocSoFar += c;
        state.totalBudget += c * getCACForYear(y, years);
      }
    } else {
      state.totalBudget = state.newCustomersNeeded * budgetCAC;
    }
    document.getElementById('s3NewCustomers').textContent = state.newCustomersNeeded.toLocaleString();
    document.getElementById('s3MaxCAC').textContent = fmt(budgetCAC);
    document.getElementById('s3TotalBudget').textContent = fmt(state.totalBudget);
  }

  function toggleCollapsible(el) {
    if (!el || !el.nextElementSibling) return;
    const content = el.nextElementSibling;
    const arrow = el.querySelector('.collapsible-arrow');
    content.classList.toggle('open');
    if (arrow) arrow.style.transform = content.classList.contains('open') ? 'rotate(180deg)' : 'rotate(0deg)';
  }

  // ── STEP 3 STATE ──────────────────────────────────────────────
  let yearSplit = [];
  let yearAllocs = {};
  let quarterSMShares = {}; // % of S&M cash out assigned to each quarter (independent of signing)
  let plChurn = null;     // P&L churn override (null = use state.churn)
  let plExpansion = null; // P&L expansion rate (null = same as churn → NRR 100%)
  let plUseExpACV = false; // Use expanded ACV for new customer count calculation
  let plQtrScenario = 'EVEN'; // Quarter signing distribution scenario
  let plQuarterPhasing = null; // null = implied phase in the selected budget period
  let plBudgetGranularity = 'quarter';
  let plPeriodOverride = null; // explicit New Contracted ARR per budget period
  let plPeriodInputsOpen = false;
  let selectedStrategy = null; // 'efficient' | 'growth' | 'custom'
  let customCAC = 0;



  // Conversion funnel benchmarks per animal

  function goToStep3() {
    selectedStrategy = null;
    yearAllocs = {};
    quarterSMShares = {};
    plPeriodOverride = null;
    plPeriodInputsOpen = false;
    plQuarterPhasing = null;
    document.getElementById('budgetSummarySection').style.display = 'none';
    populateStrategyCards();
    initPLSliders();
    // Init yearSplit with linear distribution so S&M is spread evenly from the start
    const years = Math.max(1, Math.round(state.timeframe / 12));
    yearSplit = [];
    const base = Math.floor(100 / years);
    for (let y = 0; y < years; y++) {
      yearSplit.push(base + (y === years-1 ? 100 - base*years : 0));
    }
    switchStep(3);
    // Render P&L immediately without waiting for strategy selection
    const fmt = currencyFormats[state.currency];
    buildPL(years, 0, fmt);
    if (window._latestMonthlyPlan) renderPlanToolbar(window._latestMonthlyPlan);
  }

  function populateStrategyCards() {
    if (!state.animal) return;
    const fmt = currencyFormats[state.currency];
    const benchPayback = paybackBenchmarks[state.animal];
    const recCAC = state.newRecCAC || 0;
    const maxCAC = state.newMaxCAC || state.maxCAC || 0;
    const growthCACraw = Math.round(recCAC * (growthMultipliers[state.animal] || 2.0));
    const maxCAC_ = state.newMaxCAC || state.maxCAC || 0;
    const growthCAC = Math.min(growthCACraw, maxCAC_); // never exceed Max CAC
    const maxGrowthMonths = growthMaxMonths[state.animal];

    document.getElementById('stratEffCAC').textContent = fmt(recCAC);
    document.getElementById('stratEffPayback').textContent = benchPayback + '-month payback';
    document.getElementById('stratGrowCAC').textContent = fmt(growthCAC);
    document.getElementById('stratGrowNote').textContent = 'Max ' + maxGrowthMonths + ' months at this level';
    document.getElementById('customCACInput').value = '';
    document.getElementById('customCACInput').placeholder = fmt(recCAC);

    // Reset card styles
    ['efficient','growth','custom'].forEach(s => {
      const el = document.getElementById('strat-' + s);
      if (el) { el.style.border = '1.5px solid #e0e0e0'; el.style.background = 'white'; }
    });
  }

  function selectStrategy(strategy) {
    selectedStrategy = strategy;
    const fmt = currencyFormats[state.currency];
    const recCAC = state.newRecCAC || 0;
    const growthCACraw_ = Math.round(recCAC * (growthMultipliers[state.animal] || 2.0));
    const growthCAC = Math.min(growthCACraw_, state.newMaxCAC || state.maxCAC || growthCACraw_);

    // Highlight selected card
    ['efficient','growth','custom'].forEach(s => {
      const el = document.getElementById('strat-' + s);
      if (!el) return;
      if (s === strategy) {
        el.style.border = '1.5px solid #378ADD';
        el.style.background = '#E6F1FB';
      } else {
        el.style.border = '1.5px solid #e0e0e0';
        el.style.background = 'white';
      }
    });

    if (strategy === 'custom') {
      customCAC = parseInt(document.getElementById('customCACInput').value) || recCAC;
    }

    // Timeframe warning
    const years = Math.max(1, Math.round(state.timeframe / 12));
    const minMonths = growthMaxMonths[state.animal] || 18;
    const warningEl = document.getElementById('strategyWarning');

    if (strategy === 'growth' && state.timeframe < minMonths + 12) {
      warningEl.style.display = 'block';
      warningEl.innerHTML = `<div style="background:#FAEEDA;border-left:3px solid #BA7517;border-radius:0 6px 6px 0;padding:0.75rem 1rem;font-size:12px;color:#BA7517;line-height:1.6;">
        ⚠️ <strong>Timeframe may be too short for aggressive growth.</strong> This strategy requires up to ${minMonths} months at elevated CAC plus time to normalize — ideally ${minMonths + 12}+ months total. Your current timeframe is ${state.timeframe} months. You can proceed, but plan for extended runway.
      </div>`;
    } else if (strategy === 'custom') {
      const cac = customCAC;
      const maxCAC = state.newMaxCAC || state.maxCAC;
      if (cac > maxCAC) {
        warningEl.style.display = 'block';
        warningEl.innerHTML = `<div style="background:#FCEBEB;border-left:3px solid #E24B4A;border-radius:0 6px 6px 0;padding:0.75rem 1rem;font-size:12px;color:#A32D2D;line-height:1.6;">
          ⚠️ <strong>Custom CAC exceeds the absolute maximum (${fmt(maxCAC)}).</strong> At this level, LTV economics break down — you will never recover the acquisition cost from this customer.
        </div>`;
      } else if (cac > growthCAC) {
        warningEl.style.display = 'block';
        warningEl.innerHTML = `<div style="background:#FAEEDA;border-left:3px solid #BA7517;border-radius:0 6px 6px 0;padding:0.75rem 1rem;font-size:12px;color:#BA7517;line-height:1.6;">
          ⚠️ <strong>Custom CAC is above the growth ceiling (${fmt(growthCAC)}).</strong> This is only justifiable with very strong NRR (130%+) or multi-year contracts.
        </div>`;
      } else {
        warningEl.style.display = 'none';
      }
    } else {
      warningEl.style.display = 'none';
    }

    initYearSplit();
    updateStep3Display();
    document.getElementById('budgetSummarySection').style.display = 'block';
  }

  function onCustomCACChange(val) {
    customCAC = parseInt(val) || 0;
    if (selectedStrategy === 'custom') selectStrategy('custom');
  }

  function getActiveCACForStrategy() {
    const recCAC  = state.newRecCAC || 0;
    const maxCAC_ = state.newMaxCAC || state.maxCAC || 0;
    const growthCACraw = Math.round(recCAC * (growthMultipliers[state.animal] || 2.0));
    const growthCAC = Math.min(growthCACraw, maxCAC_); // capped at Max CAC
    if (selectedStrategy === 'efficient') return recCAC;
    if (selectedStrategy === 'growth')   return growthCAC;
    if (selectedStrategy === 'custom')   return customCAC || recCAC;
    return recCAC;
  }

  // For aggressive growth, return year-specific CAC ramping down from Max CAC → Rec CAC
  function getCACForYear(y, years) {
    if (selectedStrategy !== 'growth' || years <= 1) return getActiveCACForStrategy();
    const recCAC  = state.newRecCAC || 0;
    const maxCAC_ = state.newMaxCAC || state.maxCAC || 0;
    const growthCACraw = Math.round(recCAC * (growthMultipliers[state.animal] || 2.0));
    const growthCAC = Math.min(growthCACraw, maxCAC_);
    // Linear ramp: Year 1 = growthCAC, Last year = recCAC
    const t = years > 1 ? y / (years - 1) : 0;
    return Math.round(growthCAC + (recCAC - growthCAC) * t);
  }

  function initYearSplit() {
    const years = Math.max(1, Math.round(state.timeframe / 12));
    yearSplit = [];

    if (selectedStrategy === 'growth' && years > 1) {
      // Front-loaded: aggressive spend early, normalize later
      const frontWeights = {
        1: [100],
        2: [60, 40],
        3: [45, 35, 20],
        4: [35, 30, 20, 15],
        5: [30, 25, 20, 15, 10]
      };
      const weights = frontWeights[years] || Array(years).fill(Math.floor(100/years));
      // Normalize to exactly 100
      const sum = weights.reduce((a,b) => a+b, 0);
      let splits = weights.map(w => Math.round(w * 100 / sum));
      // Fix rounding to exactly 100
      const diff = 100 - splits.reduce((a,b) => a+b, 0);
      splits[splits.length - 1] += diff;
      yearSplit = splits;
    } else {
      // Linear default for efficient and custom
      const base = Math.floor(100 / years);
      const rem = 100 - base * years;
      for (let i = 0; i < years; i++) {
        yearSplit.push(base + (i === years - 1 ? rem : 0));
      }
    }
  }

  function updateStep3Display() {
    // P&L always renders. Strategy-dependent sections check selectedStrategy themselves.
    const fmt = currencyFormats[state.currency];
    const years = Math.max(1, Math.round(state.timeframe / 12));
    // Always render P&L first (sets state.newCustomersNeeded dynamically)
    const fmt_ = currencyFormats[state.currency];
    const years_ = Math.max(1, Math.round(state.timeframe / 12));
    buildPL(years_, 0, fmt_);  // budgetCAC=0 for PL-only pass, strategy sections below

    if (!selectedStrategy) return;

    const budgetCAC = getActiveCACForStrategy();
    // For aggressive growth, total budget is sum of per-year (ramping) budgets
    if (selectedStrategy === 'growth' && years > 1) {
      let allocSoFar = 0;
      state.totalBudget = 0;
      for (let y = 0; y < years; y++) {
        const pct = yearSplit[y] || 0;
        const c = y === years - 1
          ? Math.max(0, state.newCustomersNeeded - allocSoFar)
          : Math.round(state.newCustomersNeeded * pct / 100);
        allocSoFar += c;
        state.totalBudget += c * getCACForYear(y, years);
      }
    } else {
      state.totalBudget = state.newCustomersNeeded * budgetCAC;
    }
    const monthlyGP = (state.acv / 12) * state.grossMargin;
    // For efficient/growth strategies, use the known benchmark payback directly.
    // For custom, calculate actual payback from the entered CAC.
    const benchPayback_ = paybackBenchmarks[state.animal] || 12;
    const growthPayback_ = Math.round(benchPayback_ * (growthMultipliers[state.animal] || 2.0));
    let paybackMonths;
    if (selectedStrategy === 'efficient') {
      paybackMonths = benchPayback_;
    } else if (selectedStrategy === 'growth') {
      paybackMonths = growthPayback_;
    } else {
      paybackMonths = monthlyGP > 0 ? Math.round(budgetCAC / monthlyGP) : 0;
    }

    // Use the same spending totals as the monthly cash and P&L model.
    if (window._latestMonthlyPlan) state.totalBudget = window._latestMonthlyPlan.summary.totalSM;

    // Labels
    const stratLabels = { efficient: 'Efficient growth', growth: 'Aggressive growth', custom: 'Custom' };
    document.getElementById('s3StrategyLabel').textContent = stratLabels[selectedStrategy] || '-';
    document.getElementById('s3MaxCAC').textContent = fmt(budgetCAC);
    document.getElementById('s3NewCustomers').textContent = state.newCustomersNeeded.toLocaleString();
    document.getElementById('s3TotalBudget').textContent = fmt(state.totalBudget);
    document.getElementById('s3TimeframeLabel').textContent = state.timeframe + ' months';
    const paybackLabel = selectedStrategy === 'efficient'
      ? 'CAC payback: ' + paybackMonths + ' months — on benchmark for ' + state.animal + '.'
      : selectedStrategy === 'growth'
        ? 'CAC payback: ' + paybackMonths + ' months — above benchmark (' + benchPayback_ + ' months). Plan to normalize within ' + (growthMaxMonths[state.animal] || 18) + ' months.'
        : 'CAC payback: ' + paybackMonths + ' months (benchmark for ' + state.animal + ': ' + benchPayback_ + ' months)' + (paybackMonths > benchPayback_ ? ' — above benchmark.' : ' — within benchmark.');
    document.getElementById('s3Payback').textContent = paybackLabel;

    // Re-render P&L with actual budgetCAC (S&M spend from annual plan)
    buildPL(years, budgetCAC, fmt);
    buildAnnualTable(years, budgetCAC, fmt);
    buildWaterfall(years, fmt);
    generateRecommendations();
  }

  function buildAnnualTable(years, budgetCAC, fmt) {
    const defs = budgetDefaults[state.animal] || budgetDefaults.Deer;
    const el = document.getElementById('annualPlanTable');
    const colW = Math.floor(70 / years);
    const labelW = 30;

    const cols = [];
    let totCust = 0, totBudget = 0;
    let allocatedCustSoFar = 0;
    for (let y = 0; y < years; y++) {
      const pct = yearSplit[y] || 0;
      const cust = window._latestMonthlyPlan?.annualCustomers?.[y] ?? (y === years - 1
        ? Math.max(0, state.newCustomersNeeded - allocatedCustSoFar)
        : Math.round(state.newCustomersNeeded * pct / 100));
      allocatedCustSoFar += cust;
      const yearCAC    = getCACForYear(y, years);                  // strategy-aware, ramps for aggressive
      const maxBudget  = cust * (state.newMaxCAC || state.maxCAC); // absolute ceiling from Step 2
      const allocBudget = cust * yearCAC;                          // actual budget for this year
      const budget = maxBudget; // used for "Max budget" row display
      const alloc = yearAllocs[y] || { sales: defs.sales, salesact: defs.salesact, mkt: defs.mkt };
      const salesAmt = Math.round(allocBudget * alloc.sales / 100);
      const actAmt   = Math.round(allocBudget * alloc.salesact / 100);
      const mktAmt   = Math.round(allocBudget * alloc.mkt / 100);
      const unalloc  = allocBudget - salesAmt - actAmt - mktAmt;
      const fullSalary = state.currency === 'SEK' ? 1500000 : 150000;
      let salesperText = '';
      if (state.animal === 'Mice') { salesperText = 'No sales (PLG)'; }
      else if (salesAmt <= 0) { salesperText = 'No budget'; }
      else if (salesAmt < fullSalary * 0.3) { salesperText = 'Part-time (~' + fmt(salesAmt) + ')'; }
      else if (salesAmt < fullSalary * 0.8) { salesperText = Math.round(salesAmt / fullSalary * 100) + '% of 1 AE'; }
      else { salesperText = Math.floor(salesAmt / fullSalary) + ' AE(s)'; }
      totCust += cust;
      totBudget += maxBudget;
      const totAllocBudget = (typeof totAllocBudget_ !== 'undefined' ? totAllocBudget_ : 0);
      cols.push({ y, pct, cust, budget: maxBudget, allocBudget, salesAmt, actAmt, mktAmt, unalloc, salesperText, alloc });
    }

    const totalShare = yearSplit.reduce((a,b) => a+b, 0);
    const shareOk = totalShare === 100;

    let html = `<div style="display:grid;grid-template-columns:${labelW}% ${Array(years).fill(colW+'%').join(' ')} ${labelW-(years*colW-(100-labelW)>0?0:0)}%;gap:6px;min-width:400px;">`;

    // Headers
    html += `<div></div>`;
    for (let y = 0; y < years; y++) html += `<div style="font-size:11px;font-weight:500;color:#333;text-align:center;padding:0.35rem;background:#f0f0f0;border-radius:6px;">Year ${y+1}</div>`;
    html += `<div style="font-size:11px;font-weight:500;color:#333;text-align:center;padding:0.35rem;background:#f0f0f0;border-radius:6px;">Total</div>`;

    // Customers row
    html += `<div style="font-size:11px;color:#666;font-weight:500;display:flex;align-items:center;">New customers</div>`;
    for (let y = 0; y < years; y++) html += `<div style="background:#fafafa;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.45rem;text-align:center;font-size:12px;font-weight:500;color:#333;">${cols[y].cust.toLocaleString()}</div>`;
    const shareColor = shareOk ? '#333' : '#E24B4A';
    html += `<div style="background:#fafafa;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.45rem;text-align:center;font-size:12px;font-weight:600;color:#333;">${totCust.toLocaleString()} <div style="font-size:10px;color:${shareColor};">${totalShare}% of ${state.newCustomersNeeded}${shareOk?'':' ⚠'}</div></div>`;

    // Share row
    html += `<div style="font-size:11px;color:#666;font-weight:500;display:flex;align-items:center;">Share %</div>`;
    for (let y = 0; y < years; y++) {
      html += `<div style="background:#E6F1FB;border:0.5px solid #b5d4f4;border-radius:6px;padding:0.35rem 0.45rem;text-align:center;">
        <input type="number" min="0" max="100" value="${cols[y].pct}" style="width:2.5rem;border:none;background:transparent;font-size:12px;font-weight:500;color:#185FA5;text-align:center;outline:none;" oninput="onSplitChange(${y},this.value)"><span style="font-size:11px;color:#185FA5;">%</span>
      </div>`;
    }
    html += `<div style="background:#fafafa;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.45rem;text-align:center;font-size:12px;font-weight:600;color:${shareColor};">${totalShare}%${shareOk?'':' ⚠'}</div>`;

    // Budget row — shows Max CAC × customers (ceiling from Step 2)
    html += `<div style="font-size:11px;color:#666;font-weight:500;display:flex;align-items:center;">Max budget <span style="font-size:9px;color:#bbb;margin-left:4px;">(max CAC)</span></div>`;
    for (let y = 0; y < years; y++) html += `<div style="background:white;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.45rem;text-align:center;font-size:12px;font-weight:500;color:#333;">${fmt(cols[y].budget)}</div>`;
    html += `<div style="background:white;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.45rem;text-align:center;font-size:12px;font-weight:600;color:#333;">${fmt(totBudget)}</div>`;

    // Divider
    html += `<div style="grid-column:1/-1;border-top:0.5px solid #e0e0e0;margin:2px 0;"></div>`;

    // Allocation rows: toggle (per row) + number input + lock (per cell)
    const allocRows = [
      { key: 'salesAmt',  allocKey: 'sales',    label: 'Personnel costs',                desc: 'AE, SDR, SE + recruiting' },
      { key: 'actAmt',    allocKey: 'salesact',  label: 'Sales & acquisition activities', desc: 'Travel, demos, PoC, tools' },
      { key: 'mktAmt',    allocKey: 'mkt',       label: 'Marketing & demand gen',         desc: 'Ads, content, SEO, automation' }
    ];

    for (const row of allocRows) {
      const isActive = !yearAllocs['disabled_' + row.allocKey];
      html += `<div style="font-size:11px;color:${isActive?'#333':'#bbb'};font-weight:500;display:flex;flex-direction:column;justify-content:center;gap:2px;">
        <div style="display:flex;align-items:center;gap:5px;">
          <input type="checkbox" ${isActive?'checked':''} onchange="toggleAllocRow('${row.allocKey}', this.checked)" style="cursor:pointer;">
          <span>${row.label}</span>
        </div>
        <span style="font-size:9px;color:#bbb;font-weight:400;padding-left:18px;">${row.desc}</span>
      </div>`;

      for (let y = 0; y < years; y++) {
        const allocPct = isActive ? (cols[y].alloc[row.allocKey] || 0) : 0;
        const cellKey = row.allocKey + '_' + y;
        const isLocked = !!yearAllocs['lock_' + cellKey];
        html += `<div style="background:${isActive?'#fafafa':'#f5f5f5'};border:0.5px solid #e0e0e0;border-radius:6px;padding:0.45rem;text-align:center;opacity:${isActive?1:0.4};">
          <div style="font-size:11px;font-weight:500;color:#555;margin-bottom:3px;">${isActive ? fmt(cols[y][row.key]) : '—'}</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:4px;">
            <input type="number" min="0" max="100" value="${allocPct}" ${isActive?'':'disabled'}
              style="width:3rem;padding:2px 4px;border:0.5px solid ${isLocked?'#378ADD':'#ddd'};border-radius:4px;font-size:12px;font-weight:500;color:${isLocked?'#185FA5':'#555'};text-align:center;background:${isLocked?'#E6F1FB':'white'};"
              oninput="onAllocInput(${y}, '${row.allocKey}', this.value)">
            <span style="font-size:11px;color:#999;">%</span>
            <button onclick="toggleLock('${cellKey}')" title="${isLocked?'Unlock year':'Lock year'}"
              style="width:22px;height:22px;border:1.5px solid ${isLocked?'#378ADD':'#ddd'};border-radius:4px;background:${isLocked?'#378ADD':'white'};color:${isLocked?'white':'#bbb'};font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;font-weight:500;">
              ${isLocked?'🔒':'○'}
            </button>
          </div>
        </div>`;
      }

      const total = isActive ? cols.reduce((s,c) => s + c[row.key], 0) : 0;
      html += `<div style="background:#fafafa;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.45rem;text-align:center;font-size:11px;font-weight:500;color:${isActive?'#555':'#bbb'};">${isActive ? fmt(total) : '—'}</div>`;
    }

    // Total budgeted cost row — shows actual allocated amount, diff vs original budget
    html += `<div style="grid-column:1/-1;border-top:0.5px solid #e0e0e0;margin:2px 0;"></div>`;
    html += `<div style="font-size:11px;color:#333;font-weight:600;display:flex;flex-direction:column;justify-content:center;gap:2px;"><span>S&M spend</span><span style="font-size:9px;color:#999;font-weight:400;">= P&L row below</span></div>`;
    let grandTotal = 0;
    let grandOriginal = 0;
    for (let y = 0; y < years; y++) {
      const allKeys = ['sales','salesact','mkt'];
      const colAllocBudget = cols[y].allocBudget; // original budget for this year
      const colTotal = allKeys.reduce((s,k) => {
        if (yearAllocs['disabled_' + k]) return s;
        return s + Math.round(colAllocBudget * (cols[y].alloc[k]||0) / 100);
      }, 0);
      grandTotal += colTotal;       // actual allocated
      grandOriginal += colAllocBudget; // original budget
      const diff = colTotal - colAllocBudget; // positive = over, negative = under
      const isOver  = diff > 1;
      const isUnder = diff < -1;
      const diffText = isOver
        ? `<div style="font-size:9px;color:#E24B4A;">(${fmt(diff)} over)</div>`
        : isUnder
          ? `<div style="font-size:9px;color:#BA7517;">(${fmt(Math.abs(diff))} left)</div>`
          : '';
      const borderStyle = isOver ? 'border:1.5px solid #E24B4A;' : 'border:0.5px solid #e0e0e0;';
      html += `<div style="background:white;${borderStyle}border-radius:6px;padding:0.45rem;text-align:center;">
        <div style="font-size:12px;font-weight:600;color:${isOver?'#E24B4A':'#333'};">${fmt(colTotal)}</div>
        ${diffText}
      </div>`;
    }
    const grandDiff = grandTotal - grandOriginal;
    const grandOver  = grandDiff > 1;
    const grandUnder = grandDiff < -1;
    const grandDiffText = grandOver
      ? `<div style="font-size:9px;color:#E24B4A;">(${fmt(grandDiff)} over)</div>`
      : grandUnder
        ? `<div style="font-size:9px;color:#BA7517;">(${fmt(Math.abs(grandDiff))} left)</div>`
        : '';
    html += `<div style="background:white;border:${grandOver?'1.5px solid #E24B4A':'0.5px solid #e0e0e0'};border-radius:6px;padding:0.45rem;text-align:center;">
      <div style="font-size:12px;font-weight:700;color:${grandOver?'#E24B4A':'#185FA5'};">${fmt(grandTotal)}</div>
      ${grandDiffText}
    </div>`;

    // Soft status per year — never blocking
    let statusHtml = '';
    for (let y = 0; y < years; y++) {
      const allKeys = ['sales','salesact','mkt'];
      const activeKeys = allKeys.filter(k => !yearAllocs['disabled_' + k]);
      const total = activeKeys.reduce((s,k) => s + (cols[y].alloc[k]||0), 0);
      const diff = 100 - total;
      if (Math.abs(diff) > 1) {
        statusHtml += `<span style="margin-right:12px;">Year ${y+1}: <strong style="color:${diff>0?'#BA7517':'#E24B4A'};">${diff>0?diff+'% unallocated':Math.abs(diff)+'% over'}</strong></span>`;
      }
    }
    const warnEl = document.getElementById('allocationWarning');
    if (warnEl) {
      warnEl.style.display = statusHtml ? 'block' : 'none';
      warnEl.innerHTML = statusHtml ? `<div style="font-size:11px;color:#666;padding:0.4rem 0;">${statusHtml}</div>` : '';
    }

    // Divider
    html += `<div style="grid-column:1/-1;border-top:0.5px solid #e0e0e0;margin:2px 0;"></div>`;

    // Sales capacity
    html += `<div style="font-size:11px;color:#666;font-weight:500;display:flex;align-items:center;">Sales capacity</div>`;
    for (let y = 0; y < years; y++) {
      const t = cols[y].salesperText;
      const c = t.includes('Part-time') ? '#BA7517' : t.includes('No') ? '#999' : '#333';
      html += `<div style="background:white;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.45rem;text-align:center;font-size:10px;font-weight:500;color:${c};">${t}</div>`;
    }
    html += `<div></div>`;

    html += '</div>';
    el.innerHTML = html;
  }

  // Initialize P&L sliders from state when entering step 3
  function initPLSliders() {
    const churnPct = Math.round((state.churn || 0.25) * 100);

    // Derive default expansion from Step 2's share of revenue from new customers
    // Back-calculate: existing base × NRR^years must reach (1 - newCustPct%) of target
    // So NRR = (target × existingShare / revenue)^(1/years)
    // expansion = NRR - GRR
    // state.newCustomersPercent is stored as 0-1 decimal
    const newCustFrac = (state.newCustomersPercent !== undefined) ? state.newCustomersPercent : 0.5;
    const churn_ = state.churn || 0.25;
    const grr_ = Math.max(0.001, 1 - churn_);
    const years_ = Math.max(1, Math.round(state.timeframe / 12));

    let expPct;
    if (newCustFrac >= 1.0) {
      // 100% new customers → expansion just compensates churn (NRR = 100%)
      expPct = churnPct;
    } else if (newCustFrac <= 0) {
      // 0% new customers → back-calculate expansion needed to hit target
      const nrrNeeded = state.revenue > 0
        ? Math.pow(state.targetRevenue / state.revenue, 1 / years_)
        : 1;
      expPct = Math.min(80, Math.round(Math.max(0, nrrNeeded - grr_) * 100));
    } else {
      // Mixed — existing must cover (1 - newCustFrac) of target
      const existingShare = 1 - newCustFrac;
      const targetFromExisting = state.targetRevenue * existingShare;
      const nrrNeeded = state.revenue > 0
        ? Math.pow(targetFromExisting / state.revenue, 1 / years_)
        : 1;
      expPct = Math.min(80, Math.round(Math.max(0, nrrNeeded - grr_) * 100));
    }

    const slC = document.getElementById('plChurnSlider');
    const slE = document.getElementById('plExpansionSlider');
    if (slC) slC.value = churnPct;
    if (slE) slE.value = expPct;
    plChurn = churn_;
    plExpansion = expPct / 100;
    updatePLSliderDisplay();
  }

  function onPLCheckbox() {
    const cb = document.getElementById('plUseExpACVCheck');
    plUseExpACV = cb ? cb.checked : false;
    updateStep3Display();
  }

  function onQuarterPhasingChange(value) {
    if (plBudgetGranularity==='month' ||
        !(window._latestMonthlyPlan?.summary?.annualizedNewARR>1e-8)) return;
    const fraction = Number(value);
    const width=plBudgetGranularity==='year'?12:3;
    const minimum=100/((state.timeframe%width)||width);
    if (!Number.isFinite(fraction) || fraction < minimum-1e-7 || fraction > 100) return;
    plQuarterPhasing = fraction;
    const output = document.getElementById('plQuarterPhasingDisplay');
    if (output) output.textContent = fraction.toFixed(1) + '%';
    updateStep3Display();
  }

  function onPLSlider() {
    const slC = document.getElementById('plChurnSlider');
    const slE = document.getElementById('plExpansionSlider');
    plChurn    = (parseInt(slC.value) || 0) / 100;
    plExpansion = (parseInt(slE.value) || 0) / 100;
    updatePLSliderDisplay();
    updateStep3Display();
  }

  function updatePLSliderDisplay() {
    const cd = document.getElementById('plChurnDisplay');
    const ed = document.getElementById('plExpansionDisplay');
    const nd = document.getElementById('plNRROutcome');
    const nn = document.getElementById('plNRRNote');
    const rn = document.getElementById('plRampNote');
    if (!cd) return;
    const churnPct = Math.round((plChurn || 0) * 100);
    const expPct   = Math.round((plExpansion || 0) * 100);
    const nrr      = Math.round((1 - (plChurn||0) + (plExpansion||0)) * 100);
    cd.textContent = churnPct + '%';
    ed.textContent = expPct + '%';
    if (nd) {
      nd.textContent = nrr + '%';
      nd.style.color = nrr > 100 ? '#3B6D11' : nrr === 100 ? '#555' : '#E24B4A';
    }
    if (nn) {
      nn.textContent = nrr > 100 ? '— existing base grows' : nrr === 100 ? '— existing base flat (default)' : '— existing base shrinks';
    }
    if (rn) rn.textContent = 'New MRR starts in the first invoice month';

    // Expansion rate per retained customer note under NRR
    const expNoteEl = document.getElementById('plExpansionRateNote');
    if (expNoteEl) {
      const churn_ = plChurn || 0;
      const exp_   = plExpansion || 0;
      const grr_   = Math.max(0.001, 1 - churn_);
      const expPerRetained = Math.round((exp_ / grr_) * 100);

      if (exp_ === 0) {
        expNoteEl.style.display = 'none';
      } else if (expPerRetained > 100) {
        expNoteEl.style.display = 'block';
        expNoteEl.style.color = '#E24B4A';
        expNoteEl.innerHTML = `⚠ Requires ${expPerRetained}% expansion per retained customer — very difficult to sustain. Consider reducing churn or accepting more new customer acquisition.`;
      } else if (expPerRetained > 40) {
        expNoteEl.style.display = 'block';
        expNoteEl.style.color = '#BA7517';
        expNoteEl.innerHTML = `Requires ${expPerRetained}% expansion per retained customer — aggressive but possible with a strong upsell motion.`;
      } else {
        expNoteEl.style.display = 'block';
        expNoteEl.style.color = '#999';
        expNoteEl.innerHTML = `Requires ${expPerRetained}% expansion per retained customer.`;
      }
    }
  }

  function resetPL() {
    plQuarterPhasing = null;
    const slider = document.getElementById('plQuarterPhasingSlider');
    if (slider) slider.value = '66.7';
    initPLSliders();
    updateStep3Display();
  }

  function resetAllocations() {
    // Clear all manual overrides — locks, disabled rows, custom allocations, ramp
    const keys = Object.keys(yearAllocs);
    keys.forEach(k => delete yearAllocs[k]);
    // Reset year split to strategy default
    initYearSplit();
    updateStep3Display();
  }

  function onSplitChange(yearIdx, val) {
    yearSplit[yearIdx] = parseInt(val) || 0;
    updateStep3Display();
  }

  function updateYearAlloc(yearIdx, category, val) {
    const defs = budgetDefaults[state.animal] || budgetDefaults.Deer;
    if (!yearAllocs[yearIdx]) yearAllocs[yearIdx] = { sales: defs.sales, salesact: defs.salesact, mkt: defs.mkt };
    yearAllocs[yearIdx][category] = parseInt(val) || 0;
    updateStep3Display();
  }

  // Toggle a cost row on/off — redistribute proportionally when disabled
  function toggleAllocRow(allocKey, isChecked) {
    const years = Math.max(1, Math.round(state.timeframe / 12));
    const defs = budgetDefaults[state.animal] || budgetDefaults.Deer;
    const allKeys = ['sales', 'salesact', 'mkt'];

    if (!isChecked) {
      // Disable: mark as disabled, set to 0, redistribute its % to unlocked active rows
      yearAllocs['disabled_' + allocKey] = true;
      for (let y = 0; y < years; y++) {
        if (!yearAllocs[y]) yearAllocs[y] = { sales: defs.sales, salesact: defs.salesact, mkt: defs.mkt };
        const freed = yearAllocs[y][allocKey] || 0;
        yearAllocs[y][allocKey] = 0;
        // Find other active, unlocked keys to redistribute to
        const targets = allKeys.filter(k => k !== allocKey && !yearAllocs['disabled_' + k] && !yearAllocs['lock_' + k]);
        if (targets.length > 0) {
          const share = Math.floor(freed / targets.length);
          const rem = freed - share * targets.length;
          targets.forEach((k, i) => { yearAllocs[y][k] = (yearAllocs[y][k] || 0) + share + (i === 0 ? rem : 0); });
        }
      }
    } else {
      // Re-enable: restore to default, rebalance others
      delete yearAllocs['disabled_' + allocKey];
      for (let y = 0; y < years; y++) {
        if (!yearAllocs[y]) yearAllocs[y] = { sales: defs.sales, salesact: defs.salesact, mkt: defs.mkt };
        const restore = defs[allocKey];
        yearAllocs[y][allocKey] = restore;
        // Reduce from unlocked active rows proportionally
        const targets = allKeys.filter(k => k !== allocKey && !yearAllocs['disabled_' + k] && !yearAllocs['lock_' + k]);
        const totalOthers = targets.reduce((s,k) => s + (yearAllocs[y][k] || 0), 0);
        if (totalOthers > 0) {
          targets.forEach(k => {
            yearAllocs[y][k] = Math.max(0, Math.round((yearAllocs[y][k] || 0) * (100 - restore) / totalOthers));
          });
        }
      }
    }
    updateStep3Display();
  }

  // When user types a % — auto-adjust unlocked active cells in same year
  function onAllocInput(yearIdx, allocKey, val) {
    const defs = budgetDefaults[state.animal] || budgetDefaults.Deer;
    if (!yearAllocs[yearIdx]) yearAllocs[yearIdx] = { sales: defs.sales, salesact: defs.salesact, mkt: defs.mkt };
    const newVal = Math.max(0, Math.min(100, parseInt(val) || 0));
    yearAllocs[yearIdx][allocKey] = newVal;

    const allKeys = ['sales', 'salesact', 'mkt'];
    // Adjustable = active + unlocked in THIS year (per-cell lock)
    const adjustable = allKeys.filter(k =>
      k !== allocKey &&
      !yearAllocs['disabled_' + k] &&
      !yearAllocs['lock_' + k + '_' + yearIdx]
    );
    const lockedKeys = allKeys.filter(k =>
      k !== allocKey &&
      !yearAllocs['disabled_' + k] &&
      yearAllocs['lock_' + k + '_' + yearIdx]
    );

    const lockedTotal = lockedKeys.reduce((s,k) => s + (yearAllocs[yearIdx][k] || 0), 0);
    const remaining = Math.max(0, 100 - newVal - lockedTotal);

    if (adjustable.length > 0) {
      const totalAdj = adjustable.reduce((s,k) => s + (yearAllocs[yearIdx][k] || 0), 0);
      if (totalAdj > 0) {
        adjustable.forEach(k => {
          yearAllocs[yearIdx][k] = Math.round((yearAllocs[yearIdx][k] || 0) / totalAdj * remaining);
        });
      } else {
        const share = Math.floor(remaining / adjustable.length);
        adjustable.forEach((k,i) => {
          yearAllocs[yearIdx][k] = share + (i === 0 ? remaining - share * adjustable.length : 0);
        });
      }
      // Fix rounding drift
      const total = allKeys.filter(k => !yearAllocs['disabled_'+k]).reduce((s,k) => s + (yearAllocs[yearIdx][k]||0), 0);
      const drift = 100 - total;
      if (drift !== 0 && adjustable.length > 0) yearAllocs[yearIdx][adjustable[0]] += drift;
    }
    updateStep3Display();
  }

  // Lock/unlock a specific cell (allocKey + year)
  function toggleLock(cellKey) {
    if (yearAllocs['lock_' + cellKey]) {
      delete yearAllocs['lock_' + cellKey];
    } else {
      yearAllocs['lock_' + cellKey] = true;
    }
    updateStep3Display();
  }

  function buildWaterfall(years, fmt) {
    const funnel = funnels[state.animal];
    const steps = funnel.steps;

    document.getElementById('waterfallTitle').textContent = 'Conversion Waterfall — ' + funnel.type;
    document.getElementById('waterfallDesc').textContent = funnel.desc;

    // Pre-calculate bottom_up counts per year
    const yearCounts = [];
    for (let y = 0; y < years; y++) {
      const pct = yearSplit[y] || 0;
      let allocatedWF = 0;
      for (let yy = 0; yy < y; yy++) allocatedWF += Math.round(state.newCustomersNeeded * (yearSplit[yy]||0) / 100);
      const custThisYear = y === years - 1
        ? Math.max(0, state.newCustomersNeeded - allocatedWF)
        : Math.round(state.newCustomersNeeded * pct / 100);
      let current = Math.max(1, custThisYear);
      const bu = [];
      for (let i = steps.length - 1; i >= 0; i--) {
        bu.unshift(Math.ceil(current));
        if (steps[i].rate) current = current / steps[i].rate;
      }
      yearCounts.push(bu);
    }

    // Same grid proportions as annual plan table
    const colW = Math.floor(70 / years);
    const labelW = 30;

    const hcLabelW = 140;
    const hcColW = 90;
    let html = `<div style="display:grid;grid-template-columns:${hcLabelW}px ${Array(years).fill(hcColW+'px').join(' ')} ${hcColW}px;gap:6px;">`;

    // Year headers
    html += `<div></div>`;
    for (let y = 0; y < years; y++) {
      const cust = Math.round(state.newCustomersNeeded * (yearSplit[y]||0) / 100);
      html += `<div style="font-size:11px;font-weight:500;color:#333;text-align:center;padding:0.35rem;background:#f0f0f0;border-radius:6px;">Year ${y+1}<div style="font-size:9px;font-weight:400;color:#666;">${cust.toLocaleString()} new</div></div>`;
    }

    // One row per funnel step
    for (let i = 0; i < steps.length; i++) {
      const isLast = i === steps.length - 1;
      const nextRate = steps[i+1] ? steps[i+1].rate * 100 : null;

      // Label column
      html += `<div style="display:flex;flex-direction:column;justify-content:center;gap:1px;">
        <div style="font-size:11px;color:#333;font-weight:${isLast?'600':'400'};">${steps[i].label}</div>
        <div style="font-size:9px;color:#bbb;">${steps[i].note}</div>
        ${nextRate ? `<div style="font-size:9px;color:#b5d4f4;margin-top:1px;">${nextRate.toFixed(0)}% →</div>` : ''}
      </div>`;

      // Scale bars against global max (top of funnel, year 1) so volume differences are visible
      const globalMax = yearCounts[0][0] || 1;

      for (let y = 0; y < years; y++) {
        const count = yearCounts[y][i] || 0;
        const barPct = Math.max(6, Math.round((count / globalMax) * 100));
        html += `<div style="background:#fafafa;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.4rem 0.5rem;">
          <div style="background:#f0f0f0;border-radius:3px;height:20px;margin-bottom:3px;">
            <div style="width:${barPct}%;background:${isLast?'#378ADD':'#b5d4f4'};border-radius:3px;height:100%;display:flex;align-items:center;padding-left:5px;min-width:28px;">
              <span style="font-size:10px;font-weight:500;color:${isLast?'white':'#185FA5'};white-space:nowrap;">${count.toLocaleString()}</span>
            </div>
          </div>
        </div>`;
      }
    }

    html += '</div>';
    document.getElementById('waterfallContent').innerHTML = html;
  }

  // Revenue timing lives in engine/monthly-plan.js (no second phasing model).
  function setQtrScenario(s) {
    if (plBudgetGranularity==='month' || plPeriodOverride!==null) return;
    if (!['EVEN','FRONT','BACK'].includes(s)) return;
    plQtrScenario = s;
    const select = document.getElementById('signingPattern');
    if (select) select.value = s;
    updateStep3Display();
  }


  function onPlanBudgetGranularityChange(value) {
    if (!['year','quarter','month'].includes(value) || plBudgetGranularity===value) return;
    plBudgetGranularity=value;
    plQuarterPhasing=null;
    plPeriodOverride=null; // Never reinterpret an amount set for a different period length.
    if(value==='month') plQtrScenario='EVEN';
    updateStep3Display();
  }

  function togglePlanPeriodInputs() {
    plPeriodInputsOpen=!plPeriodInputsOpen;
    if(window._latestMonthlyPlan) renderPlanToolbar(window._latestMonthlyPlan);
  }

  function onPlanPeriodValueChange(index,raw) {
    if(raw.trim()==='') return;
    const value=Number(raw);
    const model=window._latestMonthlyPlan;
    if(!Number.isFinite(value)||value<0||!model) return;
    const width=plBudgetGranularity==='year'?12:plBudgetGranularity==='quarter'?3:1;
    const count=Math.ceil(state.timeframe/width);
    if(!Number.isInteger(index)||index<0||index>=count) return;
    if(!plPeriodOverride) {
      plPeriodOverride=Array.from({length:count},(_,p)=>
        model.months.slice(p*width,Math.min(state.timeframe,(p+1)*width))
          .reduce((total,m)=>total+m.newARR,0));
    }
    plPeriodOverride[index]=value;
    updateStep3Display();
  }

  function resetPlanPeriodInputs() {
    plPeriodOverride=null;
    updateStep3Display();
  }

  function renderPlanToolbar(model) {
    const select=document.getElementById('planBudgetGranularity');
    if(select) select.value=plBudgetGranularity;
    const presetsEnabled=plBudgetGranularity!=='month' && plPeriodOverride===null;
    for(const pattern of ['EVEN','FRONT','BACK']) {
      const btn=document.getElementById('planPattern'+pattern);
      if(!btn) continue;
      btn.disabled=!presetsEnabled;
      btn.classList?.toggle?.('active',presetsEnabled&&pattern===plQtrScenario);
      if(btn.setAttribute) btn.setAttribute('aria-pressed',String(presetsEnabled&&pattern===plQtrScenario));
    }
    const oldSelect=document.getElementById('signingPattern');
    if(oldSelect) {oldSelect.value=plQtrScenario;oldSelect.disabled=!presetsEnabled;}
    const width=plBudgetGranularity==='year'?12:plBudgetGranularity==='quarter'?3:1;
    const remaining=state.timeframe%width;
    const min=100/(remaining||width);
    const hasNewCARR=model.summary.annualizedNewARR>1e-8;
    const phaseActive=plBudgetGranularity!=='month' && hasNewCARR;
    const slider=document.getElementById('plQuarterPhasingSlider');
    const card=document.getElementById('plQuarterPhasingCard');
    const title=document.getElementById('plQuarterPhasingLabel');
    const note=document.getElementById('plQuarterPhasingNote');
    const output=document.getElementById('plQuarterPhasingDisplay');
    if(card) card.style.opacity=phaseActive?'1':'0.55';
    if(title) title.textContent=phaseActive
      ? 'Revenue phasing · '+(plBudgetGranularity==='year'?'yearly':'quarterly')
      : 'Revenue phasing · monthly';
    if(note) note.textContent=phaseActive
      ? 'When new subscriptions first invoice within the '+(plBudgetGranularity==='year'?'year':'quarter')
      : plBudgetGranularity==='month'
        ? 'Monthly budget: full MRR from first invoice month'
        : 'No New CARR required: phasing cannot affect this forecast';
    if(slider){
      slider.disabled=!phaseActive;
      slider.min=String(min);
      slider.max='100';
      slider.value=String(plQuarterPhasing??model.periodPhasing[0]??100);
    }
    if(output) output.textContent=phaseActive
      ?(plQuarterPhasing??model.periodPhasing[0]).toFixed(1)+'%'
      : plBudgetGranularity==='month'?'100%':'—';
    const minimumLabel=document.getElementById('plPhasingMinLabel');
    if(minimumLabel) minimumLabel.textContent=phaseActive
      ? min.toFixed(1)+'% · last month' : 'Not applicable';
    const maximumLabel=document.getElementById('plPhasingMaxLabel');
    if(maximumLabel) maximumLabel.textContent=phaseActive
      ? '100% · first month' : hasNewCARR?'First invoice = full MRR':'No new customers';
    const modeNote=document.getElementById('planBudgetGranularityNote');
    if(modeNote) {
      const churn=plChurn??state.churn??0.25;
      const expansion=plExpansion??churn;
      const grr=Math.pow(1-churn,width/12);
      const nrr=Math.pow(1-churn+expansion,width/12);
      const fmtPct=v=>new Intl.NumberFormat('sv-SE',{maximumFractionDigits:2}).format(v*100)+'%';
      const scope=plBudgetGranularity==='year'?'year':'quarter';
      const period=plBudgetGranularity==='month'?'month':scope;
      modeNote.textContent=
        'Budget: '+(plBudgetGranularity==='year'?'YEAR':plBudgetGranularity==='quarter'?'QUARTER':'MONTH')+
        '. Churn '+fmtPct(churn)+' annually → '+fmtPct(1-grr)+
        ' of opening CARR per '+period+'. Expansion '+fmtPct(expansion)+
        ' annually → '+fmtPct(nrr-grr)+' of opening CARR per '+period+
        '. Each is calculated ONCE per budget period and then allocated evenly to its months.'+
        ' Changing expanded columns never recalculates retention. '+
        (!hasNewCARR?'No New CARR is required by this ARR target; revenue phasing is inactive. ': '')+
        (plBudgetGranularity==='year'&&plQuarterPhasing!==null&&hasNewCARR
          ? 'Annual revenue phasing can change the FRONT/EVEN/BACK quarter template. ':'')+
        (plPeriodOverride
          ? 'Custom New CARR overrides the target; closing CARR is an output.'
          : 'Closing CARR target sets the required New CARR.');
    }
    const editor=document.getElementById('planPeriodEditor');
    if(editor) editor.style.display=plPeriodInputsOpen?'block':'none';
    const editBtn=document.getElementById('planPeriodEditButton');
    if(editBtn){
      editBtn.textContent=plPeriodInputsOpen?'Hide period New ARR ▴':'Edit period New ARR ▾';
      if(editBtn.setAttribute) editBtn.setAttribute('aria-expanded',String(plPeriodInputsOpen));
    }
    const editorStatus=document.getElementById('planPeriodEditorStatus');
    if(editorStatus) editorStatus.textContent=plPeriodOverride
      ? 'Closing CARR: '+Math.round(model.summary.endingARR).toLocaleString('sv-SE')+
        '; original target: '+Math.round(state.targetRevenue).toLocaleString('sv-SE')+'.'
      : 'Automatically calculated against the closing CARR target.';
    const grid=document.getElementById('planPeriodInputGrid');
    if(grid&&plPeriodInputsOpen){
      const count=Math.ceil(state.timeframe/width);
      const amounts=plPeriodOverride??Array.from({length:count},(_,p)=>
        model.months.slice(p*width,Math.min(state.timeframe,(p+1)*width))
          .reduce((total,m)=>total+m.newARR,0));
      grid.innerHTML=amounts.map((value,p)=>{
        const name=plBudgetGranularity==='year'?'Y'+(p+1)
          :plBudgetGranularity==='quarter'?'Y'+(Math.floor(p/4)+1)+' Q'+(p%4+1)
          :'Y'+(Math.floor(p/12)+1)+' M'+(p%12+1);
        return '<label>'+name+'<input type="number" min="0" step="any" value="'+
          Number(value.toFixed(2))+'" onchange="onPlanPeriodValueChange('+p+',this.value)" '+
          'aria-label="New Contracted ARR '+name+'"></label>';
      }).join('');
    }
  }

  function quarterSharesForYear(year) {
    const active = Math.ceil(Math.min(12, state.timeframe - year * 12) / 3);
    if (!quarterSMShares[year] || quarterSMShares[year].length !== active) {
      const base = Math.floor(100 / active);
      quarterSMShares[year] = Array.from({ length: active }, (_, q) =>
        base + (q === active - 1 ? 100 - active * base : 0));
    }
    return quarterSMShares[year];
  }

  function updateCashAssumptions() { updateStep3Display(); }

  function updateQuarterSM(year, quarter, value) {
    quarterSharesForYear(year)[quarter] = Number(value);
    const shares = quarterSharesForYear(year);
    const total = shares.reduce((a, b) => a + b, 0);
    const warning = document.getElementById('cashQuarterWarning');
    const valid = shares.every(n => Number.isFinite(n) && n >= 0) && Math.abs(total - 100) < 0.000001;
    if (warning) {
      warning.style.display = valid ? 'none' : 'block';
      warning.textContent = valid ? '' : 'Year ' + (year+1) + ': quarterly S&M shares must total 100% (currently ' + total + '%). Adjust another quarter to continue.';
    }
    if (valid) updateStep3Display();
  }

  function renderMonthlyCashControls(model, fmt) {
    const control = document.getElementById('quarterSMControls');
    const cashPanel = document.getElementById('cashFlowPanel');
    if (!control || !cashPanel) return;
    const select = document.getElementById('signingPattern');
    if (select) select.value = plQtrScenario;
    control.innerHTML = model.years.map((year, y) => {
      const shares = quarterSharesForYear(y);
      return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0;">'
        + '<strong style="font-size:11px;">Year ' + (y + 1) + ' · S&M ' + fmt(model.annualSM[y]) + '</strong>'
        + shares.map((pct, q) => '<label style="font-size:11px;">Q' + (q+1)
          + ' <input type="number" min="0" max="100" step="1" value="' + pct
          + '" onchange="updateQuarterSM(' + y + ',' + q + ',this.value)" style="width:58px;padding:5px;border:1px solid #ddd;border-radius:5px;">%</label>').join('')
        + '</div>';
    }).join('');
    cashPanel.innerHTML = renderCashPanel(model, fmt);
  }

  function buildPL(years, budgetCAC, fmt) {
    const el = document.getElementById('plTable');
    if (!el) return;

    const acv         = state.acv || 0;
    const grossMargin = state.grossMargin ?? 0.80;
    const churnRate   = plChurn !== null ? plChurn : (state.churn ?? 0.25);
    const expRate     = plExpansion !== null ? plExpansion : churnRate; // default NRR=100%
    const nrr         = 1 - churnRate + expRate; // resulting NRR

    // One authoritative monthly model for ARR, recognized revenue and cash.
    // Quarterly S&M cash timing is independent of quarterly signing timing.
    const grr = Math.max(0.001, 1 - churnRate);
    const acvGrowthFactor = nrr / grr;
    const yearACVentry = [acv], yearACVexpanded = [];
    for (let y = 0; y < years; y++) {
      const expanded = yearACVentry[y] * acvGrowthFactor;
      yearACVexpanded.push(expanded);
      yearACVentry.push(expanded);
    }
    const defs = budgetDefaults[state.animal] || budgetDefaults.Deer;
    const smBudgetPercentByYear = Array.from({ length: years }, (_, y) => {
      const alloc = yearAllocs[y] || defs;
      return ['sales', 'salesact', 'mkt'].reduce((total, key) =>
        total + (yearAllocs['disabled_' + key] ? 0 : (alloc[key] || 0)), 0);
    });
    const model = forecastSaaS({
      months: state.timeframe,
      openingARR: state.revenue, openingCustomers: state.customers,
      acv, targetARR: state.targetRevenue, granularity: plBudgetGranularity,
      phasePercent: plBudgetGranularity==='month'?null:plQuarterPhasing,
      newARRByPeriod: plPeriodOverride,
      annualChurn: churnRate, annualExpansionComp: expRate, grossMargin,
      yearShares: yearSplit, signingPattern: plQtrScenario,
      priceNewOnExpansion: plUseExpACV,
      cacByYear: Array.from({ length: years }, (_, y) => selectedStrategy ? getCACForYear(y, years) : 0),
      smBudgetPercentByYear,
      quarterSMSharesByYear: Array.from({ length: years }, (_, y) => quarterSharesForYear(y)),
      openingCash: Number(document.getElementById('cashOpening')?.value || 0),
      otherOpexMonthly: Number(document.getElementById('cashOtherOpex')?.value || 0),
      collectionLagMonths: Number(document.getElementById('cashCollectionLag')?.value || 0),
    });
    window._latestMonthlyPlan = model;
    const phaseOutput = document.getElementById('plQuarterPhasingDisplay');
    if (phaseOutput) phaseOutput.textContent = (plQuarterPhasing ?? model.periodPhasing[0]).toFixed(1) + '%';
    const newCustPerYear = model.annualCustomers;
    state.newCustomersNeeded = model.summary.newCustomersNeeded;
    let cumulativeResult = 0, breakEvenYear = null;
    const rows = model.years.map((r, y) => {
      const opResult = r.operatingContribution;
      cumulativeResult += opResult;
      if (breakEvenYear === null && cumulativeResult >= 0) breakEvenYear = y + 1;
      return {
        arrStart: r.startARR, churnAmt: r.churnARR,
        expansionAmt: r.expansionARR, newCustARR: r.newARR,
        arrEnd: r.endARR, existingRevenue: r.existingRevenue,
        newRevenue: r.newRevenue, totalRevenue: r.recognizedRevenue,
        grossProfit: r.grossProfit, smSpend: r.smPaid, opResult,
        cumResult: cumulativeResult, newCust: r.newCustomers,
        displayACV: model.months[Math.min(y*12, model.months.length-1)].newACV,
        rampPct: r.newARR > 0 ? Math.round(r.newRevenue / r.newARR * 100) : 0,
      };
    });
    const getArrPhase = y => rows[y].newCustARR > 0 ? rows[y].newRevenue / rows[y].newCustARR : 0;
    const baselineRevenue = state.revenue * state.timeframe / 12;
    const incrementalRevenue = model.summary.totalRecognizedRevenue - baselineRevenue;
    const incrementalGP = incrementalRevenue * grossMargin;
    const totalSM = model.summary.totalSM;

    // ── BUILD TABLE ───────────────────────────────────────────────────────────
    // Quarter expand state persists across renders
    if (!window._qtr) window._qtr = {};
    if (!window._plMonths) window._plMonths = {};

    // Desktop layout — fixed px widths, no global total column
    const LBL  = 160; // label px
    const YCOL = 110; // year column px (collapsed)
    const QCOL = 72;  // quarter column px
    const MCOL = 70;  // month column px
    const YTOT = 88;  // year-total px (when expanded)
    const GAP  = 5;

    // Build column template dynamically based on expansion state
    const colDefs = [LBL + 'px'];
    for (let y = 0; y < years; y++) {
      if (window._qtr[y]) {
        for (let q = 0; q < 4; q++) {
          if (window._plMonths[y]?.[q]) {
            for (let m = 0; m < 3 && y*12+q*3+m<state.timeframe; m++) colDefs.push(MCOL+'px');
          }
          colDefs.push(QCOL+'px');
        }
        colDefs.push(YTOT+'px');
      } else {
        colDefs.push(YCOL+'px');
      }
    }
    const colTemplate = colDefs.join(' ');
    const totalGridW = colDefs.reduce((s,c) => s + parseInt(c), 0) + (colDefs.length - 1) * GAP;

    const empty = `<div></div>`;

    const cell = (val, bold=false, color='#333', bg='white', note='') =>
      `<div style="background:${bg};border:0.5px solid #e0e0e0;border-radius:6px;padding:0.35rem 0.5rem;text-align:right;font-size:11px;font-weight:${bold?'600':'400'};color:${color};">
        ${fmt(Math.round(val))}${note ? `<div style="font-size:9px;color:#bbb;margin-top:1px;">${note}</div>` : ''}
      </div>`;

    // Year-total cell — blue tint, only shown when year is expanded
    const ycell = (val, bold=true, color='#185FA5', bg='#EDF4FB', note='') =>
      `<div style="background:${bg};border:0.5px solid #c5daf0;border-radius:6px;padding:0.35rem 0.5rem;text-align:right;font-size:11px;font-weight:${bold?'700':'500'};color:${color};">
        ${fmt(Math.round(val))}${note ? `<div style="font-size:9px;color:#888;margin-top:1px;">${note}</div>` : ''}
      </div>`;

    // Quarterly P&L values are aggregated from exactly the same monthly rows.
    const modelQuarterByYear = rows.map((_, y) => {
      const found = model.quarters.filter(q => q.year === y);
      const endARR = found.length ? found[found.length-1].endARR : rows[y].arrEnd;
      while (found.length < 4) found.push({
        startARR: endARR, endARR, churnARR: 0, expansionARR: 0,
        newARR: 0, recognizedRevenue: 0, grossProfit: 0,
        originalNetRevenue: 0, earlierNewNetRevenue: 0, currentNewNetRevenue: 0,
        signedMRR: 0,
        newCustomers: 0, churnCustomers: 0,
        smPaid: 0, operatingContribution: 0
      });
      return found;
    });
    const _qtrStock = modelQuarterByYear.map(qs => qs.map(q => ({
      arrStart: q.startARR, churn: q.churnARR, expansion: q.expansionARR,
      newARR: q.newARR, arrEnd: q.endARR
    })));
    const _qtrTotalRev = modelQuarterByYear.map(qs => qs.map(q => q.recognizedRevenue));
    const monthlyRevenueBridge = buildRevenueBridge(model.months, 'month');
    // Column definitions describe one displayed period; all monetary rows reuse them.
    const visiblePeriods = y => {
      if (!window._qtr[y]) return [{kind:'year', period:model.years[y]}];
      const cols=[];
      for(let q=0;q<4;q++) {
        if(window._plMonths[y]?.[q]) {
          for(let m=0;m<3;m++) {
            const index=y*12+q*3+m;
            if(index<model.months.length) cols.push({kind:'month',period:monthlyRevenueBridge[index],monthIndex:index,q});
          }
        }
        cols.push({kind:'quarter',period:modelQuarterByYear[y][q],q});
      }
      cols.push({kind:'yearTotal',period:model.years[y]});
      return cols;
    };
    const periodCell = (value,kind,{bold=false,color='#555',bg='white',note=''}={}) => {
      if(kind==='yearTotal') return ycell(value,bold,color,bg,note);
      if(kind==='year') return cell(value,bold,color,bg,note);
      return `<div style="background:${bg};border:0.5px solid #e0e0e0;border-radius:6px;padding:0.35rem 0.5rem;text-align:right;font-size:10px;font-weight:${bold?'600':'400'};color:${color};">${fmt(Math.round(value))}${note?`<div style="font-size:9px;color:#aaa;">${note}</div>`:''}</div>`;
    };
    const eachPeriod = (y,fn) => visiblePeriods(y).map(col=>fn(col.period,col.kind,col)).join('');

    // Every row renders the same visible period columns, whether year, quarter or month.
    const yearQuarterCells = (y,key,sign=1,bold=false,color='#333',bg='white') =>
      eachPeriod(y,(period,kind)=>periodCell((period[key]||0)*sign,kind,{bold,color,bg}));

    const yearArrStartCells = (y,note='') => eachPeriod(y,(period,kind)=>
      periodCell(period.startARR??0,kind,{color:'#555',bg:'#fafafa',
        note:kind==='year'||kind==='yearTotal'?note:
          ((period.startCustomers??0)>0?Math.round(period.startCustomers)+' cust.':'')}));

    const yearChurnCells = (y,note='') => eachPeriod(y,(period,kind)=>
      periodCell(-(period.churnARR??0),kind,{color:'#E24B4A',
        note:kind==='year'||kind==='yearTotal'?note:
          '−'+Math.round(period.churnCustomers??0)+' cust.'}));

    const yearExpansionCells = (y,note='') => eachPeriod(y,(period,kind)=>
      periodCell(period.expansionARR??0,kind,{color:'#3B6D11',
        note:kind==='year'||kind==='yearTotal'?note:
          (period.retainedBaseACV>0?'ACV '+fmt(Math.round(period.retainedBaseACV)):'')}));

    const yearNewARRcells = (y,note='') => eachPeriod(y,(period,kind)=>{
      const newACV=period.newCustomers>0?period.newARR/period.newCustomers:0;
      return periodCell(period.newARR??0,kind,{color:'#555',
        note:kind==='year'||kind==='yearTotal'?note:
          Math.round(period.newCustomers??0)+' cust.'+(newACV?' · ACV '+fmt(Math.round(newACV)):'')});
    });

    const yearRevenueCells = y => eachPeriod(y,(period,kind)=>
      periodCell(period.recognizedRevenue??0,kind,{color:'#555',bg:'#fafafa'}));

    const yearGPcells = y => eachPeriod(y,(period,kind)=>
      periodCell(period.grossProfit??0,kind,{color:'#555'}));

    const label = (text, indent=false, bold=false, color='') =>
      `<div style="font-size:11px;color:${color||(bold?'#333':'#666')};font-weight:${bold?'600':'400'};display:flex;align-items:center;padding:${indent?'0 0 0 0.75rem':'0'};min-height:28px;">${text}</div>`;

    const divider = () => `<div style="grid-column:1/-1;border-top:0.5px solid #e0e0e0;margin:2px 0;"></div>`;

    let html = `<div style="display:grid;grid-template-columns:${colTemplate};gap:${GAP}px;width:${totalGridW}px;">`;

    // ── HEADERS ──
    // Presets now occupy a permanent toolbar ABOVE this grid.
    // No conditional rows: expand/collapse changes columns only, never vertical position.
    html += `<div></div>`;
    for (let y = 0; y < years; y++) {
      const exp = window._qtr && window._qtr[y];
      if (exp) {
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        for(let q=0;q<4;q++) {
          const opened=!!window._plMonths[y]?.[q];
          if(opened) for(let m=0;m<3;m++) {
            const absolute=y*12+q*3+m;
            if(absolute<model.months.length) {
              html += `<div style="font-size:10px;font-weight:500;color:#777;text-align:center;padding:0.25rem;background:#f9f9f9;border-radius:5px;">${monthNames[q*3+m]}</div>`;
            }
          }
          html += `<div style="font-size:10px;font-weight:600;color:${opened?'#185FA5':'#666'};text-align:center;padding:0.25rem;background:${opened?'#EDF4FB':'#f5f5f5'};border-radius:5px;cursor:pointer;" role="button" tabindex="0" onclick="togglePlMonth(${y},${q})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();togglePlMonth(${y},${q});}" title="${opened?'Collapse months':'Expand months'}">Y${y+1} Q${q+1} ${opened?'▲':'▼M'}</div>`;
        }
        html += `<div style="font-size:11px;font-weight:700;color:#185FA5;text-align:center;padding:0.25rem 0.4rem;background:#EDF4FB;border:0.5px solid #c5daf0;border-radius:5px;cursor:pointer;" onclick="togglePlQtr(${y})" title="Collapse">
          Year ${y+1}${breakEvenYear===y+1?' ✓':''} ▲
        </div>`;
      } else {
        html += `<div style="font-size:11px;font-weight:500;color:#333;text-align:center;padding:0.35rem 0.4rem;background:#f0f0f0;border-radius:6px;cursor:pointer;position:relative;" onclick="togglePlQtr(${y})" title="Expand quarters">
          Year ${y+1}${breakEvenYear===y+1?' ✓':''}
          <span style="font-size:9px;color:#aaa;margin-left:3px;">▼Q</span>
        </div>`;
      }
    }

    // Single integrated Contracted ARR / Revenue bridge, with no duplicate ARR
    // section. A/B are the cohorts present at the displayed period start;
    // C holds subscriptions first invoiced inside the displayed period.
    // ARR rows are annualized STOCK movements; revenue rows are earned FLOWS.
    const custAtStart = model.years.map(r => r.startCustomers);
    const custAtEnd = model.years.map(r => r.endCustomers);
    const acvAtStart = model.years.map(r => r.startACV);

    // Keep the original first row (opening Contracted ARR, customers and ACV).
    html += label('Contracted ARR (start of period)', false, true);
    for (let y = 0; y < years; y++) {
      const acvStr = fmt(Math.round(acvAtStart[y]));
      html += yearArrStartCells(y, Math.round(custAtStart[y]) + ' cust. · ACV ' + acvStr);
    }

    const cohortHeading = title => {
      html += divider();
      html += label(title, false, true, '#444');
      for (let y=0;y<years;y++) html += eachPeriod(y,()=>'<div></div>');
    };
    const cohortARRRow = (name, prefix, key, {bold=false, negative=false, noteKey=null}={}) => {
      html += label(name, true, bold);
      for (let y=0;y<years;y++) html += eachPeriod(y,(period,kind)=>{
        const value=(period[prefix+key]??0)*(negative?-1:1);
        const isYear=kind==='year'||kind==='yearTotal';
        const relevantCustomers=noteKey ? period[prefix+noteKey] : null;
        let note=noteKey
          ? Math.round(relevantCustomers??0)+(noteKey==='ChurnCustomers'?' lost cust.':' cust.')
          : '';
        if(isYear&&key==='EndARR'&&(period[prefix+'EndCustomers']??0)>0){
          const count=period[prefix+'EndCustomers'];
          note=Math.round(count)+' cust. · ACV '+fmt(Math.round(period[prefix+'EndARR']/count));
        }
        if(isYear&&key==='NewARR'&&(period[prefix+'NewCustomers']??0)>0){
          const count=period[prefix+'NewCustomers'];
          note=Math.round(count)+' new cust. · ACV '+fmt(Math.round(period[prefix+'NewARR']/count));
        }
        return periodCell(value,kind,{
          bold,color:negative?'#E24B4A':key==='ExpansionARR'?'#3B6D11':'#555',
          bg:bold?'#fafafa':'white',note,
        });
      });
    };
    const recognizedRow = (name,key,{bold=true,indent=false,color='#555'}={}) => {
      html += label(name,indent,bold);
      for(let y=0;y<years;y++)
        html += yearQuarterCells(y,key,1,bold,color,bold?'#fafafa':'white');
    };

    cohortHeading('A. Existing Customers – Start of Year');
    cohortARRRow('Of which: Opening CARR – Existing (A)','original','StartARR',{noteKey:'StartCustomers'});
    cohortARRRow('− Churn CARR – A','original','ChurnARR',{negative:true,noteKey:'ChurnCustomers'});
    cohortARRRow('+ Expansion CARR – A','original','ExpansionARR');
    cohortARRRow('Closing CARR – A','original','EndARR',{bold:true});
    // Earned revenue is NOT the annualized CARR closing stock.
    // Opening CARR earns through the entire displayed period; each ARR change
    // changes earned MRR for the remaining months, including the change month.
    recognizedRow('Revenue · Opening CARR × period / 12 (A)','originalBaseRevenue',{bold:false,indent:true});
    recognizedRow('− Revenue impact · churn (A)','originalChurnRevenueImpact',
      {bold:false,indent:true,color:'#E24B4A'});
    recognizedRow('+ Revenue impact · expansion (A)','originalExpansionRevenueImpact',
      {bold:false,indent:true,color:'#3B6D11'});

    cohortHeading('B. New Customers – Earlier This Year');
    cohortARRRow('Of which: Opening CARR – Earlier New (B)','earlier','StartARR',{noteKey:'StartCustomers'});
    cohortARRRow('− Churn CARR – B','earlier','ChurnARR',{negative:true,noteKey:'ChurnCustomers'});
    cohortARRRow('+ Expansion CARR – B','earlier','ExpansionARR');
    cohortARRRow('Closing CARR – B','earlier','EndARR',{bold:true});
    recognizedRow('Revenue · Opening CARR × period / 12 (B)','earlierNewBaseRevenue',
      {bold:false,indent:true});
    recognizedRow('− Revenue impact · churn (B)','earlierNewChurnRevenueImpact',
      {bold:false,indent:true,color:'#E24B4A'});
    recognizedRow('+ Revenue impact · expansion (B)','earlierNewExpansionRevenueImpact',
      {bold:false,indent:true,color:'#3B6D11'});

    cohortHeading('C. New Customers – Current Period');
    cohortARRRow('+ First-invoiced New CARR – Current (C)','current','NewARR',{noteKey:'NewCustomers'});
    cohortARRRow('− Churn CARR – C','current','ChurnARR',{negative:true,noteKey:'ChurnCustomers'});
    cohortARRRow('+ Expansion CARR – C','current','ExpansionARR');
    cohortARRRow('Closing CARR – C','current','EndARR',{bold:true});
    recognizedRow('Revenue · First invoice timing (C)','currentNewRevenue',
      {bold:false,indent:true});
    recognizedRow('− Revenue impact · churn (C)','currentNewChurnRevenueImpact',
      {bold:false,indent:true,color:'#E24B4A'});
    recognizedRow('+ Revenue impact · expansion (C)','currentNewExpansionRevenueImpact',
      {bold:false,indent:true,color:'#3B6D11'});

    html += divider();
    recognizedRow('Recognized Revenue – Existing (A)','existingRevenue');
    recognizedRow('Recognized Revenue – New (B+C)','newRevenue');
    recognizedRow('Total Recognized Revenue','recognizedRevenue');

    html += divider();
    html += label('Contracted ARR (end of period) = A + B + C',false,true);
    for(let y=0;y<years;y++){
      html += eachPeriod(y,(period,kind)=>periodCell(period.endARR??0,kind,{
        bold:true,color:'#185FA5',bg:kind==='yearTotal'?'#EDF4FB':'#E6F1FB',
        note:kind==='year'||kind==='yearTotal'
          ? Math.round(custAtEnd[y])+' cust. · ACV '+
            fmt(Math.round(period.endACV??0))+(y===years-1?' · target':'')
          : Math.round(period.endCustomers??0)+' cust.'
      }));
    }

    // Revenue impact and annualized CARR change are different units. The
    // recognized revenue lines cannot be added to the CARR closing stock.
    html += `<div style="grid-column:1/-1;font-size:10px;color:#999;margin-top:4px;">
      CARR is an annualized contract run rate (a stock). Recognized revenue is
      earned during the period (a flow). Within each A/B/C group, opening CARR
      contributes opening CARR × months in the displayed period / 12.
      Churn and expansion change revenue for the remaining months of that period;
      first-invoiced customers contribute from their first invoice month.
      "Of which" rows describe the opening CARR split; do not add them again to Opening CARR.
      Opening CARR - A/B/C churn + A/B/C expansion + new CARR = Closing CARR.
      Recognized Existing (A) + Recognized New (B+C) = Total Recognized Revenue.
      Earlier New (B) includes only customers first invoiced earlier in the current year;
      Current New (C) includes customers first invoiced within the displayed period.
      When a full year is displayed, all customers first invoiced that year belong to C;
      from the next year they belong to Existing (A). Expand quarters or months to see B.
      Amounts are calculated before rounding to the displayed currency.
    </div>`;

    const totRev = rows.reduce((sum,r)=>sum+r.totalRevenue,0);
    const totGP  = rows.reduce((sum,r)=>sum+r.grossProfit,0);
    const totSM2 = rows.reduce((sum,r)=>sum+r.smSpend,0);
    const totOP  = rows.reduce((sum,r)=>sum+r.opResult,0);

    // ACV is a contracted annualized run rate per CURRENT customer,
    // not recognized revenue divided by end-of-period customers.
    html += label('Contracted ACV (end) = Closing CARR / Customers', false, true);
    for(let y=0;y<years;y++) {
      html += eachPeriod(y,(period,kind)=>periodCell(period.endACV??0,kind,{
        color:'#555',bg:'white',
        note:Math.round(period.endCustomers??0)+' customers'
      }));
    }

    html += divider();

    html += label('Gross profit', true);
    for (let y = 0; y < years; y++) html += yearGPcells(y);

    html += label('S&M spend <span style="font-size:9px;font-weight:400;color:#999;">← from annual plan</span>', true);
    if (!selectedStrategy) {
      for (let y = 0; y < years; y++) {
        const ph = `<div style="background:white;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.35rem 0.5rem;text-align:right;font-size:10px;color:#bbb;">select strategy ↓</div>`;
        html += eachPeriod(y,()=>ph);
      }
    } else {
      for (let y = 0; y < years; y++) html += yearQuarterCells(y, 'smPaid', -1, false, '#E24B4A');
    }

    html += divider();

    html += label('Contribution (GP − S&M)', false, true);
    if (!selectedStrategy) {
      for (let y = 0; y < years; y++) {
        const ph = `<div style="background:#fafafa;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.35rem 0.5rem;text-align:right;font-size:10px;color:#bbb;">—</div>`;
        html += eachPeriod(y,()=>ph);
      }
    } else {
      for (let y = 0; y < years; y++) {
        const v = rows[y].opResult;
        html += yearQuarterCells(y, 'operatingContribution', 1, true, v>=0?'#3B6D11':'#E24B4A', v>=0?'#EAF3DE':'#FCEBEB');
      }
      html += label('Cumulative', true);
      for (let y = 0; y < years; y++) {
        const v = rows[y].cumResult;
        const ph = `<div style="background:white;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.35rem 0.5rem;text-align:right;font-size:10px;color:${v>=0?'#3B6D11':'#E24B4A'};">${fmt(Math.round(v))}</div>`;
        html += eachPeriod(y,(period,kind)=>{
          const end = period.endMonth ?? Math.min(state.timeframe,(y+1)*12);
          const subtotal = model.months.slice(0,end).reduce((sum,m)=>sum+m.operatingContribution,0);
          const color = subtotal>=0?'#3B6D11':'#E24B4A';
          return periodCell(subtotal,kind,{color});
        });
      }
    }

    html += `<div style="grid-column:1/-1;font-size:10px;color:#bbb;margin-top:4px;">
      Contracted ARR is annualized at period start/end; recognized revenue, churn and expansion impacts in A/B/C are earned amounts during the period. Existing (A) + New (B+C) = Total Recognized Revenue.
    </div>`;

    html += '</div>';

    // ── REVENUE MULTIPLIER — only show when strategy is selected ──
    if (selectedStrategy && totSM2 > 0) {
      const revMultiplier = incrementalRevenue / totSM2;
      const mulColor = revMultiplier >= 3 ? '#3B6D11' : revMultiplier >= 1 ? '#BA7517' : '#E24B4A';
      html += `<div style="background:#fafafa;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.75rem 1rem;margin-top:1rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;">
        <div>
          <div style="font-size:10px;color:#999;font-weight:500;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.25rem;">Incremental revenue / S&M spend — ${state.timeframe} months</div>
          <div style="font-size:11px;color:#666;">Incremental revenue (${fmt(Math.round(incrementalRevenue))}) ÷ S&M spend (${fmt(Math.round(totSM2))})</div>
        </div>
        <div style="font-size:26px;font-weight:700;color:${mulColor};white-space:nowrap;">${revMultiplier.toFixed(1)}×</div>
      </div>`;
    }

    html += '<div style="margin-top:0.5rem;font-size:11px;color:#666;">'
      + 'ⓘ New customers enter ARR and generate full MRR from their first invoicing month. '
      + 'ARR, recognized revenue and cash collections are distinct. Contribution is not operating cash flow.</div>';

    // ── BREAK-EVEN ──
    if (selectedStrategy) {
      if (breakEvenYear) {
        html += `<div style="font-size:11px;color:#3B6D11;margin-top:0.75rem;">✓ Cumulative operating break-even reached in Year ${breakEvenYear}.</div>`;
      } else {
        html += `<div style="font-size:11px;color:#BA7517;margin-top:0.75rem;">⚠ Cumulative break-even not reached within the plan period.</div>`;
      }
    }

    // ── HEALTH CHECK ──
    // Per-year metrics based on actual P&L
    html += `<div style="margin-top:1.5rem;">`;
    html += `<div style="font-size:12px;font-weight:500;color:#333;margin-bottom:0.25rem;">Unit Economics — per year</div><div style="font-size:10px;color:#999;margin-bottom:0.75rem;">All metrics based on Realized ACV</div>`;
    const ueColW = 90;
    const ueLabelW = 140;
    const ueTotW = 90;
    html += `<div style="display:grid;grid-template-columns:${ueLabelW}px ${Array(years).fill(ueColW+'px').join(' ')} ${ueTotW}px;gap:5px;">`;

    // Headers
    html += `<div></div>`;
    for (let y = 0; y < years; y++) {
      html += `<div style="font-size:11px;font-weight:500;color:#333;text-align:center;padding:0.35rem;background:#f0f0f0;border-radius:6px;">Year ${y+1}</div>`;
    }
    html += `<div style="font-size:11px;font-weight:500;color:#333;text-align:center;padding:0.35rem;background:#f0f0f0;border-radius:6px;">Avg</div>`;

    // LTV — two versions: Contracted (expanded ACV) and Realized
    html += label('LTV (realized)', false, true);
    const ltvVals = rows.map((r, y) => {
      const rACV = realizedACV[y] || acv;
      return churnRate > 0 ? Math.round((rACV * grossMargin) / churnRate) : 0;
    });
    const avgLTV = Math.round(ltvVals.reduce((s,v)=>s+v,0) / years);
    for (let y = 0; y < years; y++) html += cell(ltvVals[y], false, '#555');
    html += cell(avgLTV, false, '#555');

    // Actual CAC = S&M spend / new customers
    html += label('Actual CAC', false, true);
    const cacVals = rows.map(r => r.newCust > 0 ? Math.round(r.smSpend / r.newCust) : 0);
    const avgCAC = Math.round(cacVals.reduce((s,v)=>s+v,0) / years);
    for (let y = 0; y < years; y++) html += cell(cacVals[y], false, '#555');
    html += cell(avgCAC, false, '#555');

    // LTV:CAC ratio
    html += label('LTV:CAC', false, true);
    for (let y = 0; y < years; y++) {
      const ratio = cacVals[y] > 0 ? (ltvVals[y] / cacVals[y]).toFixed(1) : '—';
      const ratioNum = cacVals[y] > 0 ? ltvVals[y] / cacVals[y] : 0;
      const color = ratioNum >= 5 ? '#3B6D11' : ratioNum >= 3 ? '#555' : '#E24B4A';
      const note = ratioNum >= 5 ? 'healthy' : ratioNum >= 3 ? 'ok' : ratioNum > 0 ? 'low' : '—';
      html += `<div style="background:white;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.4rem 0.5rem;text-align:right;">
        <div style="font-size:11px;font-weight:600;color:${color};">${ratio}×</div>
        <div style="font-size:9px;color:#bbb;">${note}</div>
      </div>`;
    }
    const avgRatio = avgCAC > 0 ? (avgLTV / avgCAC).toFixed(1) : '—';
    const avgRatioNum = avgCAC > 0 ? avgLTV / avgCAC : 0;
    const avgRatioColor = avgRatioNum >= 5 ? '#3B6D11' : avgRatioNum >= 3 ? '#555' : '#E24B4A';
    html += `<div style="background:white;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.4rem 0.5rem;text-align:right;">
      <div style="font-size:11px;font-weight:700;color:${avgRatioColor};">${avgRatio}×</div>
    </div>`;

    // CAC Payback — based on Realized ACV
    html += label('CAC Payback', false, true);
    for (let y = 0; y < years; y++) {
      const expACV = realizedACV[y] || acv;
      const monthlyGP = (expACV / 12) * grossMargin;
      const payback = monthlyGP > 0 && cacVals[y] > 0 ? Math.round(cacVals[y] / monthlyGP) : 0;
      const color = payback > 0 && payback <= 12 ? '#3B6D11' : payback <= 24 ? '#BA7517' : '#E24B4A';
      html += `<div style="background:white;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.4rem 0.5rem;text-align:right;">
        <div style="font-size:11px;font-weight:500;color:${color};">${payback > 0 ? payback + ' mo' : '—'}</div>
      </div>`;
    }
    html += `<div></div>`;

    // Magic Number = (ARR growth × grossMargin) / trailing S&M
    html += label('Magic Number <span style="font-size:9px;font-weight:400;color:#999;" title="Magic Number = (ARR growth × gross margin) ÷ S&M spend. Measures how efficiently S&M spend converts to recurring gross profit. >0.75 = efficient, 0.5–0.75 = acceptable, <0.5 = review spend.">ⓘ</span>', false, true);
    for (let y = 0; y < years; y++) {
      const arrGrowth = rows[y].arrEnd - rows[y].arrStart;
      const magic = rows[y].smSpend > 0 ? (arrGrowth * grossMargin / rows[y].smSpend).toFixed(2) : '—';
      const magicNum = rows[y].smSpend > 0 ? arrGrowth * grossMargin / rows[y].smSpend : 0;
      const color = magicNum >= 0.75 ? '#3B6D11' : magicNum >= 0.5 ? '#BA7517' : '#E24B4A';
      const note = magicNum >= 0.75 ? 'efficient' : magicNum >= 0.5 ? 'acceptable' : magicNum > 0 ? 'review' : '—';
      html += `<div style="background:white;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.4rem 0.5rem;text-align:right;">
        <div style="font-size:11px;font-weight:500;color:${color};">${magic}</div>
        <div style="font-size:9px;color:#bbb;">${note}</div>
      </div>`;
    }
    html += `<div></div>`;

    // S&M as % of Gross Profit
    html += label('S&M / GP', false, true);
    for (let y = 0; y < years; y++) {
      const ratio = rows[y].grossProfit > 0 ? Math.round(rows[y].smSpend / rows[y].grossProfit * 100) : 0;
      const color = ratio <= 50 ? '#3B6D11' : ratio <= 80 ? '#BA7517' : '#E24B4A';
      const note = ratio <= 50 ? 'healthy' : ratio <= 80 ? 'growth' : ratio <= 100 ? 'aggressive' : 'burning';
      html += `<div style="background:white;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.4rem 0.5rem;text-align:right;">
        <div style="font-size:11px;font-weight:500;color:${color};">${ratio}%</div>
        <div style="font-size:9px;color:#bbb;">${note}</div>
      </div>`;
    }
    const avgSMGP = rows.reduce((s,r) => s + r.grossProfit, 0) > 0
      ? Math.round(rows.reduce((s,r)=>s+r.smSpend,0) / rows.reduce((s,r)=>s+r.grossProfit,0) * 100) : 0;
    const avgSMGPcolor = avgSMGP <= 50 ? '#3B6D11' : avgSMGP <= 80 ? '#BA7517' : '#E24B4A';
    html += `<div style="background:white;border:0.5px solid #e0e0e0;border-radius:6px;padding:0.4rem 0.5rem;text-align:right;">
      <div style="font-size:11px;font-weight:700;color:${avgSMGPcolor};">${avgSMGP}%</div>
    </div>`;

    html += `</div></div>`;



    el.innerHTML = html;
    renderMonthlyCashControls(model, fmt);
    renderPlanToolbar(model);
  }


  function generateRecommendations() {
    const a = state.animal;
    const msgs = {
      Mice:      'PLG model: allocate 100% to marketing, product growth loops and referral mechanics. No sales personnel.',
      Rabbits:   'Light-touch model: ~10% on sales support, ~10% on sales activities, ~80% on marketing. Most customers self-convert.',
      Deer:      'Inside sales model: ~35% on sales staff, ~15% on sales activities, ~50% on marketing. Sales closes, marketing fills the funnel.',
      Elephants: 'Enterprise model: ~55% on senior sales team, ~20% on field activities, ~25% on ABM marketing. All deals require a salesperson.',
      Whales:    'Founder-led model: ~40% on exec time and relationships, ~35% on strategic activities, ~25% on brand marketing.'
    };
    document.getElementById('recommendationsBox').innerHTML = `<div class="alert alert-info" style="background:#E6F1FB;border-left:3px solid #378ADD;color:#185FA5;">${msgs[a] || ''}</div>`;
  }

  function switchStep(step) {
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    const el = document.getElementById('step' + step);
    if (el) el.classList.add('active');
    for (let i = 1; i <= 3; i++) {
      const circle = document.getElementById('badge' + i);
      if (!circle) continue;
      if (i <= step) { circle.classList.add('active'); circle.classList.remove('inactive'); circle.textContent = '●'; }
      else           { circle.classList.add('inactive'); circle.classList.remove('active'); circle.textContent = '○'; }
    }
    // Step 3 gets full desktop width, steps 1-2 stay narrow
    const container = document.querySelector('.container');
    if (container) container.style.maxWidth = step === 3 ? '1400px' : '900px';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goToStep1() { switchStep(1); }


  updateCurrency();

  function togglePlMonth(y,q) {
    if (!window._plMonths) window._plMonths = {};
    if (!window._plMonths[y]) window._plMonths[y] = {};
    window._plMonths[y][q] = !window._plMonths[y][q];
    updateStep3Display();
  }

  function togglePlQtr(y) {
    if (!window._qtr) window._qtr = {};
    window._qtr[y] = !window._qtr[y];
    updateStep3Display();
  }

// Transitional bridge for inline HTML event handlers. Step-by-step, handlers will
// move to addEventListener inside the corresponding feature module.
Object.assign(window, {
  updateCurrency,
  onStageChange,
  goToStep2,
  toggleCollapsible,
  updateMetrics,
  goToStep1,
  goToStep3,
  resetPL,
  onPLSlider,
  onQuarterPhasingChange,
  onPlanBudgetGranularityChange,
  togglePlanPeriodInputs,
  onPlanPeriodValueChange,
  resetPlanPeriodInputs,
  onPLCheckbox,
  selectStrategy,
  onCustomCACChange,
  resetAllocations,
  onSplitChange,
  toggleAllocRow,
  onAllocInput,
  toggleLock,
  setQtrScenario,
  togglePlQtr,
  togglePlMonth,
  updateCashAssumptions,
  updateQuarterSM
});
