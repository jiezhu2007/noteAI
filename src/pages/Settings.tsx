import { useState, useEffect } from 'react'
import { Sun, Moon, Monitor, Server, Key, CheckCircle2, XCircle, Loader } from 'lucide-react'
import clsx from 'clsx'
import type { AIConfig } from '../types'

interface SettingsPageProps {
  theme: 'light' | 'dark' | 'system'
  onThemeChange: (t: 'light' | 'dark' | 'system') => void
}

export function SettingsPage({ theme, onThemeChange }: SettingsPageProps) {
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.electronAPI.ai.getConfig().then(setAiConfig)
  }, [])

  const handleSaveAI = async () => {
    if (!aiConfig) return
    setSaving(true)
    try {
      await window.electronAPI.ai.setConfig(aiConfig)
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    if (!aiConfig) return
    await window.electronAPI.ai.setConfig(aiConfig)
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.electronAPI.ai.testConnection()
      setTestResult(result)
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto py-10 px-8 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">设置</h1>

        {/* Appearance */}
        <Section title="外观">
          <div>
            <Label>主题</Label>
            <div className="flex gap-3 mt-2">
              {([
                { value: 'light', icon: <Sun size={16} />, label: '浅色' },
                { value: 'dark', icon: <Moon size={16} />, label: '深色' },
                { value: 'system', icon: <Monitor size={16} />, label: '跟随系统' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onThemeChange(opt.value)}
                  className={clsx(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                    theme === opt.value
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                  )}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* AI Configuration */}
        <Section title="AI 模型配置">
          {aiConfig && (
            <div className="space-y-4">
              {/* Provider */}
              <div>
                <Label>AI 服务商</Label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {(['ollama', 'claude', 'openai', 'custom'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setAiConfig({ ...aiConfig, provider: p })}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-sm border transition-colors capitalize',
                        aiConfig.provider === p
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                      )}
                    >
                      {p === 'ollama' ? 'Ollama（本地）' : p === 'claude' ? 'Claude API' : p === 'openai' ? 'OpenAI API' : '自定义'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ollama settings */}
              {aiConfig.provider === 'ollama' && (
                <>
                  <Field
                    label="Ollama 地址"
                    value={aiConfig.ollamaBaseUrl}
                    onChange={(v) => setAiConfig({ ...aiConfig, ollamaBaseUrl: v })}
                    placeholder="http://localhost:11434"
                  />
                  <Field
                    label="模型名称"
                    value={aiConfig.ollamaModel}
                    onChange={(v) => setAiConfig({ ...aiConfig, ollamaModel: v })}
                    placeholder="llama3"
                  />
                </>
              )}

              {/* Claude settings */}
              {aiConfig.provider === 'claude' && (
                <Field
                  label="Claude API Key"
                  value={aiConfig.claudeApiKey}
                  onChange={(v) => setAiConfig({ ...aiConfig, claudeApiKey: v })}
                  placeholder="sk-ant-..."
                  type="password"
                />
              )}

              {/* OpenAI settings */}
              {aiConfig.provider === 'openai' && (
                <>
                  <Field
                    label="OpenAI API Key"
                    value={aiConfig.openaiApiKey}
                    onChange={(v) => setAiConfig({ ...aiConfig, openaiApiKey: v })}
                    placeholder="sk-..."
                    type="password"
                  />
                  <Field
                    label="模型"
                    value={aiConfig.openaiModel}
                    onChange={(v) => setAiConfig({ ...aiConfig, openaiModel: v })}
                    placeholder="gpt-4o-mini"
                  />
                </>
              )}

              {/* Custom settings */}
              {aiConfig.provider === 'custom' && (
                <>
                  <Field
                    label="网关地址"
                    value={aiConfig.customBaseUrl}
                    onChange={(v) => setAiConfig({ ...aiConfig, customBaseUrl: v })}
                    placeholder="https://your-gateway.com"
                  />
                  <Field
                    label="Token"
                    value={aiConfig.customToken}
                    onChange={(v) => setAiConfig({ ...aiConfig, customToken: v })}
                    placeholder="Bearer Token 或 API Key"
                    type="password"
                  />
                  <Field
                    label="模型名称"
                    value={aiConfig.customModel}
                    onChange={(v) => setAiConfig({ ...aiConfig, customModel: v })}
                    placeholder="如 qwen-turbo、ernie-4.0 等"
                  />
                </>
              )}

              {/* Test connection */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {testing ? (
                    <Loader size={14} className="animate-spin" />
                  ) : (
                    <Server size={14} />
                  )}
                  测试连接
                </button>

                {testResult && (
                  <span
                    className={clsx(
                      'flex items-center gap-1.5 text-sm',
                      testResult.ok ? 'text-green-600' : 'text-red-500'
                    )}
                  >
                    {testResult.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    {testResult.message}
                  </span>
                )}
              </div>

              {/* Save */}
              <button
                onClick={handleSaveAI}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {saving ? '保存中…' : '保存配置'}
              </button>
            </div>
          )}
        </Section>

        {/* About */}
        <Section title="关于">
          <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
            <p>NoteAI v1.0.0</p>
            <p>智能笔记与提醒一体化 macOS 应用</p>
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-2">
              所有数据均存储在本地，不上传任何内容到云端。
            </p>
          </div>
        </Section>
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-all"
      />
    </div>
  )
}
