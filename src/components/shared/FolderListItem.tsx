import clsx from 'clsx'
import { Folder } from 'lucide-react'
import type { Folder as FolderType } from '../../types'

/**
 * 通用文件夹列表项，供 Sidebar 和 NotesBrowserOverlay 复用。
 */
export function FolderListItem({
  folder,
  count,
  active,
  onClick,
}: {
  folder: FolderType
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
        active
          ? 'bg-primary-500 text-white'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
      )}
    >
      <Folder size={14} className="flex-shrink-0" />
      <span className="flex-1 truncate">{folder.name}</span>
      <span className={clsx('text-xs', active ? 'text-white/70' : 'text-gray-400')}>{count}</span>
    </button>
  )
}
