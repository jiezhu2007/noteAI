import { useState } from 'react'
import { useRemindersStore } from '../../store/remindersStore'
import { Calendar, CheckCircle2, Clock, Inbox, List, Plus } from 'lucide-react'
import clsx from 'clsx'

export function ReminderSidebar() {
  const { lists, activeView, setActiveView, reminders, createList } = useRemindersStore()
  const [showNewListInput, setShowNewListInput] = useState(false)
  const [newListName, setNewListName] = useState('')

  const handleCreateList = async () => {
    if (!newListName.trim()) return
    await createList(newListName.trim())
    setNewListName('')
    setShowNewListInput(false)
  }

  const todayCount = reminders.filter((r) => {
    if (r.is_completed) return false
    if (!r.due_date) return false
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    return r.due_date >= start && r.due_date < start + 86400000
  }).length

  const allCount = reminders.filter((r) => !r.is_completed).length
  const plannedCount = reminders.filter((r) => !r.is_completed && r.due_date !== null).length

  return (
    <div className="w-[220px] flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto py-3 px-2">
        {/* Smart lists */}
        <div className="space-y-0.5">
          <SmartItem
            icon={<Calendar size={15} className="text-blue-500" />}
            label="今天"
            count={todayCount}
            active={activeView === 'today'}
            onClick={() => setActiveView('today')}
          />
          <SmartItem
            icon={<Clock size={15} className="text-orange-500" />}
            label="已计划"
            count={plannedCount}
            active={activeView === 'planned'}
            onClick={() => setActiveView('planned')}
          />
          <SmartItem
            icon={<Inbox size={15} className="text-purple-500" />}
            label="所有"
            count={allCount}
            active={activeView === 'all'}
            onClick={() => setActiveView('all')}
          />
          <SmartItem
            icon={<CheckCircle2 size={15} className="text-green-500" />}
            label="已完成"
            active={activeView === 'completed'}
            onClick={() => setActiveView('completed')}
          />
        </div>

        {/* Custom lists */}
        {lists.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                我的列表
              </span>
              <button
                onClick={() => setShowNewListInput(true)}
                className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400"
              >
                <Plus size={13} />
              </button>
            </div>

            {showNewListInput && (
              <div className="px-2 mb-1 flex gap-1">
                <input
                  autoFocus
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateList()
                    if (e.key === 'Escape') { setShowNewListInput(false); setNewListName('') }
                  }}
                  onBlur={() => { if (!newListName.trim()) { setShowNewListInput(false) } }}
                  placeholder="列表名称"
                  className="flex-1 text-xs px-2 py-1 rounded border border-primary-500 bg-white dark:bg-gray-700 outline-none min-w-0"
                />
              </div>
            )}

            {lists.map((list) => {
              const count = reminders.filter(
                (r) => !r.is_completed && r.list_id === list.id
              ).length
              return (
                <button
                  key={list.id}
                  onClick={() => setActiveView(list.id)}
                  className={clsx(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                    activeView === list.id
                      ? 'bg-primary-500 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  )}
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: list.color }}
                  />
                  <span className="flex-1 truncate">{list.name}</span>
                  {count > 0 && (
                    <span className={clsx('text-xs', activeView === list.id ? 'text-white/70' : 'text-gray-400')}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function SmartItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
        active
          ? 'bg-primary-500 text-white'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
      )}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={clsx('text-xs', active ? 'text-white/70' : 'text-gray-400 dark:text-gray-500')}>
          {count}
        </span>
      )}
    </button>
  )
}
