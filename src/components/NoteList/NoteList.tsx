import { useState, useEffect } from 'react'
import { useNotesStore } from '../../store/notesStore'
import { Plus, Pin, Search, Trash2, X, CheckSquare, Square } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import clsx from 'clsx'
import type { Note } from '../../types'

export function NoteList() {
  const {
    filteredNotes,
    selectedNoteId,
    selectNote,
    createNote,
    selectedNoteIds,
    toggleSelectNote,
    clearSelection,
    deleteNotes,
    deleteNote,
  } = useNotesStore()
  const notes = filteredNotes()

  const [contextMenu, setContextMenu] = useState<{ noteId: string; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextMenu])

  return (
    <div className="w-[280px] flex-shrink-0 h-full border-r border-gray-200 dark:border-gray-700 flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      {selectedNoteIds.length > 0 ? (
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
          <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
            已选 {selectedNoteIds.length} 篇
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => deleteNotes(selectedNoteIds)}
              className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors"
              title="删除选中笔记"
            >
              <Trash2 size={15} />
            </button>
            <button
              onClick={clearSelection}
              className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
              title="取消选择"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {notes.length} 篇笔记
          </span>
          <button
            onClick={createNote}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-primary-500 transition-colors"
            title="新建笔记 (⌘N)"
          >
            <Plus size={16} />
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600 gap-3 px-6 text-center">
            <Search size={32} strokeWidth={1} />
            <p className="text-sm">暂无笔记</p>
            <button
              onClick={createNote}
              className="text-xs text-primary-500 hover:underline"
            >
              创建第一篇笔记
            </button>
          </div>
        ) : (
          notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              active={note.id === selectedNoteId}
              selected={selectedNoteIds.includes(note.id)}
              multiSelectMode={selectedNoteIds.length > 0}
              onClick={() => selectNote(note)}
              onSelect={(e) => { e.stopPropagation(); toggleSelectNote(note.id) }}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ noteId: note.id, x: e.clientX, y: e.clientY })
              }}
            />
          ))
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 100 }}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[140px]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onMouseDown={() => { deleteNote(contextMenu.noteId); setContextMenu(null) }}
            className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
          >
            <Trash2 size={13} /> 删除笔记
          </button>
        </div>
      )}
    </div>
  )
}

function NoteCard({
  note,
  active,
  selected,
  multiSelectMode,
  onClick,
  onSelect,
  onContextMenu,
}: {
  note: Note
  active: boolean
  selected: boolean
  multiSelectMode: boolean
  onClick: () => void
  onSelect: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const timeAgo = formatDistanceToNow(new Date(note.updated_at), {
    addSuffix: true,
    locale: zhCN,
  })

  const tags = note.tag_names ? note.tag_names.split(',').filter(Boolean) : []

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={clsx(
        'group px-3 py-3 cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors relative',
        active
          ? 'bg-primary-50 dark:bg-primary-900/20 border-l-2 border-l-primary-500'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      )}
    >
      {/* Checkbox */}
      <div
        onClick={onSelect}
        className={clsx(
          'absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded transition-opacity',
          multiSelectMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
      >
        {selected
          ? <CheckSquare size={14} className="text-primary-500" />
          : <Square size={14} className="text-gray-400" />}
      </div>

      {/* 内容区 */}
      <div className={clsx(
        'transition-all',
        (multiSelectMode || selected) ? 'pl-4' : 'group-hover:pl-4'
      )}>
        <div className="flex items-start gap-1.5 mb-1">
          {!!note.is_pinned && (
            <Pin size={11} className="text-primary-500 mt-0.5 flex-shrink-0" />
          )}
          <span
            className={clsx(
              'text-sm font-medium truncate leading-tight',
              active ? 'text-primary-700 dark:text-primary-300' : 'text-gray-900 dark:text-gray-100'
            )}
          >
            {note.title || '无标题'}
          </span>
        </div>

        {note.preview && (
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate mb-1 leading-relaxed">
            {note.preview}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo}</span>
          {tags.length > 0 && (
            <div className="flex gap-1 overflow-hidden">
              {tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 truncate max-w-[60px]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
