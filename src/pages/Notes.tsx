import { useNotesStore } from '../store/notesStore'
import { Sidebar } from '../components/Sidebar/Sidebar'
import { NoteList } from '../components/NoteList/NoteList'
import { Editor } from '../components/Editor/Editor'
import { AIPanel } from '../components/AIPanel/AIPanel'
import { useState } from 'react'

export function NotesPage() {
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const { selectedNote } = useNotesStore()

  return (
    <div className="flex h-full">
      {/* Left sidebar - folders */}
      <Sidebar />

      {/* Note list */}
      <NoteList />

      {/* Editor area */}
      <div className="flex flex-1 overflow-hidden">
        <Editor onToggleAI={() => setAiPanelOpen((v) => !v)} />

        {/* AI Panel */}
        {aiPanelOpen && selectedNote && (
          <AIPanel onClose={() => setAiPanelOpen(false)} />
        )}
      </div>
    </div>
  )
}
