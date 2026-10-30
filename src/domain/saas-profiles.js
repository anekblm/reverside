// ReverSide — configurable SaaS model profiles.
// Current benchmarks are initial assumptions and must be source-verified before production use.
// Keep benchmark/strategy data out of the financial calculation engine.

export const animals = {
    Mice:      { acv: 75,      churn: 0.40, ltv: 200,      cac: 50,      emoji: '🐭', companies: 'Netflix, Dropbox, Duolingo, ChatGPT, Figma',          characteristics: 'Low-cost, high-volume model. Users discover and convert through product experience. Requires viral loops or word-of-mouth.',           summary: 'You need a free/freemium model that drives organic adoption. Invest in product experience and viral mechanics. No sales team.',                  nrrBench: 'Typical NRR: 85–100%',    newCustBench: 'New customer growth: 50–100%/year',  growthChar: 'Growth engine: new customers only. At 40% churn, staying flat on existing ARR requires 67% expansion per customer — structurally impossible. Growth depends entirely on new customer acquisition.' },
    Rabbits:   { acv: 1200,    churn: 0.25, ltv: 3200,     cac: 800,     emoji: '🐰', companies: 'Slack, Zapier, Notion, Intercom, Calendly',             characteristics: 'SMB focus with light sales support. Marketing generates inbound leads. Sales cycles close in 1-2 weeks.',                                 summary: 'Strong product-led adoption with marketing support. One-call close sales. Content marketing and freemium conversion.',                           nrrBench: 'Typical NRR: 95–110%',    newCustBench: 'New customer growth: 30–50%/year',   growthChar: 'Growth engine: primarily new customers. At 25% churn, staying flat requires 33% expansion per customer — very difficult. New customer acquisition is the primary driver, expansion helps at the margin.' },
    Deer:      { acv: 13000,   churn: 0.12, ltv: 65000,    cac: 16250,   emoji: '🦌', companies: 'HubSpot, Asana, Stripe, Datadog, Mixpanel',             characteristics: 'Mid-market with inside sales teams. Marketing generates 100,000+ leads annually. Sales cycles 1-2 months.',                              summary: 'Inside sales to close deals efficiently. Marketing generates qualified leads. Expansion revenue becomes increasingly important.',                nrrBench: 'Typical NRR: 105–120%',   newCustBench: 'New customer growth: 30–50%/year',   growthChar: 'Growth engine: balanced. At 12% churn, staying flat requires only 14% expansion per customer — achievable via seat growth and plan upgrades. Expansion becomes increasingly important as the base grows.' },
    Elephants: { acv: 130000,  churn: 0.08, ltv: 1000000,  cac: 100000,  emoji: '🐘', companies: 'ServiceNow, Workday, Salesforce Enterprise, Adobe',     characteristics: 'Enterprise-focused with field sales teams. Long sales cycles 1-2 quarters. Heavy customization and relationship-building.',              summary: 'Experienced sales teams and account-based marketing. Large budgets justify field sales and executive engagement.',                               nrrBench: 'Typical NRR: 110–130%',   newCustBench: 'New customer growth: 10–20%/year',   growthChar: 'Growth engine: expansion-led. At 8% churn, staying flat requires only 9% expansion — easily achieved through upsell and seat growth. The existing base compounds strongly; new customers accelerate it.' },
    Whales:    { acv: 1000000, churn: 0.05, ltv: 16000000, cac: 1200000, emoji: '🐋', companies: 'Palantir, Bloomberg, Thomson Reuters',                  characteristics: 'Strategic deals with founder involvement. Long cycles 6-18 months. Custom solutions and partnerships.',                                  summary: 'Founder-led sales with strategic relationships. Small number of deals. Focus on implementation and customer success.',                           nrrBench: 'Typical NRR: 120–150%',   newCustBench: 'New customer growth: 5–15%/year',    growthChar: 'Growth engine: expansion-dominant. At 5% churn, staying flat requires only 5% expansion — almost automatic. One expanded contract can outweigh several new logos. New wins are high-value but infrequent.' }
  };

export const targetDefaults = { EUR: 100000, USD: 100000, SEK: 1000000 };

export const toEUR = { EUR: 1.0, USD: 0.92, SEK: 0.088 };

export const currencyFormats = {
    EUR: n => '€' + Math.round(n).toLocaleString(),
    USD: n => '$' + Math.round(n).toLocaleString(),
    SEK: n => Math.round(n).toLocaleString() + ' kr'
  };

export const paybackBenchmarks = { Mice: 7, Rabbits: 12, Deer: 21, Elephants: 27, Whales: 36 };

export const cacRatios = { Mice: 0.20, Rabbits: 0.25, Deer: 0.30, Elephants: 0.35, Whales: 0.40 };

export const growthMultipliers = { Mice: 1.5, Rabbits: 1.8, Deer: 2.0, Elephants: 2.0, Whales: 1.8 };

export const growthMaxMonths = { Mice: 6, Rabbits: 9, Deer: 18, Elephants: 24, Whales: 36 };

export const budgetDefaults = {
    Mice:      { sales: 0,  salesact: 0,  mkt: 100 },
    Rabbits:   { sales: 15, salesact: 10, mkt: 75  },
    Deer:      { sales: 45, salesact: 15, mkt: 40  },
    Elephants: { sales: 60, salesact: 20, mkt: 20  },
    Whales:    { sales: 45, salesact: 40, mkt: 15  }
  };

export const funnels = {
    Mice: {
      type: 'Product funnel',
      desc: 'Mice grow through product virality. Users self-convert — no sales involved. Marketing drives top-of-funnel volume.',
      steps: [
        { label: 'Website visitors',  rate: null,  note: 'Starting point' },
        { label: 'Signups',           rate: 0.035, note: '2–5% of visitors' },
        { label: 'Active users',      rate: 0.30,  note: '20–40% of signups' },
        { label: 'Trial started',     rate: 0.40,  note: '30–50% of active' },
        { label: 'Paid conversion',   rate: 0.055, note: '3–8% of trials' }
      ]
    },
    Rabbits: {
      type: 'Marketing funnel',
      desc: 'Rabbits close mostly self-serve with optional light sales support. Marketing generates and nurtures leads to conversion.',
      steps: [
        { label: 'MQLs — Marketing Qualified Leads', rate: null, note: 'Starting point' },
        { label: 'SQLs — Sales Qualified Leads',    rate: 0.25, note: '20–30% of MQLs' },
        { label: 'Demo / trial',       rate: 0.60,  note: '50–70% of SQLs' },
        { label: 'Closed won',         rate: 0.30,  note: '25–35% of demos' }
      ]
    },
    Deer: {
      type: 'Inside sales funnel',
      desc: 'Deer require a sales team. Marketing generates MQLs; inside sales qualifies and closes. ~75% of deals involve a salesperson.',
      steps: [
        { label: 'Leads generated',    rate: null,  note: 'Starting point' },
        { label: 'MQLs — Marketing Qualified Leads', rate: 0.15, note: '10–20% of leads' },
        { label: 'Demo booked',        rate: 0.40,  note: '30–50% of MQLs' },
        { label: 'Proposal sent',      rate: 0.50,  note: '40–60% of demos' },
        { label: 'Closed won',         rate: 0.30,  note: '25–35% of proposals' }
      ]
    },
    Elephants: {
      type: 'Enterprise sales funnel',
      desc: 'All deals close via sales. Marketing runs ABM and thought leadership to generate meetings — it does not convert independently.',
      steps: [
        { label: 'Target accounts',    rate: null,  note: 'Starting point (ABM)' },
        { label: 'First meeting',      rate: 0.075, note: '5–10% of targets' },
        { label: 'Evaluation started', rate: 0.40,  note: '30–50% of meetings' },
        { label: 'Proposal / RFP',     rate: 0.60,  note: '50–70% of evals' },
        { label: 'Closed won',         rate: 0.25,  note: '20–30% of proposals' }
      ]
    },
    Whales: {
      type: 'Strategic / founder-led funnel',
      desc: 'Marketing supports brand positioning only. All deals are founder- or exec-led. Relationships and trust drive conversion.',
      steps: [
        { label: 'Relationships / network', rate: null,  note: 'Starting point' },
        { label: 'Intro / warm meeting',    rate: 0.30,  note: '20–40% of relationships' },
        { label: 'Discovery workshop',      rate: 0.50,  note: '40–60% of intros' },
        { label: 'Proposal submitted',      rate: 0.60,  note: '50–70% of workshops' },
        { label: 'Closed won',              rate: 0.40,  note: '30–50% of proposals' }
      ]
    }
  };
