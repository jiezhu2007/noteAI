import { create } from 'zustand'
import type { Reminder, ReminderList } from '../types'

interface RemindersState {
  reminders: Reminder[]
  lists: ReminderList[]
  selectedListId: string | null
  activeView: 'today' | 'planned' | 'all' | 'completed' | string

  loadReminders: () => Promise<void>
  loadLists: () => Promise<void>
  createReminder: (data: Partial<Reminder> & { title: string }) => Promise<Reminder>
  updateReminder: (id: string, data: Partial<Reminder>) => Promise<void>
  deleteReminder: (id: string) => Promise<void>
  completeReminder: (id: string) => Promise<void>
  uncompleteReminder: (id: string) => Promise<void>
  createList: (name: string, color?: string) => Promise<ReminderList>
  setActiveView: (view: string) => void
  markFired: (id: string) => Promise<void>
  filteredReminders: () => Reminder[]
}

export const useRemindersStore = create<RemindersState>((set, get) => ({
  reminders: [],
  lists: [],
  selectedListId: null,
  activeView: 'all',

  loadReminders: async () => {
    const reminders = await window.electronAPI.reminders.getAll()
    set({ reminders })
  },

  loadLists: async () => {
    const lists = await window.electronAPI.reminders.getLists()
    set({ lists })
  },

  createReminder: async (data) => {
    const reminder = await window.electronAPI.reminders.create(data)
    set((s) => ({ reminders: [reminder, ...s.reminders] }))
    return reminder
  },

  updateReminder: async (id, data) => {
    const updated = await window.electronAPI.reminders.update(id, data)
    set((s) => ({
      reminders: s.reminders.map((r) => (r.id === id ? updated : r)),
    }))
  },

  deleteReminder: async (id) => {
    await window.electronAPI.reminders.delete(id)
    set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) }))
  },

  completeReminder: async (id) => {
    const updated = await window.electronAPI.reminders.complete(id)
    set((s) => ({
      reminders: s.reminders.map((r) => (r.id === id ? updated : r)),
    }))
  },

  uncompleteReminder: async (id) => {
    const updated = await window.electronAPI.reminders.update(id, {
      isCompleted: false,
      completedAt: null,
    })
    set((s) => ({
      reminders: s.reminders.map((r) => (r.id === id ? updated : r)),
    }))
  },

  createList: async (name, color) => {
    const list = await window.electronAPI.reminders.createList({ name, color })
    set((s) => ({ lists: [...s.lists, list] }))
    return list
  },

  setActiveView: (view) => {
    set({ activeView: view })
  },

  markFired: async (id) => {
    // 提醒触发后刷新列表，获取最新状态
    await get().loadReminders()
  },

  filteredReminders: () => {
    const { reminders, activeView } = get()
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const todayEnd = todayStart + 86400000

    switch (activeView) {
      case 'today':
        return reminders.filter(
          (r) =>
            !r.is_completed &&
            r.due_date !== null &&
            r.due_date >= todayStart &&
            r.due_date < todayEnd
        )
      case 'planned':
        return reminders.filter((r) => !r.is_completed && r.due_date !== null)
      case 'completed':
        return reminders.filter((r) => r.is_completed)
      case 'all':
        return reminders.filter((r) => !r.is_completed)
      default:
        // Custom list
        return reminders.filter((r) => !r.is_completed && r.list_id === activeView)
    }
  },
}))
