import { useState, useEffect, useRef } from 'react'
import { useNotesStore } from '../../store/notesStore'
import { FolderOpen, Plus, Search, Pin, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import clsx from 'clsx'
import type { Note } from '../../types'
import { FolderListItem } from '../shared/FolderListItem'

interface NotesBrowserOverlayProps {
  onClose: () => void
  onSelectNote: (note: Note) => void
}

export function NotesBrowserOverlay({ onClose, onSelectNote }: NotesBrowserOverlayProps) {
  const { folders, notes, createNote, selectedFolderId, selectFolder } = useNotesStore()
  const [localFolderId, setLocalFolderId] = useState<string | null>(selectedFolderId)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const filteredNotes = notes
    .filter((n) => !n.is_deleted && !n.is_archived)
    .filter((n) => localFolderId === null || n.folder_id === localFolderId)
    .sort((a, b) => b.updated_at - a.updated_at)

  const rootFolders = folders.filter((f) => !f.parent_id)
  const allNotesCount = notes.filter((n) => !n.is_deleted && !n.is_archived).length

  const handleCreate = async () => {
    await createNote()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 dark:bg-black/40" />

      {/* Panel */}
      <div
        ref={overlayRef}
        className="relative w-[640px] max-h-[70vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex overflow-hidden"
      >
        {/* Left: Folders */}
        <div className="w-[180px] flex-shrink-0 border-r border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 overflow-y-auto py-2 px-1.5">
          <button
            onClick={() => setLocalFolderId(null)}
            className={clsx(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
              localFolderId === null
                ? 'bg-primary-500 text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
          >
            <FolderOpen size={14} />
            <span className="flex-1 truncate">所有笔记</span>
            <span className={clsx('text-xs', localFolderId === null ? 'text-white/70' : 'text-gray-400')}>{allNotesCount}</span>
          </button>

          {rootFolders.map((folder) => {
            const count = notes.filter((n) => n.folder_id === folder.id && !n.is_deleted).length
            return (
              <FolderListItem
                key={folder.id}
                folder={folder}
                count={count}
                active={localFolderId === folder.id}
                onClick={() => setLocalFolderId(folder.id)}
              />
            )
          })}
        </div>

        {/* Right: Note cards */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {filteredNotes.length} 篇笔记
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCreate}
                className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-primary-500 transition-colors"
                title="新建笔记"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Note list */}
          <div className="flex-1 overflow-y-auto">
            {filteredNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600 gap-3 px-6 text-center py-12">
                <Search size={32} strokeWidth={1} />
                <p className="text-sm">暂无笔记</p>
                <button onClick={handleCreate} className="text-xs text-primary-500 hover:underline">
                  创建第一篇笔记
                </button>
              </div>
            ) : (
              filteredNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => {
                    selectFolder(localFolderId)
                    onSelectNote(note)
                  }}
                  className="px-3 py-3 cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <div className="flex items-start gap-1.5 mb-1">
                    {!!note.is_pinned && (
                      <Pin size={11} className="text-primary-500 mt-0.5 flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate leading-tight text-gray-900 dark:text-gray-100">
                      {note.title || '无标题'}
                    </span>
                  </div>
                  {note.preview && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate mb-1">{note.preview}</p>
                  )}
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true, locale: zhCN })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
