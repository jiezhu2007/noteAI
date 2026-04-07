import { useState, useEffect } from 'react'
import { useRemindersStore } from '../../store/remindersStore'
import { X, Calendar, Flag, AlignLeft, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'
import clsx from 'clsx'
import type { Reminder } from '../../types'

interface ReminderFormModalProps {
  reminder: Reminder | null
  onClose: () => void
}

export function ReminderFormModal({ reminder, onClose }: ReminderFormModalProps) {
  const { createReminder, updateReminder, lists } = useRemindersStore()

  const [title, setTitle] = useState(reminder?.title ?? '')
  const [notes, setNotes] = useState(reminder?.notes ?? '')
  const [dueDate, setDueDate] = useState(
    reminder?.due_date
      ? format(new Date(reminder.due_date), "yyyy-MM-dd'T'HH:mm")
      : ''
  )
  const [priority, setPriority] = useState<0 | 1 | 2 | 3>(reminder?.priority ?? 0)
  const [listId, setListId] = useState(reminder?.list_id ?? lists[0]?.id ?? '')
  const [repeatRule, setRepeatRule] = useState(reminder?.repeat_rule ?? 'none')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      const data = {
        title: title.trim(),
        notes: notes.trim() || undefined,
        dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
        priority,
        listId: listId || undefined,
        repeatRule: repeatRule === 'none' ? undefined : repeatRule,
      }
      if (reminder) {
        await updateReminder(reminder.id, data)
      } else {
        await createReminder(data as any)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            {reminder ? '编辑提醒' : '新建提醒'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
          >
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          {/* Title */}
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            placeholder="提醒事项…"
            className="w-full text-base bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600"
          />

          {/* Notes */}
          <div className="flex items-start gap-2">
            <AlignLeft size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="备注"
              rows={2}
              className="flex-1 text-sm bg-transparent outline-none resize-none text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600"
            />
          </div>

          <div className="h-px bg-gray-100 dark:bg-gray-700" />

          {/* Due date */}
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-gray-400 flex-shrink-0" />
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none text-gray-700 dark:text-gray-300"
            />
          </div>

          {/* Repeat */}
          <div className="flex items-center gap-2">
            <RefreshCw size={15} className="text-gray-400 flex-shrink-0" />
            <select
              value={repeatRule}
              onChange={(e) => setRepeatRule(e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none text-gray-700 dark:text-gray-300"
            >
              <option value="none">不重复</option>
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
            </select>
          </div>

          {/* Priority */}
          <div className="flex items-center gap-2">
            <Flag size={15} className="text-gray-400 flex-shrink-0" />
            <div className="flex gap-2">
              {([0, 1, 2, 3] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={clsx(
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                    priority === p
                      ? p === 0
                        ? 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                        : p === 1
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600'
                        : p === 2
                        ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600'
                        : 'bg-red-100 dark:bg-red-900/40 text-red-600'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  )}
                >
                  {['无', '低', '中', '高'][p]}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          {lists.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-[15px] text-center text-gray-400 text-xs flex-shrink-0">≡</span>
              <select
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                className="flex-1 text-sm bg-transparent outline-none text-gray-700 dark:text-gray-300"
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white transition-colors disabled:opacity-50"
          >
            {saving ? '保存中…' : reminder ? '更新' : '添加'}
          </button>
        </div>
      </div>
    </div>
  )
}
