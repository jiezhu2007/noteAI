import { useState, useMemo } from 'react'
import { useNotesStore } from '../../store/notesStore'
import { FolderOpen, Folder, Plus, Trash2, ChevronRight, ChevronDown, Tag } from 'lucide-react'
import clsx from 'clsx'
import type { Folder as FolderType } from '../../types'

export function Sidebar() {
  const { folders, selectedFolderId, selectFolder, createFolder, deleteFolder, notes } =
    useNotesStore()
  const [newFolderName, setNewFolderName] = useState('')
  const [addingFolder, setAddingFolder] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const rootFolders = folders.filter((f) => !f.parent_id)

  const handleAddFolder = async () => {
    if (!newFolderName.trim()) return
    await createFolder(newFolderName.trim())
    setNewFolderName('')
    setAddingFolder(false)
  }

  const allNotesCount = useMemo(
    () => notes.filter((n) => !n.is_deleted && !n.is_archived).length,
    [notes],
  )

  const folderNoteCountMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const n of notes) {
      if (!n.is_deleted && n.folder_id) {
        map[n.folder_id] = (map[n.folder_id] ?? 0) + 1
      }
    }
    return map
  }, [notes])

  return (
    <div className="w-[220px] flex-shrink-0 h-full border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto py-3 px-2">
        {/* All Notes */}
        <SidebarItem
          label="所有笔记"
          count={allNotesCount}
          active={selectedFolderId === null}
          onClick={() => selectFolder(null)}
          icon={<FolderOpen size={15} />}
        />

        <div className="mt-3">
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
              文件夹
            </span>
            <button
              onClick={() => setAddingFolder(true)}
              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500"
            >
              <Plus size={13} />
            </button>
          </div>

          {addingFolder && (
            <div className="px-2 mb-1">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddFolder()
                  if (e.key === 'Escape') { setAddingFolder(false); setNewFolderName('') }
                }}
                onBlur={() => { if (!newFolderName.trim()) setAddingFolder(false) }}
                placeholder="文件夹名称"
                className="w-full text-sm px-2 py-1 rounded border border-primary-500 bg-white dark:bg-gray-700 outline-none"
              />
            </div>
          )}

          {rootFolders.map((folder) => (
            <FolderItem
              key={folder.id}
              folder={folder}
              allFolders={folders}
              allNotes={notes}
              selectedFolderId={selectedFolderId}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              onSelect={selectFolder}
              onDelete={deleteFolder}
              noteCount={folderNoteCountMap[folder.id] ?? 0}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function SidebarItem({
  label,
  count,
  active,
  onClick,
  icon,
}: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
        active
          ? 'bg-primary-500 text-white'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
      )}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span
          className={clsx(
            'text-xs',
            active ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function FolderItem({
  folder,
  allFolders,
  allNotes,
  selectedFolderId,
  expanded,
  onToggleExpand,
  onSelect,
  onDelete,
  noteCount,
}: {
  folder: FolderType
  allFolders: FolderType[]
  allNotes: { folder_id: string | null; is_deleted: number }[]
  selectedFolderId: string | null
  expanded: Set<string>
  onToggleExpand: (id: string) => void
  onSelect: (id: string) => void
  onDelete: (id: string) => Promise<void>
  noteCount: number
}) {
  const children = allFolders.filter((f) => f.parent_id === folder.id)
  const hasChildren = children.length > 0
  const isExpanded = expanded.has(folder.id)
  const isActive = selectedFolderId === folder.id

  // 子文件夹笔记数：单次 O(n) 预计算，避免每个子项重复过滤
  const childNoteCountMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const n of allNotes) {
      if (!n.is_deleted && n.folder_id) {
        map[n.folder_id] = (map[n.folder_id] ?? 0) + 1
      }
    }
    return map
  }, [allNotes])

  return (
    <div>
      <div
        className={clsx(
          'group flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer',
          isActive
            ? 'bg-primary-500 text-white'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
        )}
        onClick={() => onSelect(folder.id)}
      >
        {hasChildren ? (
          <button
            className="flex-shrink-0"
            onClick={(e) => { e.stopPropagation(); onToggleExpand(folder.id) }}
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}
        <Folder size={14} className="flex-shrink-0" />
        <span className="flex-1 truncate">{folder.name}</span>
        <span className={clsx('text-xs', isActive ? 'text-white/70' : 'text-gray-400 dark:text-gray-500')}>
          {noteCount}
        </span>
        <button
          className={clsx(
            'opacity-0 group-hover:opacity-100 flex-shrink-0 p-0.5 rounded transition-opacity',
            isActive ? 'hover:bg-white/20' : 'hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500'
          )}
          onClick={(e) => {
            e.stopPropagation()
            onDelete(folder.id)
          }}
        >
          <Trash2 size={11} />
        </button>
      </div>

      {isExpanded && hasChildren && (
        <div className="pl-4">
          {children.map((child) => (
            <FolderItem
              key={child.id}
              folder={child}
              allFolders={allFolders}
              allNotes={allNotes}
              selectedFolderId={selectedFolderId}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              onDelete={onDelete}
              noteCount={childNoteCountMap[child.id] ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}
