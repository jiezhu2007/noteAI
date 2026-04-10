import { useState } from 'react'
import { useSkillStore } from '../store/skillStore'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import type { Skill, CustomSkillData } from '../skills/types'

const CATEGORIES = [
  { value: 'analysis', label: '分析' },
  { value: 'writing', label: '写作' },
  { value: 'translation', label: '翻译' },
  { value: 'utility', label: '工具' },
] as const

type FormData = Omit<CustomSkillData, 'id'>

const emptyForm: FormData = {
  name: '',
  icon: '🔧',
  description: '',
  category: 'utility',
  systemPrompt: '',
  userPromptTemplate: '{input}',
}

export function SkillsPage() {
  const { skills, toggleSkillEnabled, addCustomSkill, updateCustomSkill, deleteCustomSkill } = useSkillStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormData>({ ...emptyForm })

  const builtinSkills = skills.filter((s) => s.isBuiltin)
  const customSkills = skills.filter((s) => !s.isBuiltin)

  const handleStartAdd = () => {
    setEditingId(null)
    setForm({ ...emptyForm })
    setShowForm(true)
  }

  const handleStartEdit = (skill: Skill) => {
    setEditingId(skill.id)
    setForm({
      name: skill.name,
      icon: skill.icon,
      description: skill.description,
      category: skill.category,
      systemPrompt: skill.systemPrompt || '',
      userPromptTemplate: skill.userPromptTemplate || '{input}',
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    if (editingId) {
      await updateCustomSkill(editingId, form)
    } else {
      await addCustomSkill(form)
    }
    setShowForm(false)
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    await deleteCustomSkill(id)
    if (editingId === id) {
      setShowForm(false)
      setEditingId(null)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto py-10 px-8 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">技能管理</h1>

        {/* Built-in skills */}
        <Section title="内置技能">
          <div className="space-y-1">
            {builtinSkills.map((skill) => (
              <SkillRow
                key={skill.id}
                skill={skill}
                onToggle={() => toggleSkillEnabled(skill.id)}
              />
            ))}
          </div>
        </Section>

        {/* Custom skills */}
        <Section title="自定义技能">
          {customSkills.length > 0 ? (
            <div className="space-y-1">
              {customSkills.map((skill) => (
                <SkillRow
                  key={skill.id}
                  skill={skill}
                  onToggle={() => toggleSkillEnabled(skill.id)}
                  onEdit={() => handleStartEdit(skill)}
                  onDelete={() => handleDelete(skill.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              暂无自定义技能，点击下方按钮添加。
            </p>
          )}
          <button
            onClick={handleStartAdd}
            className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:border-primary-400 hover:text-primary-500 transition-colors"
          >
            <Plus size={15} />
            添加自定义技能
          </button>
        </Section>

        {/* Add/Edit form */}
        {showForm && (
          <Section title={editingId ? '编辑技能' : '添加技能'}>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label>名称</Label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="如：代码审查"
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-all"
                  />
                </div>
                <div className="w-24">
                  <Label>图标</Label>
                  <input
                    value={form.icon}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    placeholder="🔧"
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 text-center outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-all"
                  />
                </div>
              </div>

              <div>
                <Label>描述</Label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="简要描述技能功能"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-all"
                />
              </div>

              <div>
                <Label>分类</Label>
                <div className="flex gap-2 mt-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setForm({ ...form, category: cat.value })}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-sm border transition-colors',
                        form.category === cat.value
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>系统提示词</Label>
                <textarea
                  value={form.systemPrompt}
                  onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                  placeholder="定义 AI 的角色和行为..."
                  rows={4}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-all resize-y"
                />
              </div>

              <div>
                <Label>用户提示词模板</Label>
                <textarea
                  value={form.userPromptTemplate}
                  onChange={(e) => setForm({ ...form, userPromptTemplate: e.target.value })}
                  placeholder="可用 {input} 代表用户输入，如：请将以下内容翻译成英文：{input}"
                  rows={3}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-all resize-y"
                />
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  使用 <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{'{input}'}</code> 占位符代表用户的实际输入内容
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={!form.name.trim()}
                  className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
                >
                  保存
                </button>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

function SkillRow({
  skill,
  onToggle,
  onEdit,
  onDelete,
}: {
  skill: Skill
  onToggle: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
  const enabled = skill.enabled !== false
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <span className="text-lg flex-shrink-0 w-7 text-center">{skill.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{skill.name}</div>
        <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{skill.description}</div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {onEdit && (
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="编辑"
          >
            <Pencil size={14} />
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        )}
        <button
          onClick={onToggle}
          className={clsx(
            'relative w-9 h-5 rounded-full transition-colors flex-shrink-0',
            enabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
          )}
        >
          <span
            className={clsx(
              'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
              enabled ? 'translate-x-4' : 'translate-x-0.5'
            )}
          />
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-4 pb-2 border-b border-gray-100 dark:border-gray-800">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-gray-600 dark:text-gray-400">{children}</label>
  )
}
