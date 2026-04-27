// ============================================================
// SECTION 1 — IMPORTS AND ZUSTAND STORE
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { BrowserRouter, Routes, Route, Outlet, Navigate, useParams, useNavigate } from 'react-router-dom'
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

const useStore = create((set) => ({
  searchQuery:    '',
  currentPage:    1,
  setSearchQuery: (searchQuery) => set({ searchQuery, currentPage: 1 }),
  setCurrentPage: (currentPage) => set({ currentPage }),
}))

// ============================================================
// SECTION 3 — CUSTOMER LIST PAGE
// ============================================================

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format ISO string to DD-MMM-YY HH:MM:SS in Gulf Standard Time (UTC+4). */
function formatGST(iso) {
  if (!iso) return '—'
  const d = new Date(new Date(iso).getTime() + 4 * 60 * 60 * 1000)
  const DD  = String(d.getUTCDate()).padStart(2, '0')
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]
  const YY  = String(d.getUTCFullYear()).slice(2)
  const HH  = String(d.getUTCHours()).padStart(2, '0')
  const MM  = String(d.getUTCMinutes()).padStart(2, '0')
  const SS  = String(d.getUTCSeconds()).padStart(2, '0')
  return `${DD}-${MON}-${YY} ${HH}:${MM}:${SS}`
}

// ── CategoryStagesFull ────────────────────────────────────────────────────────

function CategoryStagesFull({ categoryStages }) {
  return (
    <div className="flex flex-wrap gap-1">
      {CATEGORIES.map(cat => {
        const stage = categoryStages?.[cat] ?? 'Not Started'
        const isNS  = stage === 'Not Started'
        const cc    = CATEGORY_CLASSES[cat]
        return (
          <span
            key={cat}
            className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
              isNS ? 'bg-slate-100 text-slate-400' : `${cc.bg} ${cc.text}`
            }`}
          >
            {cat}
          </span>
        )
      })}
    </div>
  )
}

// ── AnalysisStrip ─────────────────────────────────────────────────────────────

function AnalysisStrip({ state }) {
  const [dotCount, setDotCount] = useState(1)
  const isInProgress = state && !['complete', 'error'].includes(state.phase)

  useEffect(() => {
    if (!isInProgress) { setDotCount(1); return }
    const iv = setInterval(() => setDotCount(d => d >= 3 ? 1 : d + 1), 400)
    return () => clearInterval(iv)
  }, [isInProgress])

  const dots = '.'.repeat(dotCount)

  const phaseLabel = {
    initializing: 'Initializing analysis',
    tavily:       'Searching 9 intelligence sources across strategy, infrastructure, security, AI, and enterprise systems',
    claude1:      'Building company profile and scoring propensity across 22 Microsoft products',
    claude2:      'Generating 12-month CTO · CFO · CISO roadmap',
  }

  return (
    <div className="bg-slate-900 rounded-md px-4 h-9 flex items-center font-mono text-xs overflow-hidden">
      {!state ? (
        <span className="text-slate-300">Analysis progress is displayed here</span>
      ) : state.phase === 'complete' ? (
        <span className="text-emerald-400">
          {state.customerId}: Analysis complete — click View Profile
        </span>
      ) : state.phase === 'error' ? (
        <span className="text-rose-400">
          {state.errorMessage ?? `${state.customerId}: Something went wrong — try again`}
        </span>
      ) : (
        <span className="text-slate-300">
          {state.customerId}: {phaseLabel[state.phase]}<span>{dots}</span>
        </span>
      )}
    </div>
  )
}

// ── CustomerModal (create + edit) ─────────────────────────────────────────────

function CustomerModal({ mode = 'create', customer = null, onClose, onSaved }) {
  const isEdit = mode === 'edit'

  const [customerId,       setCustomerId]       = useState(isEdit ? customer.id   : '')
  const [customerName,     setCustomerName]     = useState(isEdit ? customer.name : '')
  const [selectedProducts, setSelectedProducts] = useState(isEdit ? (customer.ownedProducts ?? []) : [])
  const [idError,          setIdError]          = useState(null)
  const [nameWarning,      setNameWarning]      = useState(null)
  const [nameDismissed,    setNameDismissed]    = useState(false)
  const [allCustomers,     setAllCustomers]     = useState([])
  const [submitting,       setSubmitting]       = useState(false)

  useEffect(() => { getAllCustomers().then(setAllCustomers) }, [])

  const nameFuse = useMemo(
    () => new Fuse(allCustomers, { keys: ['name'], threshold: 0.3 }),
    [allCustomers]
  )

  // ID validation — create mode only
  useEffect(() => {
    if (isEdit) return
    const q = customerId.trim()
    if (!q) { setIdError(null); return }
    const exists = allCustomers.some(c => c.id.toLowerCase() === q.toLowerCase())
    setIdError(exists ? 'Customer with the same ID already exists' : null)
  }, [customerId, allCustomers, isEdit])

  // Name validation
  useEffect(() => {
    setNameDismissed(false)
    const q = customerName.trim()
    if (!q) { setNameWarning(null); return }
    const results = nameFuse.search(q)
    if (results.length > 0) {
      const match = results[0].item
      if (isEdit && match.id === customer.id) { setNameWarning(null); return }
      setNameWarning({ matchedId: match.id })
    } else {
      setNameWarning(null)
    }
  }, [customerName, nameFuse, isEdit, customer])

  function toggleProduct(product) {
    setSelectedProducts(prev =>
      prev.includes(product) ? prev.filter(p => p !== product) : [...prev, product]
    )
  }

  async function handleSubmit() {
    if ((!isEdit && idError) || !customerId.trim() || !customerName.trim() || submitting) return
    setSubmitting(true)
    try {
      if (isEdit) {
        await putCustomer({ ...customer, name: customerName.trim(), ownedProducts: selectedProducts })
      } else {
        await createCustomer({ id: customerId.trim(), name: customerName.trim(), ownedProducts: selectedProducts })
      }
      onSaved?.()
      onClose()
    } catch (err) {
      if (!isEdit) setIdError(err.message)
      setSubmitting(false)
    }
  }

  const canSubmit = (isEdit || !idError) && customerId.trim() && customerName.trim() && !submitting

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-lg border border-slate-200 w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-200 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center flex-shrink-0">
            {isEdit ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            )}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 leading-tight tracking-tight">
              {isEdit ? 'Edit Customer' : 'Create Customer'}
            </h2>
            <p className="text-xs text-slate-400 leading-tight">
              {isEdit ? 'Edit customer details' : 'Create new customer'}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 space-y-4 flex-1">

          {/* ID */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-700">ID</span>
              {!isEdit && idError && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-rose-600">{idError}</span>
                </>
              )}
            </div>
            {isEdit ? (
              <div className="w-full h-9 px-3 rounded-md border border-slate-200 bg-slate-100 text-sm text-slate-400 font-mono flex items-center">
                {customer.id}
              </div>
            ) : (
              <input
                type="text"
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
                placeholder="As per Cloud Quarks"
                className={[
                  'w-full h-9 px-3 rounded-md border text-sm text-slate-700 placeholder-slate-400 bg-slate-50 focus:outline-none',
                  idError ? 'border-rose-300' : 'border-slate-200',
                ].join(' ')}
              />
            )}
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-700">Name</span>
              {nameWarning && !nameDismissed && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-amber-600">Customer with similar name already exists — {nameWarning.matchedId}</span>
                  <button
                    onClick={() => setNameDismissed(true)}
                    className="text-xs text-amber-500 hover:text-amber-700 underline"
                  >
                    Dismiss
                  </button>
                </>
              )}
            </div>
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="As per Cloud Quarks"
              className={[
                'w-full h-9 px-3 rounded-md border text-sm text-slate-700 placeholder-slate-400 bg-slate-50 focus:outline-none',
                nameWarning && !nameDismissed
                  ? 'border-amber-300'
                  : 'border-slate-200',
              ].join(' ')}
            />
          </div>

          {/* Products Owned */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-700">Products Owned</span>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-400">
                {selectedProducts.length === 0
                  ? '0 products selected'
                  : `${selectedProducts.length} product${selectedProducts.length !== 1 ? 's' : ''} selected`}
              </span>
            </div>
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
                        <span className="text-sm text-slate-700 group-hover:text-slate-900">{product}</span>
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>
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
            {submitting
              ? (isEdit ? 'Saving…' : 'Creating…')
              : (isEdit ? 'Edit Customer' : 'Create Customer')}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── CustomerListPage ─────────────────────────────────────────────────────────

function CustomerListPage() {
  const searchQuery   = useStore(s => s.searchQuery)
  const currentPage   = useStore(s => s.currentPage)
  const setSearchQuery = useStore(s => s.setSearchQuery)
  const setCurrentPage = useStore(s => s.setCurrentPage)

  const navigate = useNavigate()

  // ── Customer data ─────────────────────────────────────────
  const [enriched, setEnriched] = useState([])
  const [loading,  setLoading]  = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    const customers = await getAllCustomers()
    const rows = await Promise.all(
      customers.map(async c => {
        const analysis = await getLatestAnalysis(c.id)
        return { ...c, lastAnalyzed: analysis?.analyzedAt ?? null }
      })
    )
    setEnriched(rows)
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── API keys ──────────────────────────────────────────────

  const [anthropicKey, setAnthropicKey] = useState('')
  const [tavilyKey,    setTavilyKey]    = useState('')
  const [keysSaved,    setKeysSaved]    = useState(false)

  useEffect(() => {
    getSettings().then(s => {
      if (s.anthropic) setAnthropicKey(s.anthropic)
      if (s.tavily)    setTavilyKey(s.tavily)
      setKeysSaved(!!(s.anthropic?.trim() && s.tavily?.trim()))
    })
  }, [])

  async function handleSaveKeys() {
    if (!anthropicKey.trim() || !tavilyKey.trim()) return
    const s = await getSettings()
    await saveSettings({ ...s, anthropic: anthropicKey.trim(), tavily: tavilyKey.trim() })
    setKeysSaved(true)
  }

  async function handleClearKeys() {
    const s = await getSettings()
    await saveSettings({ ...s, anthropic: '', tavily: '' })
    setAnthropicKey('')
    setTavilyKey('')
    setKeysSaved(false)
  }

  // ── Modal ─────────────────────────────────────────────────
  const [modalState, setModalState] = useState(null) // null | {mode:'create'} | {mode:'edit', customer}

  // ── Analysis ──────────────────────────────────────────────
  const [analysisState, setAnalysisState] = useState(null) // {customerId, phase}
  const phaseTimers = useRef([])

  useEffect(() => () => { phaseTimers.current.forEach(clearTimeout) }, [])

  const isAnalyzing = useMemo(
    () => !!analysisState && !['complete', 'error'].includes(analysisState.phase),
    [analysisState]
  )

  const handleAnalyze = useCallback(async (customer) => {
    phaseTimers.current.forEach(clearTimeout)
    phaseTimers.current = []

    window.scrollTo({ top: 0, behavior: 'smooth' })
    setAnalysisState({ customerId: customer.id, phase: 'initializing' })

    phaseTimers.current = [
      setTimeout(() => setAnalysisState(s => s?.phase === 'initializing' ? { ...s, phase: 'tavily'  } : s),  1500),
      setTimeout(() => setAnalysisState(s => s?.phase === 'tavily'       ? { ...s, phase: 'claude1' } : s), 13500),
      setTimeout(() => setAnalysisState(s => s?.phase === 'claude1'      ? { ...s, phase: 'claude2' } : s), 46500),
    ]

    try {
      await analyzeCustomer(customer)
      phaseTimers.current.forEach(clearTimeout)
      setAnalysisState({ customerId: customer.id, phase: 'complete' })
      await loadData()
    } catch (err) {
      phaseTimers.current.forEach(clearTimeout)
      const errorMessage = err.message
        ? `${customer.id}: ${err.message}`
        : `${customer.id}: Something went wrong — try again`
      setAnalysisState({ customerId: customer.id, phase: 'error', errorMessage })
    }
  }, [loadData])

  // ── Search + filter ───────────────────────────────────────
  const fuse = useMemo(
    () => new Fuse(enriched, { keys: ['name'], threshold: 0.35, includeScore: true }),
    [enriched]
  )

  const filtered = useMemo(() => {
    const q = searchQuery.trim()
    if (!q) return enriched
    const byId = enriched.filter(c => c.id.toLowerCase() === q.toLowerCase())
    if (byId.length) return byId
    return fuse.search(q).map(r => r.item)
  }, [searchQuery, enriched, fuse])

  // ── Table columns ─────────────────────────────────────────
  const columns = useMemo(() => [
    {
      accessorKey: 'id',
      header: 'ID',
      cell: info => (
        <span className="text-sm text-slate-600 font-mono">{info.getValue()}</span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: info => (
        <span className="text-sm font-medium text-slate-700">{info.getValue()}</span>
      ),
    },
    {
      accessorKey: 'categoryStages',
      header: 'Product Stages',
      cell: info => <CategoryStagesFull categoryStages={info.getValue()} />,
    },
    {
      accessorKey: 'createdAt',
      header: 'Creation Date',
      cell: info => (
        <span className="text-sm text-slate-500 whitespace-nowrap font-mono">{formatGST(info.getValue())}</span>
      ),
    },
    {
      accessorKey: 'updatedAt',
      header: 'Last Updated',
      cell: info => (
        <span className="text-sm text-slate-500 whitespace-nowrap font-mono">{formatGST(info.getValue())}</span>
      ),
    },
    {
      accessorKey: 'lastAnalyzed',
      header: 'Last Analyzed',
      cell: info => (
        <span className="text-sm text-slate-500 whitespace-nowrap font-mono">{formatGST(info.getValue())}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const c = row.original
        return (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => handleAnalyze(c)}
              disabled={!keysSaved || isAnalyzing}
              className={`${BUTTON_H} px-3 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors`}
            >
              Analyze
            </button>
            <button
              onClick={() => navigate(`/customer/${encodeURIComponent(c.id)}`)}
              disabled={!c.analysisComplete || isAnalyzing}
              className={`${BUTTON_H} px-3 rounded-md text-sm font-medium bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
            >
              View Profile
            </button>
            <button
              onClick={() => setModalState({ mode: 'edit', customer: c })}
              disabled={isAnalyzing}
              className={`${BUTTON_H} px-3 rounded-md text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors`}
            >
              Edit
            </button>
          </div>
        )
      },
    },
  ], [navigate, handleAnalyze, isAnalyzing, keysSaved])

  const pagination = useMemo(
    () => ({ pageIndex: currentPage - 1, pageSize: PAGE_SIZE }),
    [currentPage]
  )

  const table = useReactTable({
    data:                  filtered,
    columns,
    getCoreRowModel:       getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex:    false,
    state:                 { pagination },
    onPaginationChange: updater => {
      const next = typeof updater === 'function' ? updater(pagination) : updater
      setCurrentPage(next.pageIndex + 1)
    },
  })

  const totalPages = table.getPageCount()
  const hasData    = filtered.length > 0

  const inputBase   = 'h-9 px-3 rounded-md border text-sm placeholder-slate-400 focus:outline-none'
  const inputSaved  = 'bg-slate-100 border-slate-200 text-slate-400 cursor-default'
  const inputNormal = 'bg-slate-50 border-slate-200 text-slate-700'

  return (
    <div className="p-4 space-y-3">

      {/* Single row — search · create customer · api keys */}
      <div className="flex items-center gap-2">

        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by ID or name..."
          className="flex-1 h-9 px-3 rounded-md border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
        />

        {/* Create Customer */}
        <button
          onClick={() => setModalState({ mode: 'create' })}
          className={`${BUTTON_H} px-4 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0`}
        >
          Create Customer
        </button>

        {/* Separator */}
        <div className="w-px h-5 bg-slate-200 shrink-0" />

        {/* Anthropic key */}
        <input
          type="text"
          value={anthropicKey}
          readOnly={keysSaved}
          onChange={e => setAnthropicKey(e.target.value)}
          placeholder="Anthropic API Key"
          className={`${inputBase} w-48 ${keysSaved ? inputSaved : inputNormal}`}
        />

        {/* Tavily key */}
        <input
          type="text"
          value={tavilyKey}
          readOnly={keysSaved}
          onChange={e => setTavilyKey(e.target.value)}
          placeholder="Tavily API Key"
          className={`${inputBase} w-44 ${keysSaved ? inputSaved : inputNormal}`}
        />

        {/* Save */}
        <button
          onClick={handleSaveKeys}
          disabled={keysSaved || !anthropicKey.trim() || !tavilyKey.trim()}
          className={`${BUTTON_H} px-4 rounded-md text-sm font-medium bg-slate-700 text-white hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
        >
          Save
        </button>

        {/* Clear */}
        <button
          onClick={handleClearKeys}
          className={`${BUTTON_H} px-4 rounded-md text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors`}
        >
          Clear
        </button>

      </div>

      {/* Analysis progress strip */}
      <AnalysisStrip state={analysisState} />

      {/* Table or empty state */}
      {loading ? (
        <div className="py-16 flex justify-center">
          <span className="text-sm text-slate-400">Loading…</span>
        </div>
      ) : !hasData ? (
        <div className="border border-slate-200 rounded-lg bg-white px-4 py-12 text-center text-sm text-slate-400">
          {searchQuery
            ? 'No customers match your search'
            : 'No customers yet — create your first customer'}
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-x-auto bg-white">
          <table className="w-full text-left whitespace-nowrap">
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
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">Page {currentPage} of {totalPages}</p>
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

      {/* Customer Modal (create / edit) */}
      {modalState && (
        <CustomerModal
          mode={modalState.mode}
          customer={modalState.customer ?? null}
          onClose={() => setModalState(null)}
          onSaved={loadData}
        />
      )}

    </div>
  )
}

// ============================================================
// SECTION 4 — CUSTOMER DETAIL PAGE
// ============================================================

const CONF_CLS = {
  High:   'bg-emerald-100 text-emerald-700',
  Medium: 'bg-amber-100 text-amber-700',
  Low:    'bg-rose-100 text-rose-700',
}

const LABEL_CLS = {
  'Very High': 'bg-emerald-100 text-emerald-700',
  High:        'bg-blue-100 text-blue-700',
  Medium:      'bg-amber-100 text-amber-700',
  Low:         'bg-slate-100 text-slate-500',
}

const CAT_ORDER = ['Cloud', 'Modern Work', 'Security', 'AI', 'BizApps']

function stageCls(stage) {
  if (stage === 'Established') return 'bg-emerald-100 text-emerald-700'
  if (stage === 'Active')      return 'bg-blue-100 text-blue-700'
  return 'bg-slate-100 text-slate-500'
}

function TopOpportunities({ scores }) {
  if (!scores.length) return null
  const top = [...scores].sort((a, b) => b.score - a.score).slice(0, 3)
  return (
    <section>
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Top Opportunities</h2>
      <div className="grid grid-cols-3 gap-4">
        {top.map(op => {
          const cc = CATEGORY_CLASSES[op.category] || CATEGORY_CLASSES['Cloud']
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
          )
        })}
      </div>
    </section>
  )
}

function CompanyProfileCard({ profile }) {
  if (!profile) return null
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
            <p className="text-slate-700">{profile.industry}{profile.subIndustry ? ` — ${profile.subIndustry}` : ''}</p>
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
                    <p className="text-xs text-slate-400 mt-0.5">{sig.source}{sig.note ? ` — ${sig.note}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function PropensityPipeline({ scoresByCategory, categoryStages, onMarkAsBought }) {
  const cats = CAT_ORDER.filter(c => scoresByCategory[c]?.length)
  if (!cats.length) return null
  return (
    <section>
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Propensity Pipeline</h2>
      <div className="space-y-4">
        {cats.map(cat => {
          const cc    = CATEGORY_CLASSES[cat]
          const stage = categoryStages?.[cat] || 'Not Started'
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
          )
        })}
      </div>
    </section>
  )
}

function RoiRoadmap({ roadmap }) {
  if (!roadmap?.phases?.length) return null
  return (
    <section>
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">12-Month ROI Roadmap</h2>
      <div className="space-y-4">
        {roadmap.phases.map(phase => (
          <div key={phase.phase} className="bg-white border border-slate-200 rounded">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
              <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">Phase {phase.phase}</span>
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
              <div className="pr-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">CTO / IT</p>
                {phase.cto && (
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-slate-700">{phase.cto.headline}</p>
                    {phase.cto.detail            && <p className="text-slate-500">{phase.cto.detail}</p>}
                    {phase.cto.deploymentTimeline && <p className="text-xs text-slate-400">Timeline: {phase.cto.deploymentTimeline}</p>}
                    {phase.cto.integrationNote   && <p className="text-xs text-slate-400">{phase.cto.integrationNote}</p>}
                  </div>
                )}
              </div>
              <div className="px-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">CFO</p>
                {phase.cfo && (
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-slate-700">{phase.cfo.headline}</p>
                    {phase.cfo.licenceConsolidation && <p className="text-slate-500">{phase.cfo.licenceConsolidation}</p>}
                    {phase.cfo.costAvoidance        && <p className="text-slate-500">{phase.cfo.costAvoidance}</p>}
                    {phase.cfo.productivityGain     && <p className="text-slate-500">{phase.cfo.productivityGain}</p>}
                    {phase.cfo.tcoNote              && <p className="text-xs text-slate-400">{phase.cfo.tcoNote}</p>}
                  </div>
                )}
              </div>
              <div className="pl-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">CISO / Legal</p>
                {phase.ciso && (
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-slate-700">{phase.ciso.headline}</p>
                    {phase.ciso.dataResidency && <p className="text-slate-500">{phase.ciso.dataResidency}</p>}
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
          {roadmap.totalCustomerValue && <p className="text-sm font-medium text-slate-700">{roadmap.totalCustomerValue}</p>}
          {roadmap.disclaimer          && <p className="text-xs text-slate-400">{roadmap.disclaimer}</p>}
        </div>
      )}
    </section>
  )
}

function OwnedProducts({ ownedByCategory, onUndo }) {
  const cats = CAT_ORDER.filter(c => ownedByCategory[c]?.length)
  if (!cats.length) return null
  return (
    <section>
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Owned Products</h2>
      <div className="bg-white border border-slate-200 rounded p-4 space-y-3">
        {cats.map(cat => {
          const cc = CATEGORY_CLASSES[cat]
          return (
            <div key={cat} className="flex items-start gap-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${cc.bg} ${cc.text}`}>{cat}</span>
              <div className="flex flex-wrap gap-2">
                {ownedByCategory[cat].map(prod => (
                  <div key={prod} className="flex items-center gap-1.5 bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full">
                    <span>{prod}</span>
                    <button onClick={() => onUndo(prod)} className="hover:text-emerald-900 underline underline-offset-2">Undo</button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [customer,        setCustomer]        = useState(null)
  const [analysis,        setAnalysis]        = useState(null)
  const [loading,         setLoading]         = useState(true)
  const [analyzing,       setAnalyzing]       = useState(false)
  const [reanalyzePrompt, setReanalyzePrompt] = useState(false)
  const [pageError,       setPageError]       = useState(null)

  const loadData = useCallback(async () => {
    try {
      const c = await getCustomer(id)
      if (!c) { setPageError('Customer not found'); setLoading(false); return }
      setCustomer(c)
      if (c.analysisComplete) {
        const a = await getLatestAnalysis(id)
        setAnalysis(a || null)
      }
    } catch {
      setPageError('Failed to load customer data')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  const runAnalysis = useCallback(async () => {
    setAnalyzing(true)
    setReanalyzePrompt(false)
    try {
      const { customer: c, analysis: a } = await analyzeCustomer(customer)
      setCustomer(c)
      setAnalysis(a)
    } catch (err) {
      setPageError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }, [customer])

  const markAsBought = useCallback(async (productName) => {
    const next = { ...customer, ownedProducts: [...(customer.ownedProducts || []), productName] }
    next.categoryStages = computeCategoryStages(next.ownedProducts)
    next.updatedAt = new Date().toISOString()
    await putCustomer(next)
    setCustomer(next)
    setReanalyzePrompt(true)
  }, [customer])

  const undoBought = useCallback(async (productName) => {
    const next = { ...customer, ownedProducts: (customer.ownedProducts || []).filter(p => p !== productName) }
    next.categoryStages = computeCategoryStages(next.ownedProducts)
    next.updatedAt = new Date().toISOString()
    await putCustomer(next)
    setCustomer(next)
    setReanalyzePrompt(true)
  }, [customer])

  const owned = customer?.ownedProducts || []

  const unownedScores = useMemo(() =>
    (analysis?.productScores || []).filter(ps => !owned.includes(ps.product)),
    [analysis, owned]
  )

  const scoresByCategory = useMemo(() => {
    const map = {}
    for (const cat of CAT_ORDER) {
      const prods = unownedScores.filter(ps => ps.category === cat).sort((a, b) => b.score - a.score)
      if (prods.length) map[cat] = prods
    }
    return map
  }, [unownedScores])

  const ownedByCategory = useMemo(() => {
    const map = {}
    for (const cat of CAT_ORDER) {
      const prods = owned.filter(name => PRODUCTS_BY_CATEGORY[cat].includes(name))
      if (prods.length) map[cat] = prods
    }
    return map
  }, [owned])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <span className="text-sm text-slate-400">Loading…</span>
    </div>
  )

  if (pageError) return (
    <div className="p-8">
      <p className="text-sm text-rose-600">{pageError}</p>
      <button onClick={() => navigate('/')} className="mt-4 h-9 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded">
        Back to customers
      </button>
    </div>
  )

  if (!customer) return null

  const profileComplete = customer.analysisComplete && analysis

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="h-9 px-3 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded">
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
              <button onClick={runAnalysis} className="h-9 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded">
                Run Analysis Again
              </button>
            ) : (
              <button onClick={runAnalysis} className="h-9 px-4 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm rounded font-medium">
                Analyze
              </button>
            )}
          </div>
        </div>
      </div>

      {reanalyzePrompt && (
        <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-200 rounded flex items-center justify-between gap-4">
          <p className="text-sm text-amber-700">
            Ownership updated — run a fresh analysis to update scores based on new product ownership?
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={runAnalysis} className="h-9 px-4 bg-amber-100 hover:bg-amber-200 text-amber-700 text-sm rounded">Run Analysis</button>
            <button onClick={() => setReanalyzePrompt(false)} className="h-9 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm rounded">Dismiss</button>
          </div>
        </div>
      )}

      {analyzing && (
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <div className="flex gap-1.5">
            {[0,200,400].map(d => (
              <span key={d} className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
            ))}
          </div>
          <p className="text-sm text-slate-400">Analysis running…</p>
        </div>
      )}

      {!customer.analysisComplete && !analyzing && (
        <div className="flex flex-col items-center justify-center gap-4 py-24">
          <p className="text-sm text-slate-400">No analysis for this customer yet</p>
          <button onClick={runAnalysis} className="h-9 px-6 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm rounded font-medium">
            Run Analysis
          </button>
        </div>
      )}

      {profileComplete && !analyzing && (
        <div className="p-6 space-y-6">
          <TopOpportunities scores={unownedScores} />
          <CompanyProfileCard profile={analysis.companyProfile} />
          <PropensityPipeline scoresByCategory={scoresByCategory} categoryStages={customer.categoryStages} onMarkAsBought={markAsBought} />
          <RoiRoadmap roadmap={analysis.roiRoadmap} />
          <OwnedProducts ownedByCategory={ownedByCategory} onUndo={undoBought} />
        </div>
      )}
    </div>
  )
}

// ============================================================
// SECTION 5 — API CLIENT
// ============================================================

async function analyzeCustomer(customer) {
  let keys
  try {
    const settings = await getSettings()
    keys = settings ?? {}
  } catch {
    throw new Error('Could not read API keys from settings — try reloading the app')
  }

  const anthropicKey = keys.anthropic?.trim()
  const tavilyKey    = keys.tavily?.trim()
  const model        = keys.model ?? 'sonnet'

  if (!anthropicKey) throw new Error('Anthropic API key not set — add it in the toolbar before running an analysis')
  if (!tavilyKey)    throw new Error('Tavily API key not set — add it in the toolbar before running an analysis')

  const payload = {
    customerId:    customer.id,
    companyName:   customer.name,
    ownedProducts: customer.ownedProducts ?? [],
    model,
    anthropicKey,
    tavilyKey,
  }

  let res
  try {
    res = await fetch('/fn/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
  } catch {
    throw new Error('Network error — check your connection and try again')
  }

  if (!res.ok) {
    let msg = `Analysis function returned HTTP ${res.status}`
    try {
      const errBody = await res.json()
      if (errBody?.error && typeof errBody.error === 'string') msg = errBody.error
    } catch { /* non-JSON error body */ }
    throw new Error(msg)
  }

  let data
  try {
    data = await res.json()
  } catch {
    throw new Error('Malformed response from analysis function — could not parse JSON')
  }

  const { companyProfile, productScores, roiRoadmap, modelVersion } = data

  if (!companyProfile)                                  throw new Error('Analysis response missing companyProfile')
  if (!Array.isArray(productScores) || !productScores.length) throw new Error('Analysis response missing productScores')
  if (!roiRoadmap?.phases?.length)                      throw new Error('Analysis response missing roiRoadmap')

  const analysisRecord = {
    id:            crypto.randomUUID(),
    customerId:    customer.id,
    analyzedAt:    new Date().toISOString(),
    companyProfile,
    productScores,
    roiRoadmap,
    modelVersion:  modelVersion ?? model,
  }

  try {
    await deleteAnalysesForCustomer(customer.id)
    await putAnalysis(analysisRecord)
  } catch {
    throw new Error('Analysis completed but could not be saved — try again or check available storage')
  }

  const updatedCustomer = { ...customer, analysisComplete: true, updatedAt: new Date().toISOString() }

  try {
    await putCustomer(updatedCustomer)
  } catch {
    console.warn('analyzeCustomer: analysis saved but customer record update failed')
  }

  return { customer: updatedCustomer, analysis: analysisRecord }
}

// ============================================================
// SECTION 6 — ROUTER AND EXPORT
// ============================================================

function NavBar() {
  const [model, setModelState] = useState('sonnet')

  useEffect(() => {
    getSettings().then(s => setModelState(s.model ?? 'sonnet'))
  }, [])

  async function handleModelChange(next) {
    setModelState(next)
    const s = await getSettings()
    await saveSettings({ ...s, model: next })
  }

  async function handleClearAll() {
    await clearAllData()
    window.location.reload()
  }

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="flex items-center justify-between px-4 h-16">

        <div className="flex items-center gap-3 select-none">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight tracking-tight">Cloud Voyager</h1>
            <p className="text-xs text-slate-400 leading-tight">Actionable sales insights</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 rounded-full p-0.5">
            <button
              onClick={() => handleModelChange('sonnet')}
              className={`px-3 h-7 rounded-full text-xs font-medium transition-colors ${
                model === 'sonnet' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Sonnet
            </button>
            <button
              onClick={() => handleModelChange('opus')}
              className={`px-3 h-7 rounded-full text-xs font-medium transition-colors ${
                model === 'opus' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Opus
            </button>
          </div>
          <button
            onClick={handleClearAll}
            className="h-8 px-3 rounded-md text-xs font-medium text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors"
          >
            Clear All Data
          </button>
        </div>

      </div>
    </header>
  )
}

function Layout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <NavBar />
      <Outlet />
    </div>
  )
}

function App() {
  useEffect(() => {
    document.getElementById('loading-screen')?.remove()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index                element={<CustomerListPage />}   />
          <Route path="/customer/:id" element={<CustomerDetailPage />} />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App