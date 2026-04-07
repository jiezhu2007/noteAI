import { useState } from 'react'
import { useRemindersStore } from '../store/remindersStore'
import { ReminderSidebar } from '../components/ReminderForm/ReminderSidebar'
import { ReminderList } from '../components/ReminderForm/ReminderList'
import { ReminderFormModal } from '../components/ReminderForm/ReminderFormModal'
import { NLReminderBar } from '../components/ReminderForm/NLReminderBar'
import type { Reminder } from '../types'

export function RemindersPage() {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Reminder | null>(null)
  const { setActiveView } = useRemindersStore()

  return (
    <div className="flex h-full">
      <ReminderSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Natural language input bar */}
        <NLReminderBar onCreated={() => {
          setActiveView('all')
        }} />

        {/* Reminder list */}
        <ReminderList
          onEdit={(r) => { setEditing(r); setFormOpen(true) }}
          onNew={() => { setEditing(null); setFormOpen(true) }}
        />
      </div>

      {formOpen && (
        <ReminderFormModal
          reminder={editing}
          onClose={() => { setFormOpen(false); setEditing(null) }}
        />
      )}
    </div>
  )
}
