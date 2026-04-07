import { useState, useEffect, useRef } from 'react'
import { Search, X, FileText, Loader } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import clsx from 'clsx'
import type { Note } from '../../types'

interface SearchModalProps {
  onClose: () => void
  onNavigateNote: (note: Note) => void
}

export function SearchModal({ onClose, onNavigateNote }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Note[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!query.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const notes = await window.electronAPI.notes.search(query.trim())
        setResults(notes)
        setSelectedIndex(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [query])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      onNavigateNote(results[selectedIndex])
    }
  }

  const highlight = (text: string, query: string) => {
    if (!query) return text
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 dark:bg-yellow-700 text-inherit rounded px-0.5">
          {text.slice(idx, idx + query.length)}
        </mark>
        {text.slice(idx + query.length)}
      </>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          {loading ? (
            <Loader size={18} className="text-gray-400 animate-spin flex-shrink-0" />
          ) : (
            <Search size={18} className="text-gray-400 flex-shrink-0" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索笔记… (↑↓ 导航，Enter 打开，Esc 关闭)"
            className="flex-1 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {!query.trim() && (
            <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-600">
              输入关键词搜索笔记
            </div>
          )}
          {query.trim() && results.length === 0 && !loading && (
            <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-600">
              没有找到相关笔记
            </div>
          )}
          {results.map((note, i) => (
            <div
              key={note.id}
              onClick={() => onNavigateNote(note)}
              className={clsx(
                'flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors',
                i === selectedIndex
                  ? 'bg-primary-50 dark:bg-primary-900/20'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
              )}
            >
              <FileText size={15} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {highlight(note.title || '无标题', query)}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {formatDistanceToNow(new Date(note.updated_at), {
                    addSuffix: true,
                    locale: zhCN,
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>

        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
            {results.length} 个结果
          </div>
        )}
      </div>
    </div>
  )
}
