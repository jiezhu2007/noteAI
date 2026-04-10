import { AIPanel } from '../components/AIPanel/AIPanel'
import { Editor } from '../components/Editor/Editor'
import { NoteList } from '../components/NoteList/NoteList'

export function NotesPage() {
  return (
    <div className="flex h-full">
      {/* AI conversation panel — left */}
      <div className="flex-1 min-w-[400px] min-h-0 flex flex-col overflow-hidden">
        <AIPanel />
      </div>

      {/* Divider */}
      <div className="w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

      {/* Note editor — center */}
      <div className="flex-1 min-w-[400px] min-h-0 flex flex-col overflow-hidden">
        <Editor />
      </div>

      {/* Divider */}
      <div className="w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0" />

      {/* Note list — right */}
      <NoteList />
    </div>
  )
}
