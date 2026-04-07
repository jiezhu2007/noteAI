import { useRemindersStore } from '../../store/remindersStore'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  CheckCircle2, Circle, Trash2, Edit2, Plus,
  Flag, Clock, AlertCircle,
} from 'lucide-react'
import clsx from 'clsx'
import type { Reminder } from '../../types'

interface ReminderListProps {
  onEdit: (r: Reminder) => void
  onNew: () => void
}

const PRIORITY_LABELS = ['', '低优先级', '中优先级', '高优先级']
const PRIORITY_COLORS = ['', 'text-blue-500', 'text-orange-500', 'text-red-500']

export function ReminderList({ onEdit, onNew }: ReminderListProps) {
  const { filteredReminders, completeReminder, uncompleteReminder, deleteReminder, activeView } =
    useRemindersStore()
  const items = filteredReminders()

  const viewLabel: Record<string, string> = {
    today: '今天',
    planned: '已计划',
    all: '所有',
    completed: '已完成',
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {viewLabel[activeView] ?? '列表'}
        </h2>
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors"
        >
          <Plus size={14} />
          新建
        </button>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600 gap-3">
            <CheckCircle2 size={36} strokeWidth={1} />
            <p className="text-sm">没有提醒事项</p>
            <button
              onClick={onNew}
              className="text-xs text-primary-500 hover:underline"
            >
              创建提醒
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <ReminderItem
                key={item.id}
                reminder={item}
                onComplete={() =>
                  item.is_completed ? uncompleteReminder(item.id) : completeReminder(item.id)
                }
                onEdit={() => onEdit(item)}
                onDelete={() => deleteReminder(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ReminderItem({
  reminder,
  onComplete,
  onEdit,
  onDelete,
}: {
  reminder: Reminder
  onComplete: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const isPastDue =
    reminder.due_date !== null &&
    reminder.due_date < Date.now() &&
    !reminder.is_completed

  return (
    <div
      className={clsx(
        'group flex items-start gap-3 p-3 rounded-xl transition-colors',
        'hover:bg-gray-50 dark:hover:bg-gray-800/50',
        isPastDue && 'bg-red-50/50 dark:bg-red-900/10'
      )}
    >
      {/* Complete button */}
      <button
        onClick={onComplete}
        className={clsx(
          'mt-0.5 flex-shrink-0 transition-colors',
          reminder.is_completed
            ? 'text-green-500'
            : 'text-gray-300 dark:text-gray-600 hover:text-primary-500'
        )}
      >
        {reminder.is_completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={clsx(
            'text-sm',
            reminder.is_completed
              ? 'line-through text-gray-400 dark:text-gray-600'
              : 'text-gray-900 dark:text-gray-100'
          )}
        >
          {reminder.title}
        </p>

        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {reminder.due_date && (
            <span
              className={clsx(
                'flex items-center gap-1 text-xs',
                isPastDue ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'
              )}
            >
              {isPastDue ? <AlertCircle size={11} /> : <Clock size={11} />}
              {format(new Date(reminder.due_date), 'MM月dd日 HH:mm', { locale: zhCN })}
            </span>
          )}
          {reminder.priority > 0 && (
            <span
              className={clsx(
                'flex items-center gap-1 text-xs',
                PRIORITY_COLORS[reminder.priority]
              )}
            >
              <Flag size={11} />
              {PRIORITY_LABELS[reminder.priority]}
            </span>
          )}
          {reminder.notes && (
            <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[200px]">
              {reminder.notes}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={onEdit}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500"
        >
          <Edit2 size={13} />
        </button>
        <button
          onClick={onDelete}
          className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}
