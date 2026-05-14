import { useState, useEffect, useRef } from 'react'
import { usePersistedState } from '../lib/usePersistedState'

export type MenuItem = {
  id: number
  name: string
  category: string
  price: number
  description: string
  available: boolean
  sort_order: number
}

type DraftItem = Omit<MenuItem, 'id' | 'sort_order'> & { id?: number }

const EMPTY: DraftItem = { name: '', category: '', price: 0, description: '', available: true }

// ── Category selector ─────────────────────────────────────────────────────────

function CategorySelect({
  value,
  categories,
  onChange,
}: {
  value: string
  categories: string[]
  onChange: (v: string) => void
}) {
  const NEW = '__new__'
  const [creatingNew, setCreatingNew] = useState(!categories.length || !categories.includes(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (creatingNew) inputRef.current?.focus()
  }, [creatingNew])

  if (creatingNew) {
    return (
      <div className="flex gap-1">
        <input
          ref={inputRef}
          required
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Category name…"
          className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800 transition"
        />
        {categories.length > 0 && (
          <button
            type="button"
            onClick={() => { setCreatingNew(false); onChange(categories[0]) }}
            className="px-3 py-2.5 rounded-xl border border-neutral-200 text-xs text-neutral-500 hover:bg-neutral-50 transition"
          >
            ← Back
          </button>
        )}
      </div>
    )
  }

  return (
    <select
      required
      value={value}
      onChange={e => {
        if (e.target.value === NEW) { setCreatingNew(true); onChange('') }
        else onChange(e.target.value)
      }}
      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800 transition bg-white"
    >
      {categories.map(cat => (
        <option key={cat} value={cat}>{cat}</option>
      ))}
      <option value={NEW}>＋ New category…</option>
    </select>
  )
}

// ── Item form modal ───────────────────────────────────────────────────────────

function ItemModal({
  item,
  categories,
  onSave,
  onClose,
}: {
  item: DraftItem
  categories: string[]
  onSave: (item: DraftItem) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<DraftItem>(item)
  const [priceStr, setPriceStr] = useState(item.price === 0 ? '' : String(item.price))
  const [saving, setSaving] = useState(false)

  function set<K extends keyof DraftItem>(key: K, value: DraftItem[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.category.trim()) return
    setSaving(true)
    try { await onSave({ ...form, price: parseFloat(priceStr) || 0 }) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-neutral-100">
        <h2 className="text-xl font-semibold text-neutral-800 mb-6">
          {form.id ? 'Edit item' : 'New item'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-1">
              Name
            </label>
            <input
              required
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-1">
              Category
            </label>
            <CategorySelect
              value={form.category}
              categories={categories}
              onChange={v => set('category', v)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-1">
              Price
            </label>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={priceStr}
              onChange={e => setPriceStr(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-1">
              Description
            </label>
            <input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Optional"
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800 transition"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.available}
              onChange={e => set('available', e.target.checked)}
              className="w-4 h-4 rounded accent-neutral-800"
            />
            <span className="text-sm text-neutral-700">Available to order</span>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-neutral-200 text-neutral-600 text-sm font-medium hover:bg-neutral-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-neutral-800 text-white text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 transition"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main editor ───────────────────────────────────────────────────────────────

export default function MenuEditor() {
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<DraftItem | null>(null)
  const [activeCategory, setActiveCategory] = usePersistedState('rm_menu_category', 'All')

  useEffect(() => {
    fetch('/api/menu')
      .then(r => r.json())
      .then(json => { if (json.data) setItems(json.data) })
      .finally(() => setLoading(false))
  }, [])

  const categoryList = Array.from(new Set(items.map(i => i.category)))
  const categories = ['All', ...categoryList]
  const visible = activeCategory === 'All' ? items : items.filter(i => i.category === activeCategory)

  async function deleteCategory(cat: string) {
    const affected = items.filter(i => i.category === cat)
    if (affected.length > 0 && !confirm(`Delete category "${cat}" and all ${affected.length} item(s) in it?`)) return
    await Promise.all(affected.map(i => fetch(`/api/menu/${i.id}`, { method: 'DELETE' })))
    setItems(is => is.filter(i => i.category !== cat))
    if (activeCategory === cat) setActiveCategory('All')
  }

  async function saveItem(draft: DraftItem) {
    const method = draft.id ? 'PUT' : 'POST'
    const url = draft.id ? `/api/menu/${draft.id}` : '/api/menu'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    const json = await res.json()
    if (!json.data) return
    setItems(is =>
      draft.id ? is.map(i => i.id === draft.id ? json.data : i) : [...is, json.data]
    )
    setEditing(null)
  }

  async function deleteItem(id: number) {
    await fetch(`/api/menu/${id}`, { method: 'DELETE' })
    setItems(is => is.filter(i => i.id !== id))
  }

  async function toggleAvailable(item: MenuItem) {
    const res = await fetch(`/api/menu/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: !item.available }),
    })
    const json = await res.json()
    if (json.data) setItems(is => is.map(i => i.id === item.id ? json.data : i))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-center gap-0 border-b border-neutral-200 flex-1 min-w-0 overflow-x-auto">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                activeCategory === cat
                  ? 'border-neutral-800 text-neutral-800'
                  : 'border-transparent text-neutral-400 hover:text-neutral-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeCategory !== 'All' && (
            <button
              onClick={() => deleteCategory(activeCategory)}
              className="px-3 py-2 text-sm font-medium rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition"
            >
              Delete category
            </button>
          )}
          <button
            onClick={() => setEditing({ ...EMPTY, category: categoryList[0] ?? '' })}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition"
          >
            + Add item
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-neutral-400 animate-pulse">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-neutral-400">No items yet. Click "Add item" to start.</p>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50">
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-neutral-400">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-neutral-400">Category</th>
                <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider text-neutral-400">Price</th>
                <th className="text-center px-4 py-3 text-xs font-medium uppercase tracking-wider text-neutral-400">Available</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map(item => (
                <tr key={item.id} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-neutral-800">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-neutral-400 mt-0.5">{item.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{item.category}</td>
                  <td className="px-4 py-3 text-right font-medium text-neutral-800">
                    {item.price.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <button
                        onClick={() => toggleAvailable(item)}
                        className={`relative w-9 h-5 rounded-full transition-colors ${
                          item.available ? 'bg-emerald-400' : 'bg-neutral-200'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                            item.available ? 'left-4' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 justify-end">
                      <button
                        onClick={() => setEditing(item)}
                        className="text-xs text-neutral-400 hover:text-neutral-700 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="text-xs text-red-400 hover:text-red-600 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ItemModal
          item={editing}
          categories={categoryList}
          onSave={saveItem}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
