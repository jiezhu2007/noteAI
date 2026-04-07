import { useState, useEffect } from 'react'
import { NotesPage } from './pages/Notes'
import { RemindersPage } from './pages/Reminders'
import { SettingsPage } from './pages/Settings'
import { SearchModal } from './components/SearchModal/SearchModal'
import { useNotesStore } from './store/notesStore'
import { useRemindersStore } from './store/remindersStore'
import { StickyNote, Bell, Settings } from 'lucide-react'
import clsx from 'clsx'

type Page = 'notes' | 'reminders' | 'settings'

export default function App() {
  const [page, setPage] = useState<Page>('notes')
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const [searchOpen, setSearchOpen] = useState(false)
  const { loadNotes, loadFolders, loadTags } = useNotesStore()
  const { loadReminders, loadLists, markFired } = useRemindersStore()

  // Apply theme
  useEffect(() => {
    const applyTheme = (t: typeof theme) => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      const dark = t === 'dark' || (t === 'system' && prefersDark)
      document.documentElement.classList.toggle('dark', dark)
    }
    applyTheme(theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme(theme)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  // Load initial data
  useEffect(() => {
    loadFolders()
    loadNotes()
    loadTags()
    loadReminders()
    loadLists()
  }, [])

  // Listen for reminder:fired events from main process
  useEffect(() => {
    const handler = (id: string) => {
      markFired(id)
    }
    window.electronAPI.on('reminder:fired', handler)
    return () => window.electronAPI.off('reminder:fired', handler)
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Titlebar */}
      <div className="drag-region flex items-center h-11 px-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
        {/* Traffic light placeholder */}
        <div className="w-16 flex-shrink-0" />

        {/* Nav tabs */}
        <div className="no-drag flex items-center gap-1 mx-auto">
          <NavTab
            active={page === 'notes'}
            icon={<StickyNote size={15} />}
            label="笔记"
            onClick={() => setPage('notes')}
          />
          <NavTab
            active={page === 'reminders'}
            icon={<Bell size={15} />}
            label="提醒"
            onClick={() => setPage('reminders')}
          />
        </div>

        {/* Right actions */}
        <div className="no-drag flex items-center gap-2 w-16 justify-end">
          <button
            onClick={() => setPage('settings')}
            className={clsx(
              'p-1.5 rounded-md transition-colors',
              page === 'settings'
                ? 'bg-gray-200 dark:bg-gray-700'
                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
          >
            <Settings size={15} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-hidden">
        {page === 'notes' && <NotesPage />}
        {page === 'reminders' && <RemindersPage />}
        {page === 'settings' && (
          <SettingsPage theme={theme} onThemeChange={setTheme} />
        )}
      </div>

      {/* Global search modal */}
      {searchOpen && (
        <SearchModal
          onClose={() => setSearchOpen(false)}
          onNavigateNote={(note) => {
            setPage('notes')
            useNotesStore.getState().selectNote(note)
            setSearchOpen(false)
          }}
        />
      )}
    </div>
  )
}

function NavTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
        active
          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
      )}
    >
      {icon}
      {label}
    </button>
  )
}
