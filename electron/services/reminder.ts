import { Notification, BrowserWindow } from 'electron'
import { getReminders, updateReminderDueDate } from './db'

interface ScheduledReminder {
  id: string
  timer: NodeJS.Timeout
}

function calcNextTime(ts: number, rule: string): number {
  const d = new Date(ts)
  if (rule === 'daily') d.setDate(d.getDate() + 1)
  else if (rule === 'weekly') d.setDate(d.getDate() + 7)
  else if (rule === 'monthly') d.setMonth(d.getMonth() + 1)
  return d.getTime()
}

class ReminderService {
  private timers = new Map<string, NodeJS.Timeout>()
  private pollingInterval: NodeJS.Timeout | null = null

  startScheduler(win: BrowserWindow | null) {
    // Schedule all existing pending reminders on startup
    const reminders = getReminders() as any[]
    for (const r of reminders) {
      if (!r.is_completed && r.due_date) {
        this.scheduleReminder(r, win)
      }
    }

    // Poll every minute to catch any missed reminders
    this.pollingInterval = setInterval(() => {
      const all = getReminders() as any[]
      for (const r of all) {
        if (!r.is_completed && r.due_date && !this.timers.has(r.id)) {
          this.scheduleReminder(r, win)
        }
      }
    }, 60_000)
  }

  stopScheduler() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
  }

  scheduleReminder(reminder: any, win: BrowserWindow | null) {
    if (!reminder?.due_date || reminder.is_completed) return

    // Cancel existing timer for this reminder
    this.cancelReminder(reminder.id)

    const dueTime = typeof reminder.due_date === 'number'
      ? reminder.due_date
      : new Date(reminder.due_date).getTime()

    const delay = dueTime - Date.now()
    if (delay <= 0) return // Already past due

    const timer = setTimeout(() => {
      this.fireNotification(reminder, win)
      this.timers.delete(reminder.id)
      // 处理重复提醒
      if (reminder.repeat_rule && reminder.repeat_rule !== 'none') {
        const nextTime = calcNextTime(dueTime, reminder.repeat_rule)
        updateReminderDueDate(reminder.id, nextTime)
        const updatedReminder = { ...reminder, due_date: nextTime }
        this.scheduleReminder(updatedReminder, win)
      }
    }, delay)

    this.timers.set(reminder.id, timer)
  }

  cancelReminder(id: string) {
    const timer = this.timers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(id)
    }
  }

  private fireNotification(reminder: any, win: BrowserWindow | null) {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: '⏰ NoteAI 提醒',
        body: reminder.title,
        silent: false,
      })
      notification.on('click', () => {
        if (win) {
          win.show()
          win.webContents.send('reminder:fired', reminder.id)
        }
      })
      notification.show()
    }

    // Also notify the renderer
    if (win) {
      win.webContents.send('reminder:fired', reminder.id)
    }
  }
}

export const reminderService = new ReminderService()
