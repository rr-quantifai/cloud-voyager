'use strict';

// ============================================================
// netlify/functions/analyze-background.js
//
// Netlify Background Function — the -background suffix tells
// Netlify to return 202 immediately and run this handler
// asynchronously for up to 15 minutes.
//
// Routes to Stage 1 or Stage 2 pipeline based on `stage` in
// the request body. Results are written to Netlify Blobs.
// The browser polls /fn/analyze-status to retrieve them.
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
  { name: 'Microsoft Intune',                        category: 'Security'    },
  { name: 'Microsoft Defender for Cloud',            category: 'Security'    },
  { name: 'Microsoft Purview',                       category: 'Security'    },
  { name: 'Microsoft Sentinel',                      category: 'Security'    },
  { name: 'Microsoft Copilot for M365',              category: 'AI'          },
  { name: 'Copilot Studio',                          category: 'AI'          },
  { name: 'Azure OpenAI Service',                    category: 'AI'          },
  { name: 'Azure AI Studio',                         category: 'AI'          },
  { name: 'Azure Machine Learning',                  category: 'AI'          },
  { name: 'Microsoft Fabric',                        category: 'AI'          },
  { name: 'Power Platform',                          category: 'BizApps'     },
  { name: 'Dynamics 365 Sales',                      category: 'BizApps'     },
  { name: 'Dynamics 365 Customer Service',           category: 'BizApps'     },
  { name: 'Dynamics 365 Finance and Operations',     category: 'BizApps'     },
];

// ── Microsoft product alias map ───────────────────────────────────────────────
// Lowercase aliases → exact catalogue SKU names.
// Covers abbreviations, rebranded names, and component names that roll up to a SKU.
// Used in post-processing to resolve Claude's near-misses without burdening the prompt.

const MS_PRODUCT_ALIASES = {
  // Azure Virtual Machines
  'azure virtual machine':             'Azure Virtual Machines',
  'azure vms':                         'Azure Virtual Machines',
  'azure vm':                          'Azure Virtual Machines',
  'azure iaas':                        'Azure Virtual Machines',
  'azure compute':                     'Azure Virtual Machines',
  'azure cloud servers':               'Azure Virtual Machines',
  'azure servers':                     'Azure Virtual Machines',
  'azure cloud infrastructure':        'Azure Virtual Machines',

  // Azure SQL and Cosmos DB
  'azure sql':                         'Azure SQL and Cosmos DB',
  'azure sql database':                'Azure SQL and Cosmos DB',
  'azure database':                    'Azure SQL and Cosmos DB',
  'cosmos db':                         'Azure SQL and Cosmos DB',
  'cosmosdb':                          'Azure SQL and Cosmos DB',
  'azure cosmos':                      'Azure SQL and Cosmos DB',
  'azure cosmos db':                   'Azure SQL and Cosmos DB',
  'azure nosql':                       'Azure SQL and Cosmos DB',
  'azure managed database':            'Azure SQL and Cosmos DB',
  'sql on azure':                      'Azure SQL and Cosmos DB',

  // Azure Storage and Data Lake
  'azure storage':                     'Azure Storage and Data Lake',
  'azure blob storage':                'Azure Storage and Data Lake',
  'azure blob':                        'Azure Storage and Data Lake',
  'azure data lake':                   'Azure Storage and Data Lake',
  'adls':                              'Azure Storage and Data Lake',
  'azure data lake storage':           'Azure Storage and Data Lake',
  'azure file storage':                'Azure Storage and Data Lake',
  'azure object storage':              'Azure Storage and Data Lake',
  'azure storage account':             'Azure Storage and Data Lake',

  // Azure App Service
  'azure web apps':                    'Azure App Service',
  'azure web app':                     'Azure App Service',
  'azure paas':                        'Azure App Service',
  'azure web hosting':                 'Azure App Service',
  'azure function apps':               'Azure App Service',
  'azure functions':                   'Azure App Service',
  'azure logic apps':                  'Azure App Service',

  // Azure Kubernetes Service
  'aks':                               'Azure Kubernetes Service',
  'kubernetes on azure':               'Azure Kubernetes Service',
  'azure containers':                  'Azure Kubernetes Service',
  'azure container service':           'Azure Kubernetes Service',
  'azure container instances':         'Azure Kubernetes Service',
  'azure microservices':               'Azure Kubernetes Service',
  'azure k8s':                         'Azure Kubernetes Service',
  'azure container registry':          'Azure Kubernetes Service',

  // Microsoft 365 E3/E5
  'microsoft 365':                     'Microsoft 365 E3/E5',
  'm365':                              'Microsoft 365 E3/E5',
  'office 365':                        'Microsoft 365 E3/E5',
  'o365':                              'Microsoft 365 E3/E5',
  'exchange online':                   'Microsoft 365 E3/E5',
  'microsoft exchange':                'Microsoft 365 E3/E5',
  'microsoft email':                   'Microsoft 365 E3/E5',
  'microsoft outlook':                 'Microsoft 365 E3/E5',
  'outlook online':                    'Microsoft 365 E3/E5',
  'microsoft office':                  'Microsoft 365 E3/E5',
  'office suite':                      'Microsoft 365 E3/E5',
  'microsoft productivity':            'Microsoft 365 E3/E5',
  'microsoft 365 e3':                  'Microsoft 365 E3/E5',
  'microsoft 365 e5':                  'Microsoft 365 E3/E5',
  'office 365 e3':                     'Microsoft 365 E3/E5',
  'office 365 e5':                     'Microsoft 365 E3/E5',
  'microsoft 365 business':            'Microsoft 365 E3/E5',

  // Microsoft Teams
  'ms teams':                          'Microsoft Teams',
  'teams calling':                     'Microsoft Teams',
  'teams meetings':                    'Microsoft Teams',
  'teams voice':                       'Microsoft Teams',
  'teams phone':                       'Microsoft Teams',
  'microsoft teams rooms':             'Microsoft Teams',
  'teams premium':                     'Microsoft Teams',
  'microsoft teams premium':           'Microsoft Teams',

  // SharePoint Online
  'sharepoint':                        'SharePoint Online',
  'microsoft sharepoint':              'SharePoint Online',
  'sp online':                         'SharePoint Online',
  'microsoft intranet':                'SharePoint Online',
  'sharepoint intranet':               'SharePoint Online',
  'sharepoint on-premises':            'SharePoint Online',
  'sharepoint farm':                   'SharePoint Online',
  'sharepoint server':                 'SharePoint Online',

  // Microsoft Viva
  'viva':                              'Microsoft Viva',
  'microsoft viva':                    'Microsoft Viva',
  'viva insights':                     'Microsoft Viva',
  'viva engage':                       'Microsoft Viva',
  'viva learning':                     'Microsoft Viva',
  'viva connections':                  'Microsoft Viva',
  'viva suite':                        'Microsoft Viva',
  'microsoft employee experience':     'Microsoft Viva',

  // Microsoft Entra ID
  'microsoft entra':                   'Microsoft Entra ID',
  'entra id':                          'Microsoft Entra ID',
  'azure active directory':            'Microsoft Entra ID',
  'azure ad':                          'Microsoft Entra ID',
  'aad':                               'Microsoft Entra ID',
  'azure ad b2c':                      'Microsoft Entra ID',
  'azure ad b2b':                      'Microsoft Entra ID',
  'microsoft identity platform':       'Microsoft Entra ID',
  'microsoft identity':                'Microsoft Entra ID',
  'microsoft sso':                     'Microsoft Entra ID',
  'microsoft mfa':                     'Microsoft Entra ID',
  'microsoft conditional access':      'Microsoft Entra ID',
  'ems e3':                            'Microsoft Entra ID',
  'ems e5':                            'Microsoft Entra ID',
  'enterprise mobility + security e3': 'Microsoft Entra ID',
  'enterprise mobility + security e5': 'Microsoft Entra ID',
  'enterprise mobility and security e3': 'Microsoft Entra ID',
  'enterprise mobility and security e5': 'Microsoft Entra ID',

  // Microsoft Defender for Endpoint
  'defender for endpoint':             'Microsoft Defender for Endpoint',
  'mde':                               'Microsoft Defender for Endpoint',
  'microsoft endpoint protection':     'Microsoft Defender for Endpoint',
  'microsoft edr':                     'Microsoft Defender for Endpoint',
  'windows defender atp':              'Microsoft Defender for Endpoint',
  'mdatp':                             'Microsoft Defender for Endpoint',
  'microsoft endpoint security':       'Microsoft Defender for Endpoint',

  // Microsoft Defender for Cloud
  'azure security center':             'Microsoft Defender for Cloud',
  'asc':                               'Microsoft Defender for Cloud',
  'azure defender':                    'Microsoft Defender for Cloud',
  'microsoft cspm':                    'Microsoft Defender for Cloud',
  'microsoft cloud security posture':  'Microsoft Defender for Cloud',

  // Microsoft Intune
  'microsoft intune':                  'Microsoft Intune',
  'intune':                            'Microsoft Intune',
  'microsoft endpoint manager':        'Microsoft Intune',
  'microsoft mem':                     'Microsoft Intune',
  'microsoft mdm':                     'Microsoft Intune',
  'microsoft mobile device management': 'Microsoft Intune',

  // Microsoft Purview
  'azure purview':                     'Microsoft Purview',
  'microsoft data governance':         'Microsoft Purview',
  'microsoft compliance':              'Microsoft Purview',
  'microsoft information protection':  'Microsoft Purview',
  'mip':                               'Microsoft Purview',
  'microsoft dlp':                     'Microsoft Purview',
  'microsoft data catalog':            'Microsoft Purview',
  'microsoft compliance center':       'Microsoft Purview',
  'office 365 compliance':             'Microsoft Purview',
  'microsoft data classification':     'Microsoft Purview',
  'azure information protection':      'Microsoft Purview',
  'azure information protection p1':   'Microsoft Purview',
  'azure information protection p2':   'Microsoft Purview',
  'aip':                               'Microsoft Purview',
  'microsoft priva':                   'Microsoft Purview',
  'priva privacy risk management':     'Microsoft Purview',
  'priva subject rights':              'Microsoft Purview',

  // Microsoft Sentinel
  'azure sentinel':                    'Microsoft Sentinel',
  'microsoft siem':                    'Microsoft Sentinel',
  'microsoft soc platform':            'Microsoft Sentinel',
  'microsoft threat detection':        'Microsoft Sentinel',
  'microsoft security analytics':      'Microsoft Sentinel',

  // Microsoft Copilot for M365
  'copilot for microsoft 365':         'Microsoft Copilot for M365',
  'copilot for m365':                  'Microsoft Copilot for M365',
  'm365 copilot':                      'Microsoft Copilot for M365',
  'microsoft 365 copilot':             'Microsoft Copilot for M365',
  'copilot in teams':                  'Microsoft Copilot for M365',
  'copilot in word':                   'Microsoft Copilot for M365',
  'copilot in excel':                  'Microsoft Copilot for M365',
  'microsoft ai assistant':            'Microsoft Copilot for M365',
  'copilot for sales':                 'Microsoft Copilot for M365',
  'microsoft 365 copilot for sales':   'Microsoft Copilot for M365',
  'sales copilot':                     'Microsoft Copilot for M365',
  'copilot for service':               'Microsoft Copilot for M365',
  'microsoft 365 copilot for service': 'Microsoft Copilot for M365',

  // Copilot Studio
  'power virtual agents':              'Copilot Studio',
  'pva':                               'Copilot Studio',
  'microsoft chatbot':                 'Copilot Studio',
  'microsoft bot framework':           'Copilot Studio',
  'microsoft virtual agent':           'Copilot Studio',
  'microsoft conversational ai':       'Copilot Studio',

  // Azure OpenAI Service
  'azure openai':                      'Azure OpenAI Service',
  'openai on azure':                   'Azure OpenAI Service',
  'gpt on azure':                      'Azure OpenAI Service',
  'chatgpt on azure':                  'Azure OpenAI Service',
  'azure gpt':                         'Azure OpenAI Service',
  'microsoft generative ai':           'Azure OpenAI Service',
  'azure generative ai':               'Azure OpenAI Service',
  'azure llm':                         'Azure OpenAI Service',
  'azure openai reservation':          'Azure OpenAI Service',
  'azure openai provisioned':          'Azure OpenAI Service',
  'azure openai provisioned managed':  'Azure OpenAI Service',

  // Azure AI Studio
  'azure ai studio':                   'Azure AI Studio',
  'microsoft ai studio':               'Azure AI Studio',
  'azure ai foundry':                  'Azure AI Studio',

  // Azure Machine Learning
  'azure ml':                          'Azure Machine Learning',
  'aml':                               'Azure Machine Learning',
  'microsoft ml platform':             'Azure Machine Learning',
  'machine learning on azure':         'Azure Machine Learning',
  'azure mlops':                       'Azure Machine Learning',
  'azure machine learning studio':     'Azure Machine Learning',

  // Microsoft Fabric
  'microsoft fabric':                  'Microsoft Fabric',
  'fabric capacity':                   'Microsoft Fabric',
  'azure synapse':                     'Microsoft Fabric',
  'azure synapse analytics':           'Microsoft Fabric',

  // Power Platform
  'microsoft power platform':          'Power Platform',
  'power bi':                          'Power Platform',
  'power apps':                        'Power Platform',
  'powerapps':                         'Power Platform',
  'power automate':                    'Power Platform',
  'microsoft flow':                    'Power Platform',
  'power bi premium':                  'Power Platform',
  'power bi desktop':                  'Power Platform',
  'microsoft rpa':                     'Power Platform',
  'microsoft low-code':                'Power Platform',
  'microsoft low code':                'Power Platform',

  // Dynamics 365 Sales
  'dynamics crm':                      'Dynamics 365 Sales',
  'd365 sales':                        'Dynamics 365 Sales',
  'dynamics 365 crm':                  'Dynamics 365 Sales',
  'microsoft crm':                     'Dynamics 365 Sales',
  'dynamics sales':                    'Dynamics 365 Sales',
  'microsoft dynamics crm':            'Dynamics 365 Sales',
  'dynamics 365 customer engagement':  'Dynamics 365 Sales',

  // Dynamics 365 Customer Service
  'dynamics 365 customer service':     'Dynamics 365 Customer Service',
  'd365 customer service':             'Dynamics 365 Customer Service',
  'dynamics customer service':         'Dynamics 365 Customer Service',

  // Dynamics 365 Finance and Operations
  'dynamics 365 finance':              'Dynamics 365 Finance and Operations',
  'dynamics 365 operations':           'Dynamics 365 Finance and Operations',
  'd365 f&o':                          'Dynamics 365 Finance and Operations',
  'd365 fo':                           'Dynamics 365 Finance and Operations',
  'dynamics ax':                       'Dynamics 365 Finance and Operations',
  'dynamics nav':                      'Dynamics 365 Finance and Operations',
  'microsoft erp':                     'Dynamics 365 Finance and Operations',
  'dynamics 365 business central':     'Dynamics 365 Finance and Operations',
  'microsoft dynamics ax':             'Dynamics 365 Finance and Operations',
  'microsoft dynamics nav':            'Dynamics 365 Finance and Operations',
  'd365 finance':                      'Dynamics 365 Finance and Operations',
  'dynamics 365 supply chain management': 'Dynamics 365 Finance and Operations',
  'dynamics supply chain management':  'Dynamics 365 Finance and Operations',
  'dynamics 365 scm':                  'Dynamics 365 Finance and Operations',
  'd365 scm':                          'Dynamics 365 Finance and Operations',
};

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

Microsoft Intune
  Very High: regulated industry (finance, healthcare, government) with BYOD or distributed workforce programme
  High: Microsoft Defender for Endpoint already owned
  High: M365 E3/E5 owned (Intune typically bundled but not activated)
  High: hybrid work or remote workforce expansion signalled
  Moderate: endpoint management or MDM migration programme evident
  Reduce: fewer than 200 employees or fully office-bound workforce

Microsoft Defender for Cloud
  Very High: Azure IaaS owned, or confirmed multi-cloud environment (including non-Azure clouds)
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

Microsoft Fabric
  Very High: Power BI already owned and data engineering team or analytics investment present
  Very High: Azure Synapse Analytics or Azure Data Factory in use
  High: AI adoption announced and data infrastructure is the stated gap
  High: financial services, retail, or manufacturing with advanced analytics signals
  Moderate: BI consolidation or data platform modernisation programme signalled
  Reduce: no existing data infrastructure or very low IT maturity

Dynamics 365 Sales
  High: CRM in use (Salesforce, SAP CRM, HubSpot)
  High: Power Platform already owned
  Moderate: complex sales processes or partner channels

Dynamics 365 Customer Service
  Very High: legacy contact centre platform in use (Avaya, Cisco, Genesys, Salesforce Service Cloud, Zendesk)
  High: Dynamics 365 Sales already owned
  High: Power Platform already owned
  High: large B2C operation with high customer interaction volume
  Moderate: customer experience transformation programme publicly signalled
  Reduce: B2B-only operation with no direct customer service function

Dynamics 365 Finance and Operations
  High: SAP, Oracle ERP, or legacy Dynamics AX or NAV in use
  High: multi-entity or multi-country financial operations
  Reduce: small or single-market operator

Power Platform
  High: any M365 or Dynamics 365 product already owned
  High: BI or reporting investments
  Moderate: manual workflow or approval processes
`.trim();

// ── Scoring framework ─────────────────────────────────────────────────────────

const SCORING_FRAMEWORK = `
BASE SCORES — use the strongest single signal as the starting point:
  No relevant signals found → 10
  Strongest signal is Moderate → 38
  Strongest signal is High → 60
  Strongest signal is Very High → 80

UPWARD ADJUSTMENTS — apply each once if evidenced, cumulative cap +20:
  Second distinct High or Very High signal → +8
  Each additional distinct signal beyond two → +4
  Active cross-sell trigger: owned product creates a direct technical dependency → +6
  Specific named regulation creates a control gap this product closes → +8

DOWNWARD ADJUSTMENTS — apply each once if evidenced:
  Budget reduction or cost-cutting programme signalled → −15
  Key product dependency unmet and not in recommended products → −20
  Competing product locked in under confirmed multi-year contract → −15
  Cloud repatriation or explicit on-premises mandate signalled → −10

HARD OVERRIDES:
  Product explicitly prohibited by customer regulation or policy → score = 5
  Score ceiling: 95 — do not assign 96–100
`.trim();

// ── Cross-sell trigger map ────────────────────────────────────────────────────

const CROSS_SELL_MAP = `
If customer owns any Azure Cloud product → High propensity for: Microsoft Defender for Cloud, Microsoft Sentinel, Azure OpenAI Service, Microsoft Fabric
If customer owns Microsoft 365 E3/E5 → High propensity for: Microsoft Copilot for M365, Microsoft Purview, Microsoft Defender for Endpoint, Microsoft Intune
If customer owns Microsoft Teams → High propensity for: Microsoft Viva, Copilot Studio, SharePoint Online
If customer owns Azure OpenAI Service → High propensity for: Azure AI Studio, Azure Machine Learning, Copilot Studio, Microsoft Fabric
If customer owns Dynamics 365 Sales or Dynamics 365 Finance and Operations → High propensity for: Copilot Studio, Power Platform, Microsoft Entra ID, Dynamics 365 Customer Service
If customer owns Dynamics 365 Customer Service → High propensity for: Copilot Studio, Power Platform, Microsoft Copilot for M365
If customer owns Power Platform → High propensity for: Dynamics 365 Sales, Dynamics 365 Customer Service, Copilot Studio, Azure SQL and Cosmos DB
If customer owns Microsoft Sentinel → High propensity for: Microsoft Purview, Microsoft Defender for Cloud
If customer owns Microsoft Entra ID → High propensity for: Microsoft Defender for Endpoint, Microsoft Intune, Microsoft Purview
If customer owns Microsoft Defender for Endpoint → High propensity for: Microsoft Intune, Microsoft Entra ID
If customer owns Microsoft Intune → High propensity for: Microsoft Defender for Endpoint, Microsoft Entra ID
If customer owns Microsoft Fabric → High propensity for: Azure OpenAI Service, Azure Machine Learning, Azure SQL and Cosmos DB
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
  if (model === 'opus')  return 'claude-opus-4-6';
  if (model === 'haiku') return 'claude-haiku-4-5-20251001';
  return 'claude-sonnet-4-6';
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

// Derived from PRODUCTS — recognises exact SKU strings in post-processing.
const MS_PRODUCT_SET = new Set(PRODUCTS.map(p => p.name));

// Microsoft brand/product keywords — signals containing these but unresolvable
// to a specific SKU are routed to categorySignals rather than currentTechStack.
const MS_KEYWORDS = [
  'microsoft', 'azure', 'office 365', 'exchange online', 'sharepoint',
  'dynamics', 'copilot', 'sentinel', 'purview', 'entra', 'defender',
  'power platform', 'power bi', 'power apps', 'power automate', 'viva',
  'windows 365',
];

// Substrings that mark a signal as non-commercial or unresolved.
const NOISE_PATTERNS = [
  'vendor unconfirmed', 'unspecified', 'unknown vendor',
  'private-cloud hosted', 'custom-built', 'bespoke',
  'proprietary system', 'internal application', 'internal app',
];

/**
 * Resolves a free-text signal to an exact MS catalogue SKU.
 * Pass 1: exact lookup. Pass 2: substring match for aliases > 7 chars.
 * Returns null if no alias matches.
 */
function resolveViAliasMap(signal) {
  if (typeof signal !== 'string') return null;
  const lower = signal.toLowerCase().trim();
  if (MS_PRODUCT_ALIASES[lower]) return MS_PRODUCT_ALIASES[lower];
  for (const [alias, sku] of Object.entries(MS_PRODUCT_ALIASES)) {
    if (alias.length > 7 && lower.includes(alias)) return sku;
  }
  return null;
}

/**
 * Post-processes Claude's Stage 1 tech stack output.
 * Four-pass safety net applied after the prompt:
 *   1. Exact SKU match        → keep
 *   2. Alias map hit          → replace with canonical SKU name
 *   3. MS keyword present     → move to categorySignals (unresolved MS signal)
 *   4. Noise pattern present  → move to categorySignals (non-commercial signal)
 *   5. Remainder              → keep as non-MS commercial product
 */
function postProcessTechStack(techStack, categorySignals) {
  const cleaned = [];
  const signals = Array.isArray(categorySignals) ? [...categorySignals] : [];

  for (const item of (Array.isArray(techStack) ? techStack : [])) {
    if (typeof item !== 'string' || !item.trim()) continue;
    const lower = item.toLowerCase();

    if (MS_PRODUCT_SET.has(item))                        { cleaned.push(item); continue; }

    const resolved = resolveViAliasMap(item);
    if (resolved)                                         { if (!cleaned.includes(resolved)) cleaned.push(resolved); continue; }

    if (MS_KEYWORDS.some(kw => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(item))) { signals.push(`Microsoft technology signal — specific product unresolved: ${item}`); continue; }

    if (NOISE_PATTERNS.some(p => lower.includes(p)))     { if (item.trim().length > 15) signals.push(item); continue; }

    cleaned.push(item);
  }

  return {
    currentTechStack: [...new Set(cleaned)],
    categorySignals:  [...new Set(signals)],
  };
}

// ── Tavily ────────────────────────────────────────────────────────────────────

const TAVILY_FALLBACK =
  '[No company-specific signals found — apply sector-level inference as per Stage 1 fallback instructions]';

async function tavilySearch(query, apiKey) {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query, search_depth: 'basic', include_answer: 'advanced', max_results: 10 }),
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
      if (!r.url || typeof r.score !== 'number' || r.score < 0.3) return;
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
        r => r.score >= 0.3 && urlOwner.get(r.url)?.sectionIdx === i && r.content,
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

async function gatherVerificationContext(companyName, rawList, tavilyKey) {
  // Split rawList positionally — extraction already produces well-formed product
  // names; no MS/non-MS classification needed at this stage.
  const firstBatch  = rawList.slice(0, 3).join(' ');
  const secondBatch = rawList.slice(3, 6).join(' ');

  const msQuery = firstBatch.length > 0
    ? `${companyName} ${firstBatch} deployment licensing`
    : `${companyName} Microsoft software products licensing deployment`;

  const nonMsQuery = secondBatch.length > 0
    ? `${companyName} ${secondBatch} enterprise deployment`
    : `${companyName} enterprise systems ERP CRM database applications`;

  const searches = [
    { label: 'Technology Product Verification — Batch 1',  query: msQuery,                                                                        fbTok: 800 },
    { label: 'Technology Product Verification — Batch 2',  query: nonMsQuery,                                                                      fbTok: 800 },
    { label: 'Cloud Infrastructure and Technology Stack',  query: `${companyName} cloud infrastructure technology stack architecture`,             fbTok: 800 },
  ];

  const raw = await Promise.all(searches.map(s => tavilySearch(s.query, tavilyKey)));

  const blocks = raw.map((res, i) => {
    const { label, fbTok } = searches[i];
    const header = `[VERIFICATION: ${label}]`;
    if (res?.answer?.trim()) return `${header}\n${res.answer.trim()}`;
    if (res?.results) {
      const candidate = res.results.find(r => r.score >= 0.3 && r.content);
      if (candidate) return `${header}\n${truncateToTokens(candidate.content, fbTok)}`;
    }
    return `${header}\n${TAVILY_FALLBACK}`;
  });

  return blocks.join('\n\n');
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
      max_tokens: 16000,
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

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildRawExtractionPrompt(context) {
  const system = `You are a technology intelligence analyst. Extract technology product and infrastructure names from search results. Return only a flat JSON array of strings. No analysis. No scoring. No explanation.`;

  const user = `Extract every named commercial technology product, software system, cloud service, and vendor name mentioned in the search results below. Include Microsoft products, non-Microsoft products, cloud platforms, databases, security tools, and enterprise software. Exclude generic infrastructure concepts, programming languages, frameworks, and protocols — only extract named purchasable products. Do not infer — only extract what is explicitly mentioned.

Return ONLY a valid JSON array of strings. No preamble. No markdown fences.

["product name 1", "product name 2", ...]

SEARCH RESULTS:
${context}`;

  return { system, user };
}

function buildVerifiedTechStackPrompt(companyName, context, verificationContext, rawList, ownedProducts) {
  const ownedSet   = new Set(ownedProducts);
  const unowned    = PRODUCTS.filter(p => !ownedSet.has(p.name));
  const unownedStr = unowned.map(p => p.name).join(', ');
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
Produce a verified technology stack for the company below based on two rounds of search intelligence.

ROUND 1 — Initial search (9 sources):
${context}

ROUND 2 — Verification search (3 targeted sources, queries constructed from extracted product signals):
${verificationContext}

RAW EXTRACTED TECHNOLOGY LIST (from Round 1):
${rawList.join(', ')}

TECH STACK CLASSIFICATION RULES:

A valid tech stack entry is a commercial product — something with a named vendor, a distinct product identity, and a purchasable license or subscription. If an item does not meet this definition, it does not belong in the tech stack.

Classify every technology signal into one of three buckets before inclusion. This logic applies equally to Microsoft and non-Microsoft products.

BUCKET A — Exact product name confirmed
The signal explicitly names a specific commercial product. Include it directly.
Microsoft: match to the exact catalogue name from the UNOWNED PRODUCTS list.
Non-Microsoft: use the commercial product name as stated (e.g. "Salesforce", "SAP S/4HANA", "Splunk Enterprise").

BUCKET B — Workload context exists, product is defensibly inferable
The signal names a vendor or service but also describes a specific workload or function. Map to the single most defensible product. If two products could equally serve this workload, treat as Bucket C instead.

Microsoft workload inference — map to exact catalogue name:
  Email, messaging, Exchange, Exchange Online → Microsoft 365 E3/E5
  Cloud compute, virtual servers, VMs, IaaS → Azure Virtual Machines
  Cloud storage, blob storage, data lake, object storage → Azure Storage and Data Lake
  Cloud database, SQL, Cosmos, NoSQL → Azure SQL and Cosmos DB
  Web application hosting, PaaS, app hosting → Azure App Service
  Containers, Kubernetes, microservices → Azure Kubernetes Service
  Identity, authentication, SSO, Active Directory, MFA, Zero Trust → Microsoft Entra ID
  Endpoint security, antivirus, device protection, EDR → Microsoft Defender for Endpoint
  Cloud security posture, multi-cloud security, CSPM → Microsoft Defender for Cloud
  Data governance, data classification, compliance, information protection → Microsoft Purview
  SIEM, threat detection, SOC, security analytics → Microsoft Sentinel
  AI productivity assistant, Copilot for office tasks → Microsoft Copilot for M365
  Chatbot, virtual agent, conversational AI, bot platform → Copilot Studio
  Generative AI, large language models, GPT, Azure AI → Azure OpenAI Service
  Machine learning, predictive analytics, data science → Azure Machine Learning
  AI model development platform → Azure AI Studio
  CRM, sales management, pipeline management → Dynamics 365 Sales
  Contact centre, customer service platform, customer support, helpdesk → Dynamics 365 Customer Service
  ERP, finance, operations, accounting, supply chain → Dynamics 365 Finance and Operations
  Low-code, Power BI, Power Apps, workflow automation, RPA → Power Platform
  Endpoint management, MDM, mobile device management, device compliance → Microsoft Intune
  Data platform, data lakehouse, unified analytics, data engineering, Synapse → Microsoft Fabric
  Employee experience, HR platform, workforce engagement → Microsoft Viva
  Document management, intranet, file sharing → SharePoint Online

Non-Microsoft workload inference: apply the same principle — identify the workload from context and map to the most specific commercial product that vendor offers for that workload. Examples: "SAP for HR" → SAP SuccessFactors; "SAP for finance or operations" → SAP S/4HANA; "Oracle for database" → Oracle Database; "Oracle for ERP" → Oracle Fusion.

BUCKET C — Vendor or category confirmed, workload ambiguous
The signal confirms a vendor or technology category is present but provides insufficient workload context to map defensibly to a single product. Do not add to currentTechStack. Add a concise description to categorySignals instead.
Format: "[Vendor/category] presence confirmed — specific product unknown"
Examples: "Microsoft cloud products" → "Microsoft cloud presence confirmed — specific product unknown"; "SAP across the business" → "SAP enterprise software confirmed — specific product unknown"; "uses AI tools" → "AI tooling presence confirmed — specific product unknown"

COMMERCIAL PRODUCT FILTER — apply before any bucket:
Exclude entirely (no bucket, no categorySignals): programming languages, scripting tools, frameworks, protocols, open-source libraries, and internal or bespoke applications with no external commercial vendor.

Bucket C applies to: a vendor or technology category that is confirmed but whose specific product cannot be resolved — add a concise signal to categorySignals, do not add to currentTechStack.

MICROSOFT HARD RULE: Any signal referencing Microsoft, Azure, Office, Exchange, SharePoint, Teams, Dynamics, Copilot, Sentinel, Purview, Entra, Defender, Power BI, Power Apps, or Viva that cannot be mapped to an exact name from the UNOWNED PRODUCTS list via Bucket A or Bucket B must go to categorySignals — never into currentTechStack under any non-catalogue name.

OWNED PRODUCTS (already confirmed — exclude from currentTechStack and categorySignals): ${ownedStr}
UNOWNED PRODUCTS (use exact names): ${unownedStr}

itMaturityLevel must be exactly one of: High, Moderate, Low.
dataConfidence must be exactly one of: High, Medium, Low.
currentTechStack must be a flat array of plain strings — product names only, no objects, no metadata, no bucket labels.
categorySignals must be a flat array of plain strings — signal descriptions only, no objects.
Respond ONLY in valid JSON. No preamble. No markdown fences.

{
  "website": "",
  "currentTechStack": ["product name", "product name"],
  "categorySignals": ["signal description"],
  "itMaturityLevel": "",
  "dataConfidence": ""
}

COMPANY NAME: ${companyName}`;

  return { system, user };
}

function buildProfilePrompt(companyName, context, ownedProducts, verifiedTechStack = [], categorySignals = []) {
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

THREE-STEP REASONING:
Step 1 — Build the business picture
Synthesise industry position, growth stage, financial health, leadership priorities, incumbent vendors, regulatory environment, and regional context. Hiring patterns, news, and competitor displacement data are the most reliable indicators of IT maturity. Do not score anything yet.

If company-specific signals are sparse, use these fallbacks in order:

Regulatory air cover: identify the top 3 compliance mandates for this company's industry and country (e.g. SAMA Cyber Framework for Saudi financial institutions, CBUAE requirements for UAE banks) and treat them as baseline signals. Map Microsoft products as the de facto solution to each mandate. Label these as regulatory inference.

Peer-group extrapolation: identify standard technology debt common to this company's sector and size tier in the MEA market (e.g. fragmented legacy ERPs in mid-sized construction firms, on-premises file servers in family-owned conglomerates) and treat these as baseline inferences. Label them clearly as peer-group inference, not confirmed signals.

Step 2 — Identify technology gaps
Identify what is missing, outdated, creating business risk, or limiting growth. For each gap, classify its pressure type:
- Regulatory: a specific law or framework creates a measurable control gap — highest urgency
- Competitive: peers or sector trends create risk of falling behind — strong urgency
- Operational: a specific inefficiency or cost the product directly removes — valid standalone
- Strategic: a public ambition this product enables — valid standalone

Regulatory pressure amplifies a valid business case — it is not a prerequisite for a high score. Operational and strategic gaps score on their own merit. Score each gap on strength first, pressure type as modifier.

If signals indicate downsizing, budget pressure, cost reduction programmes, or cloud repatriation, set implementationReadiness to Low and flag the specific signal in keyBusinessChallenges.

Step 3 — Map gaps to products and score
Score each unowned product on how directly it addresses an identified gap. Use the SCORING RUBRIC to identify which signals apply, then use the SCORING FRAMEWORK to translate those signals into a numeric score. Apply the framework mechanically — do not override numeric anchors with qualitative judgment.

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

Not every angle applies to every product. Include only what is evidenced and relevant. Omit angles that would require fabrication or padding. Do not include base scores, numeric adjustments, or scoring arithmetic in the rationale paragraph.

Similar rationale across companies in the same industry is acceptable when driven by a shared regulation or sector-wide condition — specificity comes from naming the regulation, the company's current compliance posture, and the specific control gap.

SPARSE CONTEXT RULE:
If context is thin, score conservatively and set dataConfidence to Low. A low-confidence honest score is more valuable than a high-confidence fabricated one.

SUMMARY RULES:
Write a single cohesive paragraph that serves as the partner's complete pre-meeting intelligence brief. This is the first thing the partner reads — it must orient them immediately and equip them for a credible opening conversation.

Weave together all of the following that are evidenced:
- Company identity: industry, sub-industry, estimated size, HQ location, operating regions
- Technology posture: IT maturity level, implementation readiness, key business challenges
- Confirmed technology environment: what they own and what it signals about their direction, competitive exposure, or upgrade path
- Category-level signals (listed under CATEGORY SIGNALS below) that could not be resolved to specific products — frame these as discovery angles, not confirmed facts
- Strategic direction: public ambitions, digital transformation programmes, regulatory pressures, AI or cloud initiatives
- What this means for the partner: what conversation to open, what to explore in discovery, what to validate on arrival

SCORING RUBRIC:
${SCORING_RUBRIC}

SCORING FRAMEWORK (numeric aggregation — apply after identifying signals from the rubric above):
${SCORING_FRAMEWORK}

CROSS-SELL TRIGGER MAP:
${CROSS_SELL_MAP}

OWNED PRODUCTS (exclude from scoring): ${ownedStr}
UNOWNED PRODUCTS (score all): ${unownedStr}

Do not end any text field with a full stop. Use sentence case for all text fields — proper nouns, product names, company names, regulations, and acronyms are the only exceptions. Write all paragraph fields in flowing prose — no bullet points, no generic observations, and every sentence must add something a partner could not infer from the company name alone.

itMaturityLevel must be exactly one of: High, Moderate, Low.

implementationReadiness must be exactly one of: High, Moderate, Low.

dataConfidence must be exactly one of: High, Medium, Low.

Respond ONLY in valid JSON. No preamble. No markdown fences.

{
  "companyProfile": {
    "website": "",
    "industry": "", "subIndustry": "", "estimatedSize": "",
    "hqLocation": "", "operatingRegions": [],
    "itMaturityLevel": "",
    "keyBusinessChallenges": [], "implementationReadiness": "",
    "summary": "", "dataConfidence": ""
  },
  "productScores": [
    { "product": "", "category": "", "score": 0, "label": "", "rationale": "" }
  ]
}

label must be exactly one of: Very High, High, Moderate, Low.

Return productScores sorted descending by score.

VERIFIED TECHNOLOGY STACK (established in Stage 1 — frozen, do not reproduce or modify in your response): ${verifiedTechStack.join(', ') || 'None confirmed'}

CATEGORY SIGNALS (confirmed in Stage 1 but could not be resolved to a specific product — weave into the summary paragraph as discovery angles, not confirmed facts):
${categorySignals.length > 0 ? categorySignals.join('\n') : 'None'}

COMPANY NAME: ${companyName}
COMPANY CONTEXT:
${context}`;

  return { system, user };
}

// ── Stage 1 pipeline ──────────────────────────────────────────────────────────

async function runStage1Pipeline({ companyName, ownedProducts, anthropicKey, tavilyKey }) {
  // Step 1 — Run 9 Tavily searches
  const context = await gatherContext(companyName, tavilyKey);

  // Step 2 — Claude Call 1: raw extraction (Haiku — no reasoning required)
  const { system: sys1, user: user1 } = buildRawExtractionPrompt(context);
  const raw1 = await claudeCall(sys1, user1, anthropicKey, 'haiku');

  let rawList;
  try {
    const parsed = JSON.parse(raw1);
    rawList = Array.isArray(parsed) ? parsed : [];
  } catch {
    rawList = [];
  }

  // Step 3 — Run 3 targeted verification searches (queries built from rawList)
  const verificationContext = await gatherVerificationContext(companyName, rawList, tavilyKey);

  // Step 4 — Claude Call 2: verified tech stack
  const { system: sys2, user: user2 } = buildVerifiedTechStackPrompt(
    companyName, context, verificationContext, rawList, ownedProducts,
  );
  const raw2 = await claudeCall(sys2, user2, anthropicKey, 'sonnet');

  let call2;
  try {
    call2 = JSON.parse(raw2);
  } catch {
    throw new Error('Something went wrong — Claude returned unparseable JSON, check Anthropic API details');
  }
  if (!call2 || typeof call2 !== 'object') {
    throw new Error('Something went wrong — Claude response is missing required fields');
  }

  const stripped = stripPeriods(call2);
  const { currentTechStack, categorySignals: processedSignals } = postProcessTechStack(
    stripped.currentTechStack || [],
    stripped.categorySignals  || [],
  );
  const companyProfile = { ...stripped, currentTechStack, categorySignals: processedSignals };

  // Step 5 — Return result for Blobs write
  return {
    companyProfile,
    categorySignals:       processedSignals,
    searchContext:         context,
    verificationContext,
    modelVersion:          'sonnet',
  };
}

// ── Stage 2 pipeline ──────────────────────────────────────────────────────────

async function runStage2Pipeline({ companyName, ownedProducts, verifiedTechStack, categorySignals, searchContext, anthropicKey }) {
  // Step 1 — No Tavily searches; use searchContext from Stage 1

  // Step 2 — Claude Call 3: full profile + propensity scoring
  const { system: sys3, user: user3 } = buildProfilePrompt(
    companyName, searchContext, ownedProducts, verifiedTechStack, categorySignals,
  );
  const raw3 = await claudeCall(sys3, user3, anthropicKey, 'opus');

  let call3;
  try {
    call3 = JSON.parse(raw3);
  } catch {
    throw new Error('Something went wrong — Claude returned unparseable JSON, check Anthropic API details');
  }
  if (!call3.companyProfile || !Array.isArray(call3.productScores)) {
    throw new Error('Something went wrong — Claude response is missing required fields');
  }

  const productScores = call3.productScores.map(ps => ({
    ...ps,
    label: labelFromScore(Number(ps.score) || 0),
  }));

  // Freeze tech stack from Stage 1 — Stage 2 never modifies it
  const frozenProfile = { ...stripPeriods(call3.companyProfile), currentTechStack: verifiedTechStack };

  // Step 3 — Return result for Blobs write
  return {
    companyProfile: frozenProfile,
    productScores:  stripPeriods(productScores),
    modelVersion:   'opus',
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
    ownedProducts                = [],
    anthropicKey,
    tavilyKey,
    netlifyKey,
    customerId,
    stage                        = 1,
    // Stage 2 specific
    verifiedTechStack = [],
    categorySignals   = [],
    searchContext     = '',
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
    const resolvedStage = stage === 2 ? 2 : 1;

    let result;
    if (resolvedStage === 1) {
      result = await runStage1Pipeline({
        companyName:   companyName.trim(),
        ownedProducts: Array.isArray(ownedProducts) ? ownedProducts : [],
        anthropicKey:  anthropicKey.trim(),
        tavilyKey:     tavilyKey.trim(),
      });
    } else {
      result = await runStage2Pipeline({
        companyName:       companyName.trim(),
        ownedProducts:     Array.isArray(ownedProducts) ? ownedProducts : [],
        verifiedTechStack: Array.isArray(verifiedTechStack) ? verifiedTechStack : [],
        categorySignals:   Array.isArray(categorySignals) ? categorySignals : [],
        searchContext:     typeof searchContext === 'string' ? searchContext : '',
        anthropicKey:      anthropicKey.trim(),
      });
    }

    await store.set(customerId, JSON.stringify({ status: 'complete', stage: resolvedStage, result }));
  } catch (err) {
    const userMsg = ERROR_MESSAGES[err.message] || err.message || 'Something went wrong — try again';
    await store.set(customerId, JSON.stringify({ status: 'error', error: userMsg }));
  }
};