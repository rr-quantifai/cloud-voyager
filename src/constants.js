// ─── Categories ───────────────────────────────────────────────────────────────

export const CATEGORIES = ['Cloud', 'Modern Work', 'Security', 'AI', 'BizApps']

// ─── Product Catalogue ────────────────────────────────────────────────────────
// Ordered entry → advanced within each category

export const PRODUCTS_BY_CATEGORY = {
  'Cloud': [
    'Azure Virtual Machines',
    'Azure SQL and Cosmos DB',
    'Azure Storage and Data Lake',
    'Azure App Service',
    'Azure Kubernetes Service',
  ],
  'Modern Work': [
    'Microsoft 365 E3/E5',
    'Microsoft Teams',
    'SharePoint Online',
    'Microsoft Viva',
  ],
  'Security': [
    'Microsoft Entra ID',
    'Microsoft Defender for Endpoint',
    'Microsoft Defender for Cloud',
    'Microsoft Purview',
    'Microsoft Sentinel',
  ],
  'AI': [
    'Microsoft Copilot for M365',
    'Copilot Studio',
    'Azure OpenAI Service',
    'Azure AI Studio',
    'Azure Machine Learning',
  ],
  'BizApps': [
    'Power Platform',
    'Dynamics 365 Sales',
    'Dynamics 365 Finance and Operations',
  ],
}

// ─── Category Accent Colours ──────────────────────────────────────────────────

export const CATEGORY_CLASSES = {
  'Cloud':       { bg: 'bg-blue-100',    text: 'text-blue-700'    },
  'Modern Work': { bg: 'bg-violet-100',  text: 'text-violet-700'  },
  'Security':    { bg: 'bg-rose-100',    text: 'text-rose-700'    },
  'AI':          { bg: 'bg-amber-100',   text: 'text-amber-700'   },
  'BizApps':     { bg: 'bg-emerald-100', text: 'text-emerald-700' },
}

/**
 * Derives categoryStages from a list of owned product names.
 * Active   = ≥1 product owned in the category
 * Established = all products owned in the category
 * Not Started = none owned
 * @param {string[]} ownedProducts
 * @returns {{ [category: string]: string }}
 */
export function computeCategoryStages(ownedProducts) {
  const owned = new Set(ownedProducts)
  return Object.fromEntries(
    CATEGORIES.map(cat => {
      const all = PRODUCTS_BY_CATEGORY[cat]
      const ownedCount = all.filter(p => owned.has(p)).length
      let stage = 'Not Started'
      if (ownedCount === all.length) stage = 'Established'
      else if (ownedCount > 0)       stage = 'Active'
      return [cat, stage]
    })
  )
}

// ─── UI Constants ─────────────────────────────────────────────────────────────

export const PAGE_SIZE = 25

export const BUTTON_H = 'h-9'

// ─── IndexedDB Store Names ────────────────────────────────────────────────────

export const DB_NAME    = 'cloud-voyager'
export const DB_VERSION = 1

export const STORES = {
  CUSTOMERS: 'customers',
  ANALYSES:  'analyses',
  SETTINGS:  'settings',
}

// ─── Settings Key ─────────────────────────────────────────────────────────────

export const SETTINGS_KEY = 'apiKeys'
