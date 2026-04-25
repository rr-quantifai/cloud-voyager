// ============================================================
// SECTION 1 — IMPORTS AND ZUSTAND STORE
// ============================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { BrowserRouter, Routes, Route, Link, Outlet, Navigate, useLocation, useParams, useNavigate } from 'react-router-dom'
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table'
import { create } from 'zustand'
import Fuse from 'fuse.js'

import {
  CATEGORIES,
  PRODUCTS_BY_CATEGORY,
  CATEGORY_CLASSES,
  computeCategoryStages,
  PAGE_SIZE,
  BUTTON_H,
  MODEL_OPTIONS,
} from './constants.js'

import {
  getCustomer,
  getAllCustomers,
  createCustomer,
  putCustomer,
  getLatestAnalysis,
  putAnalysis,
  deleteAnalysesForCustomer,
  getSettings,
  saveSettings,
  clearAllData,
} from './db.js'

// ─── Zustand Store ────────────────────────────────────────────────────────────
// Exact key names as per Global State Schema

const useStore = create((set) => ({
  searchQuery:       '',
  currentPage:       1,
  isNewAnalysisOpen: false,

  setSearchQuery:       (searchQuery)       => set({ searchQuery, currentPage: 1 }),
  setCurrentPage:       (currentPage)       => set({ currentPage }),
  setIsNewAnalysisOpen: (isNewAnalysisOpen) => set({ isNewAnalysisOpen }),
}))

// ============================================================
// SECTION 2 — SETTINGS PAGE
// ============================================================

function SettingsPage() {
  const [settings, setSettings] = useState({ anthropic: '', tavily: '', model: 'sonnet' })
  const [saved, setSaved]       = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    getSettings().then(s => setSettings(s))
  }, [])

  function handleChange(field, value) {
    setSaved(false)
    setSettings(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    await saveSettings(settings)
    setSaved(true)
  }

  async function handleClearConfirmed() {
    setClearing(true)
    await clearAllData()
    window.location.reload()
  }

  const opusOption   = MODEL_OPTIONS.find(m => m.value === 'opus')
  const sonnetOption = MODEL_OPTIONS.find(m => m.value === 'sonnet')

  return (
    <div className="max-w-xl mx-auto py-10 px-4 space-y-8">

      {/* Page heading */}
      <h1 className="text-lg font-semibold text-slate-700">Settings</h1>

      {/* API Keys card */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">API Keys</h2>

        {/* Anthropic key */}
        <div className="space-y-1">
          <label className="block text-sm text-slate-700">Anthropic API key</label>
          <input
            type="password"
            value={settings.anthropic}
            onChange={e => handleChange('anthropic', e.target.value)}
            placeholder="sk-ant-…"
            className="w-full h-9 px-3 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
          />
        </div>

        {/* Tavily key */}
        <div className="space-y-1">
          <label className="block text-sm text-slate-700">Tavily API key</label>
          <input
            type="password"
            value={settings.tavily}
            onChange={e => handleChange('tavily', e.target.value)}
            placeholder="tvly-…"
            className="w-full h-9 px-3 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
          />
        </div>
      </div>

      {/* Model selector card */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Model</h2>

        {/* Sonnet option */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="model"
            value="sonnet"
            checked={settings.model === 'sonnet'}
            onChange={() => handleChange('model', 'sonnet')}
            className="mt-0.5 accent-slate-500"
          />
          <span className="space-y-0.5">
            <span className="flex items-center gap-2">
              <span className="text-sm text-slate-700">{sonnetOption.label}</span>
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                {sonnetOption.tag}
              </span>
            </span>
          </span>
        </label>

        {/* Opus option */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="model"
            value="opus"
            checked={settings.model === 'opus'}
            onChange={() => handleChange('model', 'opus')}
            className="mt-0.5 accent-slate-500"
          />
          <span className="space-y-0.5">
            <span className="text-sm text-slate-700">{opusOption.label}</span>
            <p className="text-xs text-slate-400">{opusOption.note}</p>
          </span>
        </label>
      </div>

      {/* Save button row */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className={`${BUTTON_H} px-4 rounded-md text-sm font-medium bg-slate-700 text-white hover:bg-slate-600 transition-colors`}
        >
          Save settings
        </button>
        {saved && (
          <span className="text-sm text-slate-400">Saved</span>
        )}
      </div>

      {/* Danger zone card */}
      <div className="bg-white border border-rose-200 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Danger zone</h2>
        <p className="text-sm text-slate-400">
          Permanently deletes all customers, analyses, and settings from this browser
        </p>

        {!confirmClear ? (
          <button
            onClick={() => setConfirmClear(true)}
            className={`${BUTTON_H} px-4 rounded-md text-sm font-medium bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-colors`}
          >
            Clear all data
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-700 font-medium">
              This cannot be undone — are you sure?
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClearConfirmed}
                disabled={clearing}
                className={`${BUTTON_H} px-4 rounded-md text-sm font-medium bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 transition-colors`}
              >
                {clearing ? 'Clearing…' : 'Yes, delete everything'}
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className={`${BUTTON_H} px-4 rounded-md text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors`}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

// ============================================================
// SECTION 3 — CUSTOMER LIST PAGE
// ============================================================

// ── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_ABBREV = {
  'Cloud':       'Cl',
  'Modern Work': 'MW',
  'Security':    'Sec',
  'AI':          'AI',
  'BizApps':     'BA',
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ── CategoryStagesBadges ─────────────────────────────────────────────────────

function CategoryStagesBadges({ categoryStages }) {
  return (
    <div className="flex items-center gap-1">
      {CATEGORIES.map(cat => {
        const stage = categoryStages?.[cat] ?? 'Not Started'
        const isNS  = stage === 'Not Started'
        const cc    = CATEGORY_CLASSES[cat]
        return (
          <span
            key={cat}
            title={`${cat}: ${stage}`}
            className={[
              'text-xs px-1.5 py-0.5 rounded',
              stage === 'Established' ? 'font-semibold' : 'font-normal',
              isNS ? 'bg-slate-100 text-slate-400' : `${cc.bg} ${cc.text}`,
            ].join(' ')}
          >
            {CATEGORY_ABBREV[cat]}
          </span>
        )
      })}
    </div>
  )
}

// ── NewAnalysisModal ─────────────────────────────────────────────────────────

function NewAnalysisModal({ onClose, onCreated }) {
  const navigate = useNavigate()

  const [customerId,       setCustomerId]       = useState('')
  const [customerName,     setCustomerName]     = useState('')
  const [selectedProducts, setSelectedProducts] = useState([])
  const [idError,          setIdError]          = useState(null)
  const [nameWarning,      setNameWarning]      = useState(null)
  const [nameDismissed,    setNameDismissed]    = useState(false)
  const [allCustomers,     setAllCustomers]     = useState([])
  const [submitting,       setSubmitting]       = useState(false)

  // Load all customers once for validation
  useEffect(() => { getAllCustomers().then(setAllCustomers) }, [])

  // Fuse instance for name match
  const nameFuse = useMemo(
    () => new Fuse(allCustomers, { keys: ['name'], threshold: 0.3 }),
    [allCustomers]
  )

  // Live ID validation — exact match, case-insensitive
  useEffect(() => {
    const q = customerId.trim()
    if (!q) { setIdError(null); return }
    const exists = allCustomers.some(c => c.id.toLowerCase() === q.toLowerCase())
    setIdError(exists ? 'Customer with the same ID already exists' : null)
  }, [customerId, allCustomers])

  // Live name validation — fuzzy match
  useEffect(() => {
    setNameDismissed(false)
    const q = customerName.trim()
    if (!q) { setNameWarning(null); return }
    const results = nameFuse.search(q)
    if (results.length > 0) {
      setNameWarning({ matchedId: results[0].item.id })
    } else {
      setNameWarning(null)
    }
  }, [customerName, nameFuse])

  function toggleProduct(product) {
    setSelectedProducts(prev =>
      prev.includes(product) ? prev.filter(p => p !== product) : [...prev, product]
    )
  }

  async function handleSubmit() {
    if (idError || !customerId.trim() || !customerName.trim() || submitting) return
    setSubmitting(true)
    try {
      await createCustomer({
        id:              customerId.trim(),
        name:            customerName.trim(),
        ownedProducts:   selectedProducts,
      })
      onCreated?.()
      onClose()
      navigate(`/customer/${encodeURIComponent(customerId.trim())}`)
    } catch (err) {
      setIdError(err.message)
      setSubmitting(false)
    }
  }

  const canSubmit = !idError && customerId.trim() && customerName.trim() && !submitting

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-lg border border-slate-200 w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
          <h2 className="text-sm font-semibold text-slate-700">New analysis</h2>
          <button
            onClick={onClose}
            className={`${BUTTON_H} w-9 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors`}
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto p-4 space-y-4 flex-1">

          {/* Customer ID */}
          <div className="space-y-1">
            <label className="block text-sm text-slate-700">Customer ID</label>
            <input
              type="text"
              value={customerId}
              onChange={e => setCustomerId(e.target.value)}
              placeholder="e.g. CUST-001"
              className={[
                'w-full h-9 px-3 rounded-md border text-sm text-slate-700 placeholder-slate-400 bg-slate-50',
                'focus:outline-none focus:ring-1',
                idError
                  ? 'border-rose-300 focus:ring-rose-200'
                  : 'border-slate-200 focus:ring-slate-300',
              ].join(' ')}
            />
            {idError && (
              <p className="text-xs text-rose-600">{idError}</p>
            )}
          </div>

          {/* Customer Name */}
          <div className="space-y-1">
            <label className="block text-sm text-slate-700">Customer Name</label>
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="e.g. Acme Corporation"
              className="w-full h-9 px-3 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
            />
            {nameWarning && !nameDismissed && (
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-md px-3 py-2 gap-3">
                <p className="text-xs text-amber-700">
                  Customer with a similar name already exists — {nameWarning.matchedId}
                </p>
                <button
                  onClick={() => setNameDismissed(true)}
                  className="text-xs font-medium text-amber-600 hover:text-amber-800 shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          {/* Products Purchased */}
          <div className="space-y-2">
            <label className="block text-sm text-slate-700">Products purchased</label>
            <div className="border border-slate-200 rounded-md overflow-y-auto max-h-56 p-3 space-y-4 bg-slate-50">
              {CATEGORIES.map(cat => {
                const cc = CATEGORY_CLASSES[cat]
                return (
                  <div key={cat} className="space-y-1.5">
                    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${cc.bg} ${cc.text}`}>
                      {cat}
                    </span>
                    {PRODUCTS_BY_CATEGORY[cat].map(product => (
                      <label key={product} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(product)}
                          onChange={() => toggleProduct(product)}
                          className="accent-slate-500 w-3.5 h-3.5 shrink-0"
                        />
                        <span className="text-sm text-slate-700 group-hover:text-slate-900">
                          {product}
                        </span>
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>
            {selectedProducts.length > 0 && (
              <p className="text-xs text-slate-400">
                {selectedProducts.length} product{selectedProducts.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-200 shrink-0">
          <button
            onClick={onClose}
            className={`${BUTTON_H} px-4 rounded-md text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors`}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`${BUTTON_H} px-4 rounded-md text-sm font-medium bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
          >
            {submitting ? 'Creating…' : 'Create customer'}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── CustomerListPage ─────────────────────────────────────────────────────────

function CustomerListPage() {
  const searchQuery       = useStore(s => s.searchQuery)
  const currentPage       = useStore(s => s.currentPage)
  const isNewAnalysisOpen = useStore(s => s.isNewAnalysisOpen)
  const setSearchQuery    = useStore(s => s.setSearchQuery)
  const setCurrentPage    = useStore(s => s.setCurrentPage)
  const setIsNewAnalysisOpen = useStore(s => s.setIsNewAnalysisOpen)

  const navigate = useNavigate()

  const [enriched, setEnriched] = useState([])
  const [loading,  setLoading]  = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const customers = await getAllCustomers()
    const rows = await Promise.all(
      customers.map(async c => {
        const analysis = await getLatestAnalysis(c.id)
        return {
          ...c,
          industry:     analysis?.companyProfile?.industry ?? '—',
          lastAnalyzed: analysis?.analyzedAt ?? null,
        }
      })
    )
    setEnriched(rows)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Fuse instance for name search
  const fuse = useMemo(
    () => new Fuse(enriched, { keys: ['name'], threshold: 0.35, includeScore: true }),
    [enriched]
  )

  // Filtered rows: exact ID match takes priority, then fuzzy name
  const filtered = useMemo(() => {
    const q = searchQuery.trim()
    if (!q) return enriched
    const byId = enriched.filter(c => c.id.toLowerCase() === q.toLowerCase())
    if (byId.length) return byId
    return fuse.search(q).map(r => r.item)
  }, [searchQuery, enriched, fuse])

  const columns = useMemo(() => [
    {
      accessorKey: 'id',
      header: 'Customer ID',
      cell: info => (
        <span className="text-sm text-slate-600 font-mono">{info.getValue()}</span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Customer Name',
      cell: info => (
        <span className="text-sm font-medium text-slate-700">{info.getValue()}</span>
      ),
    },
    {
      accessorKey: 'industry',
      header: 'Industry',
      cell: info => (
        <span className="text-sm text-slate-600">{info.getValue()}</span>
      ),
    },
    {
      accessorKey: 'categoryStages',
      header: 'Category Stages',
      cell: info => <CategoryStagesBadges categoryStages={info.getValue()} />,
    },
    {
      accessorKey: 'lastAnalyzed',
      header: 'Last Analyzed',
      cell: info => (
        <span className="text-sm text-slate-500">{formatDate(info.getValue())}</span>
      ),
    },
    {
      id: 'action',
      header: '',
      cell: ({ row }) => {
        const c = row.original
        return c.analysisComplete ? (
          <button
            onClick={() => navigate(`/customer/${encodeURIComponent(c.id)}`)}
            className={`${BUTTON_H} px-3 rounded-md text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors whitespace-nowrap`}
          >
            View Profile
          </button>
        ) : (
          <button
            onClick={() => navigate(`/customer/${encodeURIComponent(c.id)}`)}
            className={`${BUTTON_H} px-3 rounded-md text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors`}
          >
            Analyze
          </button>
        )
      },
    },
  ], [navigate])

  const pagination = useMemo(
    () => ({ pageIndex: currentPage - 1, pageSize: PAGE_SIZE }),
    [currentPage]
  )

  const table = useReactTable({
    data:                 filtered,
    columns,
    getCoreRowModel:      getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex:   false,
    state:                { pagination },
    onPaginationChange: updater => {
      const next = typeof updater === 'function'
        ? updater(pagination)
        : updater
      setCurrentPage(next.pageIndex + 1)
    },
  })

  const totalPages = table.getPageCount()

  return (
    <div className="p-4 space-y-4">

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-700">Customers</h1>
        <button
          onClick={() => setIsNewAnalysisOpen(true)}
          className={`${BUTTON_H} px-4 rounded-md text-sm font-medium bg-slate-700 text-white hover:bg-slate-600 transition-colors`}
        >
          New analysis
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        placeholder="Search by name or Customer ID…"
        className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
      />

      {/* Table */}
      {loading ? (
        <div className="py-16 flex justify-center">
          <span className="text-sm text-slate-400">Loading…</span>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id}>
                  {hg.headers.map(h => (
                    <th
                      key={h.id}
                      className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-12 text-center text-sm text-slate-400"
                  >
                    {searchQuery
                      ? 'No customers match your search'
                      : 'No customers yet — create your first analysis'}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={!table.getCanPreviousPage()}
              className={`${BUTTON_H} px-3 rounded-md text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={!table.getCanNextPage()}
              className={`${BUTTON_H} px-3 rounded-md text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* New Analysis Modal */}
      {isNewAnalysisOpen && (
        <NewAnalysisModal
          onClose={() => setIsNewAnalysisOpen(false)}
          onCreated={loadData}
        />
      )}

    </div>
  )
}

// ============================================================
// SECTION 4 — CUSTOMER DETAIL PAGE
// ============================================================

// ── Colour maps ─────────────────────────────────────────────

const CONF_CLS = {
  High:   'bg-emerald-100 text-emerald-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low:    'bg-rose-100 text-rose-700',
};

const LABEL_CLS = {
  'Very High': 'bg-emerald-100 text-emerald-700',
  High:        'bg-blue-100 text-blue-700',
  Medium:      'bg-amber-100 text-amber-700',
  Low:         'bg-slate-100 text-slate-500',
};

const CAT_ORDER = ['Cloud', 'Modern Work', 'Security', 'AI', 'BizApps'];

// ── Helpers ──────────────────────────────────────────────────

// Stage badge style
function stageCls(stage) {
  if (stage === 'Established') return 'bg-emerald-100 text-emerald-700';
  if (stage === 'Active')      return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-500';
}

// ── Sub-components ───────────────────────────────────────────

function TopOpportunities({ scores }) {
  if (!scores.length) return null;
  const top = [...scores].sort((a, b) => b.score - a.score).slice(0, 3);
  return (
    <section>
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Top Opportunities</h2>
      <div className="grid grid-cols-3 gap-4">
        {top.map(op => {
          const cc = CATEGORY_CLASSES[op.category] || CATEGORY_CLASSES['Cloud'];
          return (
            <div key={op.product} className="bg-white border border-slate-200 rounded p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-slate-700 leading-snug">{op.product}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${LABEL_CLS[op.label] || LABEL_CLS.Medium}`}>
                  {op.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cc.bg} ${cc.text}`}>{op.category}</span>
                <span className="text-xs text-slate-400">Score {op.score}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CompanyProfileCard({ profile }) {
  if (!profile) return null;
  return (
    <section className="bg-white border border-slate-200 rounded">
      <div className="p-4">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">Company Profile</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONF_CLS[profile.dataConfidence] || CONF_CLS.Medium}`}>
            {profile.dataConfidence} confidence
          </span>
        </div>

        <div className="grid grid-cols-3 gap-x-8 gap-y-3 text-sm mb-4">
          {profile.website && (
            <div>
              <p className="text-slate-400 text-xs mb-0.5">Website</p>
              <p className="text-slate-700">{profile.website}</p>
            </div>
          )}
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Industry</p>
            <p className="text-slate-700">
              {profile.industry}{profile.subIndustry ? ` — ${profile.subIndustry}` : ''}
            </p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Estimated Size</p>
            <p className="text-slate-700">{profile.estimatedSize}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-0.5">HQ</p>
            <p className="text-slate-700">{profile.hqLocation}</p>
          </div>
          {profile.operatingRegions?.length > 0 && (
            <div>
              <p className="text-slate-400 text-xs mb-0.5">Operating Regions</p>
              <p className="text-slate-700">{profile.operatingRegions.join(', ')}</p>
            </div>
          )}
          <div>
            <p className="text-slate-400 text-xs mb-0.5">IT Maturity</p>
            <p className="text-slate-700">{profile.itMaturityLevel}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-0.5">Implementation Readiness</p>
            <p className="text-slate-700">{profile.implementationReadiness}</p>
          </div>
        </div>

        {profile.currentTechStack?.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-slate-400 mb-1.5">Current Tech Stack</p>
            <div className="flex flex-wrap gap-1">
              {profile.currentTechStack.map(t => (
                <span key={t} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">{t}</span>
              ))}
            </div>
          </div>
        )}

        {profile.keyBusinessChallenges?.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-slate-400 mb-1.5">Key Business Challenges</p>
            <div className="flex flex-wrap gap-1">
              {profile.keyBusinessChallenges.map(ch => (
                <span key={ch} className="text-xs px-2 py-0.5 bg-rose-50 text-rose-700 rounded">{ch}</span>
              ))}
            </div>
          </div>
        )}

        {profile.summary && (
          <p className="text-sm text-slate-600 leading-relaxed mb-4">{profile.summary}</p>
        )}

        {profile.signals?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Signals</p>
            <div className="space-y-2">
              {profile.signals.map((sig, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 mt-0.5 font-medium ${CONF_CLS[sig.confidence] || CONF_CLS.Medium}`}>
                    {sig.confidence}
                  </span>
                  <div>
                    <p className="text-sm text-slate-700">{sig.claim}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {sig.source}{sig.note ? ` — ${sig.note}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PropensityPipeline({ scoresByCategory, categoryStages, onMarkAsBought }) {
  const cats = CAT_ORDER.filter(c => scoresByCategory[c]?.length);
  if (!cats.length) return null;

  return (
    <section>
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Propensity Pipeline</h2>
      <div className="space-y-4">
        {cats.map(cat => {
          const cc = CATEGORY_CLASSES[cat];
          const stage = categoryStages?.[cat] || 'Not Started';
          return (
            <div key={cat} className="bg-white border border-slate-200 rounded">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cc.bg} ${cc.text}`}>{cat}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${stageCls(stage)}`}>{stage}</span>
              </div>
              <div className="p-4 space-y-4">
                {scoresByCategory[cat].map(ps => (
                  <div key={ps.product} className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-700">{ps.product}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${LABEL_CLS[ps.label] || LABEL_CLS.Medium}`}>
                          {ps.label}
                        </span>
                        <span className="text-xs text-slate-400 shrink-0">{ps.score}</span>
                      </div>
                      <p className="text-sm text-slate-500 leading-relaxed">{ps.rationale}</p>
                    </div>
                    <button
                      onClick={() => onMarkAsBought(ps.product)}
                      className="h-9 px-3 shrink-0 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs rounded"
                    >
                      Mark as Bought
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RoiRoadmap({ roadmap }) {
  if (!roadmap?.phases?.length) return null;

  return (
    <section>
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">12-Month ROI Roadmap</h2>
      <div className="space-y-4">
        {roadmap.phases.map(phase => (
          <div key={phase.phase} className="bg-white border border-slate-200 rounded">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
              <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                Phase {phase.phase}
              </span>
              <span className="text-sm font-medium text-slate-700">{phase.label}</span>
              <span className="text-xs text-slate-400">{phase.timeframe}</span>
            </div>

            {phase.products?.length > 0 && (
              <div className="px-4 pt-3 flex flex-wrap gap-1">
                {phase.products.map(p => (
                  <span key={p} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">{p}</span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 divide-x divide-slate-100 p-4 gap-0">
              {/* CTO / IT */}
              <div className="pr-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">CTO / IT</p>
                {phase.cto && (
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-slate-700">{phase.cto.headline}</p>
                    {phase.cto.detail && <p className="text-slate-500">{phase.cto.detail}</p>}
                    {phase.cto.deploymentTimeline && (
                      <p className="text-xs text-slate-400">Timeline: {phase.cto.deploymentTimeline}</p>
                    )}
                    {phase.cto.integrationNote && (
                      <p className="text-xs text-slate-400">{phase.cto.integrationNote}</p>
                    )}
                  </div>
                )}
              </div>

              {/* CFO */}
              <div className="px-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">CFO</p>
                {phase.cfo && (
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-slate-700">{phase.cfo.headline}</p>
                    {phase.cfo.licenceConsolidation && (
                      <p className="text-slate-500">{phase.cfo.licenceConsolidation}</p>
                    )}
                    {phase.cfo.costAvoidance && (
                      <p className="text-slate-500">{phase.cfo.costAvoidance}</p>
                    )}
                    {phase.cfo.productivityGain && (
                      <p className="text-slate-500">{phase.cfo.productivityGain}</p>
                    )}
                    {phase.cfo.tcoNote && (
                      <p className="text-xs text-slate-400">{phase.cfo.tcoNote}</p>
                    )}
                  </div>
                )}
              </div>

              {/* CISO / Legal */}
              <div className="pl-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">CISO / Legal</p>
                {phase.ciso && (
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-slate-700">{phase.ciso.headline}</p>
                    {phase.ciso.dataResidency && (
                      <p className="text-slate-500">{phase.ciso.dataResidency}</p>
                    )}
                    {phase.ciso.certifications?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {phase.ciso.certifications.map(cert => (
                          <span key={cert} className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">{cert}</span>
                        ))}
                      </div>
                    )}
                    {phase.ciso.regulatoryMapping?.length > 0 && (
                      <div className="space-y-2 mt-1">
                        {phase.ciso.regulatoryMapping.map((r, i) => (
                          <div key={i} className="border-l-2 border-rose-200 pl-2">
                            <p className="text-xs font-medium text-slate-600">{r.regulation}</p>
                            <p className="text-xs text-slate-500">{r.requirement}</p>
                            <p className="text-xs text-slate-400">{r.product}: {r.control}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {(roadmap.totalCustomerValue || roadmap.disclaimer) && (
        <div className="mt-4 p-4 bg-white border border-slate-200 rounded space-y-1">
          {roadmap.totalCustomerValue && (
            <p className="text-sm font-medium text-slate-700">{roadmap.totalCustomerValue}</p>
          )}
          {roadmap.disclaimer && (
            <p className="text-xs text-slate-400">{roadmap.disclaimer}</p>
          )}
        </div>
      )}
    </section>
  );
}

function OwnedProducts({ ownedByCategory, onUndo }) {
  const cats = CAT_ORDER.filter(c => ownedByCategory[c]?.length);
  if (!cats.length) return null;

  return (
    <section>
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Owned Products</h2>
      <div className="bg-white border border-slate-200 rounded p-4 space-y-3">
        {cats.map(cat => {
          const cc = CATEGORY_CLASSES[cat];
          return (
            <div key={cat} className="flex items-start gap-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${cc.bg} ${cc.text}`}>
                {cat}
              </span>
              <div className="flex flex-wrap gap-2">
                {ownedByCategory[cat].map(prod => (
                  <div
                    key={prod}
                    className="flex items-center gap-1.5 bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full"
                  >
                    <span>{prod}</span>
                    <button
                      onClick={() => onUndo(prod)}
                      className="hover:text-emerald-900 underline underline-offset-2"
                    >
                      Undo
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────

function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [customer,        setCustomer]        = useState(null);
  const [analysis,        setAnalysis]        = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [analyzing,       setAnalyzing]       = useState(false);
  const [reanalyzePrompt, setReanalyzePrompt] = useState(false);
  const [pageError,       setPageError]       = useState(null);

  // ── Data loading ──────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const c = await getCustomer(id);
      if (!c) { setPageError('Customer not found'); setLoading(false); return; }
      setCustomer(c);
      if (c.analysisComplete) {
        const a = await getLatestAnalysis(id);
        setAnalysis(a || null);
      }
    } catch {
      setPageError('Failed to load customer data');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Analysis trigger ──────────────────────────────────────

  const runAnalysis = useCallback(async () => {
    setAnalyzing(true);
    setReanalyzePrompt(false);
    try {
      const { customer: c, analysis: a } = await analyzeCustomer(customer);
      setCustomer(c);
      setAnalysis(a);
    } catch (err) {
      setPageError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }, [customer]);

  // ── Ownership mutations ───────────────────────────────────

  const markAsBought = useCallback(async (productName) => {
    const next = {
      ...customer,
      ownedProducts: [...(customer.ownedProducts || []), productName],
    };
    next.categoryStages = computeCategoryStages(next.ownedProducts);
    next.updatedAt = new Date().toISOString();
    await putCustomer(next);
    setCustomer(next);
    setReanalyzePrompt(true);
  }, [customer]);

  const undoBought = useCallback(async (productName) => {
    const next = {
      ...customer,
      ownedProducts: (customer.ownedProducts || []).filter(p => p !== productName),
    };
    next.categoryStages = computeCategoryStages(next.ownedProducts);
    next.updatedAt = new Date().toISOString();
    await putCustomer(next);
    setCustomer(next);
    setReanalyzePrompt(true);
  }, [customer]);

  // ── Derived data ──────────────────────────────────────────

  const owned = customer?.ownedProducts || [];

  const unownedScores = useMemo(() =>
    (analysis?.productScores || []).filter(ps => !owned.includes(ps.product)),
    [analysis, owned]
  );

  const scoresByCategory = useMemo(() => {
    const map = {};
    for (const cat of CAT_ORDER) {
      const prods = unownedScores
        .filter(ps => ps.category === cat)
        .sort((a, b) => b.score - a.score);
      if (prods.length) map[cat] = prods;
    }
    return map;
  }, [unownedScores]);

  const ownedByCategory = useMemo(() => {
    const map = {};
    for (const cat of CAT_ORDER) {
      const prods = owned.filter(name => {
        return PRODUCTS_BY_CATEGORY[cat].includes(name);
      });
      if (prods.length) map[cat] = prods;
    }
    return map;
  }, [owned]);

  // ── Render guards ─────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-sm text-slate-400">Loading…</span>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="p-8">
        <p className="text-sm text-rose-600">{pageError}</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 h-9 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded"
        >
          Back to customers
        </button>
      </div>
    );
  }

  if (!customer) return null;

  const profileComplete = customer.analysisComplete && analysis;

  // ── Layout ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="h-9 px-3 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded"
          >
            ← Back
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-slate-700 truncate">{customer.name}</p>
            <p className="text-xs text-slate-400">{customer.id}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {analyzing ? (
              <span className="text-sm text-slate-400 px-3">Analyzing…</span>
            ) : profileComplete ? (
              <button
                onClick={runAnalysis}
                className="h-9 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded"
              >
                Run Analysis Again
              </button>
            ) : (
              <button
                onClick={runAnalysis}
                className="h-9 px-4 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm rounded font-medium"
              >
                Analyze
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Re-analyze prompt banner ── */}
      {reanalyzePrompt && (
        <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-200 rounded flex items-center justify-between gap-4">
          <p className="text-sm text-amber-700">
            Ownership updated — run a fresh analysis to update scores based on new product ownership?
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={runAnalysis}
              className="h-9 px-4 bg-amber-100 hover:bg-amber-200 text-amber-700 text-sm rounded"
            >
              Run Analysis
            </button>
            <button
              onClick={() => setReanalyzePrompt(false)}
              className="h-9 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm rounded"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Analyzing state ── */}
      {analyzing && (
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <div className="flex gap-1.5">
            {[0, 200, 400].map(d => (
              <span
                key={d}
                className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"
                style={{ animationDelay: `${d}ms` }}
              />
            ))}
          </div>
          <p className="text-sm text-slate-400">Analysis running — checking back every few seconds</p>
        </div>
      )}

      {/* ── No analysis yet ── */}
      {!customer.analysisComplete && !analyzing && (
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <p className="text-sm text-slate-400">No analysis for this customer yet</p>
          <button
            onClick={runAnalysis}
            className="h-9 px-6 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm rounded font-medium"
          >
            Run Analysis
          </button>
        </div>
      )}

      {/* ── Full profile ── */}
      {profileComplete && !analyzing && (
        <div className="p-6 space-y-6">
          <TopOpportunities scores={unownedScores} />
          <CompanyProfileCard profile={analysis.companyProfile} />
          <PropensityPipeline
            scoresByCategory={scoresByCategory}
            categoryStages={customer.categoryStages}
            onMarkAsBought={markAsBought}
          />
          <RoiRoadmap roadmap={analysis.roiRoadmap} />
          <OwnedProducts ownedByCategory={ownedByCategory} onUndo={undoBought} />
        </div>
      )}
    </div>
  );
}

// ============================================================
// SECTION 5 — API CLIENT
// ============================================================

/**
 * analyzeCustomer
 *
 * Orchestrates a full analysis cycle for a single customer:
 *   1. Reads API keys from IndexedDB (never from any other source)
 *   2. POSTs to the Netlify function at /fn/analyze
 *   3. Awaits the complete analysis JSON in the response body
 *   4. Validates the payload structure
 *   5. Persists the new analysis record to IndexedDB
 *   6. Marks the customer analysisComplete and stamps updatedAt
 *   7. Returns both updated objects so the caller can sync UI state
 *
 * Security contract:
 *   - Keys travel in the POST body only — never in headers, URLs, or logs
 *   - Keys are trimmed and validated before dispatch; any null/empty key
 *     throws before the network request is made
 *   - The function makes no assumptions about what the Netlify function
 *     logs — it never sends keys in any field whose name could be confused
 *     with a header or query parameter
 *
 * Error contract:
 *   - Every failure throws an Error with a user-facing message string
 *   - The caller is responsible for catching, displaying, and clearing
 *     the analysing state
 *
 * @param   {object}    customer         Full customer record from IndexedDB
 * @param   {function=} onStatusChange   Optional (msg: string) => void for
 *                                       granular loading-state messages
 * @returns {Promise<{ customer: object, analysis: object }>}
 */
async function analyzeCustomer(customer, onStatusChange) {

  // ── 1. Read and validate API keys ───────────────────────────────────────
  // Keys live exclusively in the IndexedDB settings store.
  // They must never be read from env vars, window globals, or any
  // server-side source — this function is the sole dispatch point.

  let keys;
  try {
    const settings = await getSettings();
    keys = settings ?? {};
  } catch {
    throw new Error('Could not read API keys from settings — try reloading the app');
  }

  const anthropicKey = keys.anthropic?.trim();
  const tavilyKey    = keys.tavily?.trim();
  const model        = keys.model ?? 'sonnet';

  if (!anthropicKey) throw new Error('Anthropic API key not set — add it in Settings before running an analysis');
  if (!tavilyKey)    throw new Error('Tavily API key not set — add it in Settings before running an analysis');

  // ── 2. Build request payload ─────────────────────────────────────────────
  // Only the minimum fields needed by the Netlify function are included.
  // Keys are the last fields added so any accidental partial-log
  // of the payload body captures metadata before credentials.

  const payload = {
    customerId:    customer.id,
    companyName:   customer.name,
    ownedProducts: customer.ownedProducts ?? [],
    model,
    // keys always last in the object — never aliased to header-like names
    anthropicKey,
    tavilyKey,
  };

  // ── 3. Dispatch to Netlify function ──────────────────────────────────────
  // The function runs the full pipeline (9 Tavily searches + 2 Claude calls)
  // synchronously from the browser's perspective and returns the complete
  // analysis JSON in the response body.
  // Keys are transmitted once, in the body — they are never re-sent,
  // cached, or stored by any server-side component.

  onStatusChange?.('Running analysis — this may take up to a minute…');

  let res;
  try {
    res = await fetch('/fn/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
  } catch (networkErr) {
    throw new Error('Network error — check your connection and try again');
  }

  // ── 4. Handle HTTP-level errors ──────────────────────────────────────────

  if (!res.ok) {
    let msg = `Analysis function returned HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      // Use the function's error message if present; ignore any field that
      // could re-echo key material back into the UI
      if (errBody?.error && typeof errBody.error === 'string') msg = errBody.error;
    } catch { /* non-JSON error body — fall through to default message */ }
    throw new Error(msg);
  }

  // ── 5. Parse and validate response ──────────────────────────────────────

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('Malformed response from analysis function — could not parse JSON');
  }

  const { companyProfile, productScores, roiRoadmap, modelVersion } = data;

  if (!companyProfile)        throw new Error('Analysis response missing companyProfile');
  if (!Array.isArray(productScores) || !productScores.length)
                              throw new Error('Analysis response missing productScores');
  if (!roiRoadmap?.phases?.length)
                              throw new Error('Analysis response missing roiRoadmap');

  // ── 6. Persist analysis record ───────────────────────────────────────────

  onStatusChange?.('Saving results…');

  const analysisRecord = {
    id:             crypto.randomUUID(),
    customerId:     customer.id,
    analyzedAt:     new Date().toISOString(),
    companyProfile,
    productScores,
    roiRoadmap,
    modelVersion:   modelVersion ?? model,
  };

  try {
    await deleteAnalysesForCustomer(customer.id);
    await putAnalysis(analysisRecord);
  } catch {
    throw new Error('Analysis completed but could not be saved — try again or check available storage');
  }

  // ── 7. Update customer record ────────────────────────────────────────────

  const updatedCustomer = {
    ...customer,
    analysisComplete: true,
    updatedAt:        new Date().toISOString(),
  };

  try {
    await putCustomer(updatedCustomer);
  } catch {
    // Analysis is saved — non-fatal, but flag it
    console.warn('analyzeCustomer: analysis saved but customer record update failed');
  }

  // ── 8. Return updated objects for caller to sync UI state ────────────────

  return { customer: updatedCustomer, analysis: analysisRecord };
}

// ============================================================
// SECTION 6 — ROUTER AND EXPORT
// ============================================================

// ── Navigation bar ────────────────────────────────────────────
// Rendered inside BrowserRouter so useLocation is always in context.

function NavBar() {
  const { pathname } = useLocation();

  const links = [
    { to: '/',         label: 'Customers' },
    { to: '/settings', label: 'Settings'  },
  ];

  // Exact match for root; prefix match for all other routes.
  const active = (to) => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="flex items-center gap-1 px-6 h-12">
        <span className="text-sm font-semibold text-slate-700 pr-4 select-none">
          Cloud Voyager
        </span>
        {links.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className={`h-9 px-3 flex items-center text-sm rounded transition-colors ${
              active(to)
                ? 'bg-slate-100 text-slate-700'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
    </header>
  );
}

// ── Shared layout ─────────────────────────────────────────────
// Provides the persistent nav and the full-height slate background.
// Individual pages control their own inner structure.

function Layout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar />
      <Outlet />
    </div>
  );
}

// ── Root component ────────────────────────────────────────────

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index                  element={<CustomerListPage />}   />
          <Route path="/customer/:id"   element={<CustomerDetailPage />} />
          <Route path="/settings"       element={<SettingsPage />}       />
          {/* Catch-all: redirect unknown paths to the customer list */}
          <Route path="*"               element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;