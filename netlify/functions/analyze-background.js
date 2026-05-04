'use strict';

// ============================================================
// netlify/functions/analyze-background.js
//
// Netlify Background Function — the -background suffix tells
// Netlify to return 202 immediately and run this handler
// asynchronously for up to 15 minutes.
//
// The result (or error) is written to Netlify Blobs.
// The browser polls /fn/analyze-status to retrieve it.
// ============================================================

const { getStore } = require('@netlify/blobs');

// ── Blob store name ───────────────────────────────────────────────────────────

const BLOB_STORE = 'cv-analyses';

// ── Product catalogue ─────────────────────────────────────────────────────────

const PRODUCTS = [
  { name: 'Azure Virtual Machines',                  category: 'Cloud'       },
  { name: 'Azure SQL and Cosmos DB',                 category: 'Cloud'       },
  { name: 'Azure Storage and Data Lake',             category: 'Cloud'       },
  { name: 'Azure App Service',                       category: 'Cloud'       },
  { name: 'Azure Kubernetes Service',                category: 'Cloud'       },
  { name: 'Microsoft 365 E3/E5',                     category: 'Modern Work' },
  { name: 'Microsoft Teams',                         category: 'Modern Work' },
  { name: 'SharePoint Online',                       category: 'Modern Work' },
  { name: 'Microsoft Viva',                          category: 'Modern Work' },
  { name: 'Microsoft Entra ID',                      category: 'Security'    },
  { name: 'Microsoft Defender for Endpoint',         category: 'Security'    },
  { name: 'Microsoft Defender for Cloud',            category: 'Security'    },
  { name: 'Microsoft Purview',                       category: 'Security'    },
  { name: 'Microsoft Sentinel',                      category: 'Security'    },
  { name: 'Microsoft Copilot for M365',              category: 'AI'          },
  { name: 'Copilot Studio',                          category: 'AI'          },
  { name: 'Azure OpenAI Service',                    category: 'AI'          },
  { name: 'Azure AI Studio',                         category: 'AI'          },
  { name: 'Azure Machine Learning',                  category: 'AI'          },
  { name: 'Power Platform',                          category: 'BizApps'     },
  { name: 'Dynamics 365 Sales',                      category: 'BizApps'     },
  { name: 'Dynamics 365 Finance and Operations',     category: 'BizApps'     },
];

// ── Scoring rubric ────────────────────────────────────────────────────────────

const SCORING_RUBRIC = `
Azure Virtual Machines
  Very High: on-premises servers, co-location, or data centre costs mentioned
  High: no cloud products owned yet
  Moderate: legacy compliance constraints

Azure SQL and Cosmos DB
  High: any Azure workloads already owned
  High: self-managed SQL Server or Oracle in use
  Moderate: multi-region data requirements

Azure Storage and Data Lake
  High: Azure compute already owned
  High: media, healthcare, or retail sector
  Moderate: BI investments or data retention requirements

Azure App Service
  High: active software development team
  High: Azure Virtual Machines already owned
  Moderate: web application portfolio evident

Azure Kubernetes Service
  High: DevOps culture or microservices signals
  High: Azure App Service or VMs already owned
  Moderate: DevOps or platform engineering hiring visible

Microsoft 365 E3/E5
  Very High: no M365 and company uses Office productivity tools
  High: on-premises Exchange or Google Workspace in use
  Moderate: knowledge-worker-heavy org

Microsoft Teams
  Very High: M365 owned but Teams not yet adopted
  High: multi-office or multi-country operations
  Moderate: Zoom, Webex, or Slack in use

SharePoint Online
  High: M365 or Teams already owned
  High: on-premises SharePoint farm or legacy DMS in use
  Moderate: document-heavy workflows

Microsoft Viva
  High: M365 E5 or Teams owned and large enterprise (3000+)
  High: HR transformation programmes evident
  Significantly reduce: under 500 employees

Microsoft Entra ID
  Very High: on-premises Active Directory in use
  High: any Microsoft cloud products owned without Entra
  High: Zero Trust or MFA programme mentioned
  Moderate: multi-application SSO required

Microsoft Defender for Endpoint
  Very High: regulated industry (finance, healthcare, government, energy)
  High: legacy antivirus in use
  High: M365 E5 owned (Defender included but not activated)
  Moderate: recent public cybersecurity incident

Microsoft Defender for Cloud
  Very High: Azure IaaS or multi-cloud environment owned
  High: DevSecOps signals
  Moderate: AWS or GCP alongside Azure

Microsoft Purview
  Very High: financial services, healthcare, legal, or government
  High: data residency or sovereignty concerns
  High: M365 E5 owned
  Moderate: data protection compliance programmes

Microsoft Sentinel
  Very High: regulated industry with MEA compliance requirements (CBUAE, SAMA, NESA, DFSA, QCB)
  High: Splunk or QRadar in use
  High: SOC evident or MSSP threat detection relationship confirmed
  Moderate: Defender products owned

Microsoft Copilot for M365
  Very High: M365 E3/E5 already owned
  High: knowledge-worker-heavy organisation
  Significantly reduce: M365 not owned

Copilot Studio
  High: Power Platform or Dynamics 365 already owned
  High: customer service or contact centre operations evident
  Moderate: Copilot for M365 owned or large org needing self-service bots

Azure OpenAI Service
  Very High: AI strategy public + data infrastructure present + Azure owned
  High: technology, financial services, or healthcare + ML signals
  Moderate: large enterprise with digital transformation narrative
  Reduce: no data infrastructure or very low IT maturity

Azure AI Studio
  High: Azure OpenAI Service already owned
  High: in-house software development or R&D function
  Moderate: data science team signals

Azure Machine Learning
  High: Azure infrastructure already owned
  High: predictive analytics use cases evident
  Moderate: financial services, logistics, or manufacturing

Dynamics 365 Sales
  High: CRM in use (Salesforce, SAP CRM, HubSpot)
  High: Power Platform already owned
  Moderate: complex sales processes or partner channels

Dynamics 365 Finance and Operations
  High: SAP, Oracle ERP, or legacy Dynamics AX or NAV in use
  High: multi-entity or multi-country financial operations
  Reduce: small or single-market operator

Power Platform
  High: any M365 or Dynamics 365 product already owned
  High: BI or reporting investments
  Moderate: manual workflow or approval processes
`.trim();

// ── Cross-sell trigger map ────────────────────────────────────────────────────

const CROSS_SELL_MAP = `
If customer owns any Azure Cloud product → High propensity for: Microsoft Defender for Cloud, Microsoft Sentinel, Azure OpenAI Service
If customer owns Microsoft 365 E3/E5 → High propensity for: Microsoft Copilot for M365, Microsoft Purview, Microsoft Defender for Endpoint
If customer owns Microsoft Teams → High propensity for: Microsoft Viva, Copilot Studio, SharePoint Online
If customer owns Azure OpenAI Service → High propensity for: Azure AI Studio, Azure Machine Learning, Copilot Studio
If customer owns Dynamics 365 Sales or Dynamics 365 Finance and Operations → High propensity for: Copilot Studio, Power Platform, Microsoft Entra ID
If customer owns Power Platform → High propensity for: Dynamics 365 Sales, Copilot Studio, Azure SQL and Cosmos DB
If customer owns Microsoft Sentinel → High propensity for: Microsoft Purview, Microsoft Defender for Cloud
If customer owns Microsoft Entra ID → High propensity for: Microsoft Defender for Endpoint, Microsoft Purview
`.trim();

// ── Error messages ────────────────────────────────────────────────────────────

const ERROR_MESSAGES = {
  ANTHROPIC_AUTH_ERROR:       'Something went wrong — incorrect Anthropic API details, input correct details and try again',
  ANTHROPIC_PAYMENT_ERROR:    'Something went wrong — check your Anthropic account and try again',
  ANTHROPIC_RATE_LIMIT_ERROR: 'Something went wrong — Anthropic rate limit exceeded, try again',
  ANTHROPIC_SERVER_ERROR:     'Something went wrong — Anthropic service error, try again',
  TAVILY_AUTH_ERROR:          'Something went wrong — incorrect Tavily API details, input correct details and try again',
  TAVILY_ERROR:               'Something went wrong — check your Tavily account and try again',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function labelFromScore(score) {
  if (score >= 76) return 'Very High';
  if (score >= 56) return 'High';
  if (score >= 31) return 'Moderate';
  return 'Low';
}

function resolveModelId(model) {
  return model === 'opus' ? 'claude-opus-4-6' : 'claude-sonnet-4-6';
}

function stripPeriods(val) {
  if (typeof val === 'string')        return val.trimEnd().replace(/\.$/, '');
  if (Array.isArray(val))             return val.map(stripPeriods);
  if (val && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = stripPeriods(v);
    return out;
  }
  return val;
}

function truncateToTokens(str, maxTokens) {
  return typeof str === 'string' ? str.slice(0, maxTokens * 4) : '';
}

function stripFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

// ── Tavily ────────────────────────────────────────────────────────────────────

const TAVILY_FALLBACK =
  '[No company-specific signals found — apply sector-level inference as per Stage 1 fallback instructions]';

async function tavilySearch(query, apiKey) {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query, search_depth: 'basic', include_answer: 'advanced', max_results: 5 }),
    });
    if (res.status === 401 || res.status === 403) throw new Error('TAVILY_AUTH_ERROR');
    if (!res.ok) throw new Error('TAVILY_ERROR');
    return await res.json();
  } catch (err) {
    if (err.message === 'TAVILY_AUTH_ERROR' || err.message === 'TAVILY_ERROR') throw err;
    throw new Error('TAVILY_ERROR');
  }
}

async function gatherContext(companyName, tavilyKey) {
  const yr  = new Date().getFullYear();
  const pyr = yr - 1;

  const searches = [
    { label: 'Business Strategy and Technology Priorities',  query: `${companyName} technology strategy priorities ${pyr} ${yr}`,                      fbTok: 800  },
    { label: 'Regulatory and Compliance Obligations',        query: `${companyName} regulatory compliance cybersecurity data protection obligations`,     fbTok: 800  },
    { label: 'Cloud and IT Infrastructure',                  query: `${companyName} cloud infrastructure data center architecture IT systems`,            fbTok: 800  },
    { label: 'Enterprise Systems and Legacy Applications',   query: `${companyName} enterprise systems billing ERP CRM operations deployment`,            fbTok: 1200 },
    { label: 'Security Architecture and Operations',         query: `${companyName} cybersecurity security operations threat detection incident response`, fbTok: 800  },
    { label: 'AI Data and Analytics Maturity',               query: `${companyName} artificial intelligence data platform analytics machine learning`,    fbTok: 800  },
    { label: 'Microsoft and Enterprise Software Footprint',  query: `${companyName} Microsoft 365 enterprise software licensing deployment`,              fbTok: 800  },
    { label: 'Workforce Operations and Scale',               query: `${companyName} workforce employees operations regional scale`,                       fbTok: 800  },
    { label: 'Contact Centre and Customer Operations',       query: `${companyName} contact centre customer service operations platform`,                 fbTok: 800  },
  ];

  const raw = await Promise.all(searches.map(s => tavilySearch(s.query, tavilyKey)));

  const urlOwner = new Map();
  raw.forEach((res, sIdx) => {
    if (!res?.results) return;
    res.results.forEach(r => {
      if (!r.url || typeof r.score !== 'number' || r.score < 0.4) return;
      const prev = urlOwner.get(r.url);
      if (!prev || r.score > prev.score) urlOwner.set(r.url, { sectionIdx: sIdx, score: r.score });
    });
  });

  const blocks = raw.map((res, i) => {
    const { label, fbTok } = searches[i];
    const header = `[SIGNAL: ${label}]`;
    if (res?.answer?.trim()) return `${header}\n${res.answer.trim()}`;
    if (res?.results) {
      const candidate = res.results.find(
        r => r.score >= 0.4 && urlOwner.get(r.url)?.sectionIdx === i && r.content,
      );
      if (candidate) return `${header}\n${truncateToTokens(candidate.content, fbTok)}`;
    }
    return `${header}\n${TAVILY_FALLBACK}`;
  });

  return [
    '[Note: each source URL appears only once across all signal sections.',
    'Repeated mention of the same company initiative reflects search overlap,',
    'not independent corroboration — weight each claim once.]',
    '',
    blocks.join('\n\n'),
  ].join('\n');
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

async function claudeCall(systemPrompt, userContent, apiKey, model) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type':      'application/json',
    },
    body: JSON.stringify({
      model:      resolveModelId(model),
      max_tokens: 8000,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    const errMarkers = { 401: 'ANTHROPIC_AUTH_ERROR', 402: 'ANTHROPIC_PAYMENT_ERROR', 429: 'ANTHROPIC_RATE_LIMIT_ERROR', 500: 'ANTHROPIC_SERVER_ERROR' };
    throw new Error(errMarkers[res.status] || `ANTHROPIC_HTTP_${res.status}`);
  }

  const data = await res.json();
  const text = data.content?.find(b => b.type === 'text')?.text ?? '';
  return stripFences(text);
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildProfilePrompt(companyName, context, ownedProducts) {
  const ownedSet   = new Set(ownedProducts);
  const unowned    = PRODUCTS.filter(p => !ownedSet.has(p.name));
  const unownedStr = unowned.map(p => `${p.name} (${p.category})`).join(', ');
  const ownedStr   = ownedProducts.length ? ownedProducts.join(', ') : 'None';

  const system = `You are a senior Microsoft enterprise sales strategist with 15 years of \
experience closing complex deals across the Gulf, Levant, and North Africa. \
You think like a McKinsey consultant but write like someone who has sat \
across the table from a UAE bank's CISO and a Saudi telco's CFO. Your \
recommendations are always specific, always defensible, and always \
connected to something real about the company you are analysing — never \
generic, never padded.

Your output will be used directly by a channel partner in a customer meeting.`;

  const user = `YOUR TASK:
Analyse the company below and return:
1. An implementation-focused company profile
2. A propensity score (0–100) with written rationale for every unowned product — rationale must be specific to this company, not a generic product pitch

The intelligence below comes from 9 targeted web searches. These plus your own training knowledge of the company, Microsoft products, and the MEA market are your sole intelligence sources. Reason from what is present, score conservatively where signals are absent.

THREE-STAGE REASONING:

Stage 1 — Build the business picture
Synthesise industry position, growth stage, financial health, leadership priorities, incumbent vendors, regulatory environment, and regional context. Hiring patterns, news, and competitor displacement data are the most reliable indicators of IT maturity. Do not score anything yet.

If company-specific signals are sparse, use these fallbacks in order:

Regulatory air cover: identify the top 3 compliance mandates for this company's industry and country (e.g. SAMA Cyber Framework for Saudi financial institutions, CBUAE requirements for UAE banks) and treat them as baseline signals. Map Microsoft products as the de facto solution to each mandate. Label these as regulatory inference.

Peer-group extrapolation: identify standard technology debt common to this company's sector and size tier in the MEA market (e.g. fragmented legacy ERPs in mid-sized construction firms, on-premises file servers in family-owned conglomerates) and treat these as baseline inferences. Label them clearly as peer-group inference, not confirmed signals.

Stage 2 — Identify technology gaps
Identify what is missing, outdated, creating business risk, or limiting growth. For each gap, classify its pressure type:
- Regulatory: a specific law or framework creates a measurable control gap — highest urgency
- Competitive: peers or sector trends create risk of falling behind — strong urgency
- Operational: a specific inefficiency or cost the product directly removes — valid standalone
- Strategic: a public ambition this product enables — valid standalone

Regulatory pressure amplifies a valid business case — it is not a prerequisite for a high score. Operational and strategic gaps score on their own merit. Score each gap on strength first, pressure type as modifier.

If signals indicate downsizing, budget pressure, cost reduction programmes, or cloud repatriation, set implementationReadiness to Low and flag the specific signal in keyBusinessChallenges.

Stage 3 — Map gaps to products and score
Score each unowned product on how directly it addresses an identified gap. Regulatory gap = Very High. Useful but no identified gap = Low.

RATIONALE RULES:
Write a single compressed paragraph per product. This paragraph is the sales brief a channel partner reads immediately before a customer conversation — it must be specific, punchy, and free of filler. No generic product descriptions. Every sentence must earn its place.

The paragraph must weave together all of the following angles that are relevant and evidenced for this specific customer:

- Signal: the specific intelligence that makes this product relevant — a regulation, an incumbent system, a hiring pattern, a strategic announcement, an operational gap, or a technology dependency. Name it explicitly
- Regulatory: if a specific law or framework creates a control gap this product closes, name the regulation, the specific requirement, and the specific control the product provides
- Incumbent displacement: if this product displaces a named system already in use, name the incumbent and state why displacement is viable now
- Technology dependency: if this product depends on or is enabled by another product the customer already owns or is being recommended, name that product and the specific dependency
- CTO case: what specific technical problem does this solve or what does it unlock — one concrete statement
- CFO case: what does this cost less than, replace, or avoid — one concrete statement anchored in a published benchmark or a directional argument if no verified figure exists. Never fabricate a number
- CISO case: if applicable, what specific regulatory requirement does this satisfy and what specific control does it provide

Not every angle applies to every product. Include only what is evidenced and relevant. Omit angles that would require fabrication or padding.

Do not end the paragraph with a full stop.
Similar rationale across companies in the same industry is acceptable when driven by a shared regulation or sector-wide condition — specificity comes from naming the regulation, the company's current compliance posture, and the specific control gap.

SPARSE CONTEXT RULE:
If context is thin, score conservatively and set dataConfidence to Low. A low-confidence honest score is more valuable than a high-confidence fabricated one.

OWNERSHIP VERIFICATION:
If any signal across all context sections confirms a Microsoft product deployment that does not appear in the OWNED PRODUCTS list, include it in the signals array with confidence reflecting the source quality and this exact note: "Not marked as owned — verify with customer"

SCORING RUBRIC:
${SCORING_RUBRIC}

CROSS-SELL TRIGGER MAP:
${CROSS_SELL_MAP}

OWNED PRODUCTS (exclude from scoring): ${ownedStr}
UNOWNED PRODUCTS (score all): ${unownedStr}

Signals array: populate with each key claim, its source, and confidence:
- High: multiple independent sources
- Medium: single credible source
- Low: inferred from one indirect or outdated mention

Do not end any text field with a full stop.
Use sentence case for all text fields — proper nouns, product names, company names, regulations, and acronyms are the only exceptions.
itMaturityLevel must be exactly one of: High, Moderate, Low.
For currentTechStack, use exact product names from the OWNED PRODUCTS and UNOWNED PRODUCTS lists for any Microsoft products identified (e.g. "Microsoft 365 E3/E5", "Microsoft Teams", "Dynamics 365 Sales"). Use free-form strings only for non-Microsoft products and unconfirmed infrastructure.

Respond ONLY in valid JSON. No preamble. No markdown fences.

{
  "companyProfile": {
    "website": "",
    "industry": "", "subIndustry": "", "estimatedSize": "",
    "hqLocation": "", "operatingRegions": [],
    "currentTechStack": [], "itMaturityLevel": "",
    "keyBusinessChallenges": [], "implementationReadiness": "",
    "summary": "", "dataConfidence": "",
    "signals": [{ "claim": "", "source": "", "confidence": "", "note": "" }]
  },
  "productScores": [
    { "product": "", "category": "", "score": 0, "label": "", "rationale": "" }
  ]

label must be exactly one of: Very High, High, Moderate, Low.
}

Return productScores sorted descending by score.

COMPANY NAME: ${companyName}
COMPANY CONTEXT:
${context}`;

  return { system, user };
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

async function runPipeline({ companyName, ownedProducts, anthropicKey, tavilyKey, model }) {
  const context = await gatherContext(companyName, tavilyKey);

  const { system: sys1, user: user1 } = buildProfilePrompt(companyName, context, ownedProducts);
  const raw1 = await claudeCall(sys1, user1, anthropicKey, model);

  let call1;
  try {
    call1 = JSON.parse(raw1);
  } catch {
    throw new Error('Something went wrong — Claude returned unparseable JSON, check Anthropic API details');
  }
  if (!call1.companyProfile || !Array.isArray(call1.productScores)) {
    throw new Error('Something went wrong — Claude response is missing required fields');
  }

  const productScores = call1.productScores.map(ps => ({
    ...ps,
    label: labelFromScore(Number(ps.score) || 0),
  }));

  return {
    companyProfile: stripPeriods(call1.companyProfile),
    productScores:  stripPeriods(productScores),
    modelVersion:   model,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return;

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return;
  }

  const {
    companyName,
    ownedProducts = [],
    anthropicKey,
    tavilyKey,
    netlifyKey,
    model      = 'sonnet',
    customerId,
  } = body;

  // customerId and netlifyKey are required to initialise the store —
  // without them there is nowhere to write errors, so return early
  if (!customerId?.trim()) return;
  if (!netlifyKey?.trim()) return;

  const store = getStore({ name: BLOB_STORE, consistency: 'strong', siteID: process.env.SITE_ID, token: netlifyKey.trim() });

  // Validate — write errors to Blobs so the poller surfaces them to the user
  if (!companyName?.trim()) {
    await store.set(customerId, JSON.stringify({ status: 'error', error: 'companyName is required' }));
    return;
  }
  if (!anthropicKey?.trim()) {
    await store.set(customerId, JSON.stringify({ status: 'error', error: 'Something went wrong — input Anthropic API details and try again' }));
    return;
  }
  if (!tavilyKey?.trim()) {
    await store.set(customerId, JSON.stringify({ status: 'error', error: 'Something went wrong — input Tavily API details and try again' }));
    return;
  }

  try {
    const result = await runPipeline({
      companyName:   companyName.trim(),
      ownedProducts: Array.isArray(ownedProducts) ? ownedProducts : [],
      anthropicKey:  anthropicKey.trim(),
      tavilyKey:     tavilyKey.trim(),
      model:         ['sonnet', 'opus'].includes(model) ? model : 'sonnet',
    });

    await store.set(customerId, JSON.stringify({ status: 'complete', result }));
  } catch (err) {
    const userMsg = ERROR_MESSAGES[err.message] || err.message || 'Something went wrong — try again';
    await store.set(customerId, JSON.stringify({ status: 'error', error: userMsg }));
  }
};