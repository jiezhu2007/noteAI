import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Notes
  notes: {
    getAll: () => ipcRenderer.invoke('notes:getAll'),
    create: (data: { title?: string; folderId?: string }) =>
      ipcRenderer.invoke('notes:create', data),
    update: (id: string, data: Partial<{ title: string; folderId: string | null; isPinned: boolean; isArchived: boolean; isDeleted: boolean }>) =>
      ipcRenderer.invoke('notes:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
    getContent: (filePath: string) => ipcRenderer.invoke('notes:getContent', filePath),
    saveContent: (filePath: string, content: string) =>
      ipcRenderer.invoke('notes:saveContent', filePath, content),
    search: (query: string) => ipcRenderer.invoke('notes:search', query),
  },

  // Folders
  folders: {
    getAll: () => ipcRenderer.invoke('folders:getAll'),
    create: (data: { name: string; parentId?: string }) =>
      ipcRenderer.invoke('folders:create', data),
    update: (id: string, data: Partial<{ name: string; parentId: string; sortOrder: number }>) =>
      ipcRenderer.invoke('folders:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('folders:delete', id),
  },

  // Tags
  tags: {
    getAll: () => ipcRenderer.invoke('tags:getAll'),
    create: (name: string, color?: string) => ipcRenderer.invoke('tags:create', name, color),
    setNoteTags: (noteId: string, tagIds: string[]) =>
      ipcRenderer.invoke('tags:setNoteTags', noteId, tagIds),
  },

  // Reminders
  reminders: {
    getAll: () => ipcRenderer.invoke('reminders:getAll'),
    create: (data: { title: string; notes?: string; dueDate?: number; priority?: number; repeatRule?: string; listId?: string; linkedNoteId?: string }) =>
      ipcRenderer.invoke('reminders:create', data),
    update: (id: string, data: Partial<{ title: string; notes: string | null; dueDate: number | null; priority: number; repeatRule: string | null; listId: string | null; linkedNoteId: string | null; isCompleted: boolean; completedAt: number | null }>) =>
      ipcRenderer.invoke('reminders:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('reminders:delete', id),
    complete: (id: string) => ipcRenderer.invoke('reminders:complete', id),
    getLists: () => ipcRenderer.invoke('reminders:getLists'),
    createList: (data: { name: string; color?: string }) =>
      ipcRenderer.invoke('reminders:createList', data),
  },

  // AI
  ai: {
    summarize: (content: string) => ipcRenderer.invoke('ai:summarize', content),
    extractPoints: (content: string) => ipcRenderer.invoke('ai:extractPoints', content),
    parseReminder: (text: string) => ipcRenderer.invoke('ai:parseReminder', text),
    autocomplete: (context: string) => ipcRenderer.invoke('ai:autocomplete', context),
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    setConfig: (config: Partial<{ provider: string; ollamaBaseUrl: string; ollamaModel: string; claudeApiKey: string; openaiApiKey: string; openaiModel: string; customBaseUrl: string; customToken: string; customModel: string }>) =>
      ipcRenderer.invoke('ai:setConfig', config),
    testConnection: () => ipcRenderer.invoke('ai:testConnection'),
    chatStart: (request: { sessionId: string; messages: unknown[]; noteContext?: string; noteTitle?: string; skillSystemPrompt?: string }) =>
      ipcRenderer.invoke('ai:chatStart', request),
    chatStop: (sessionId: string) => ipcRenderer.invoke('ai:chatStop', sessionId),
    agentStart: (request: { sessionId: string; messages: unknown[]; noteContext?: string; noteTitle?: string; skillSystemPrompt?: string; skillReflectionCriteria?: unknown }) =>
      ipcRenderer.invoke('ai:agentStart', request),
    agentStop: (sessionId: string) => ipcRenderer.invoke('ai:agentStop', sessionId),
    getAgentConfig: () => ipcRenderer.invoke('ai:getAgentConfig'),
    setAgentConfig: (config: Partial<{ enabled: boolean; autoClassify: boolean; defaultLevel: number; passThreshold: number; maxTokenBudget: number }>) =>
      ipcRenderer.invoke('ai:setAgentConfig', config),
  },

  // Attachments
  attachments: {
    pick: () => ipcRenderer.invoke('attachment:pick'),
    processPath: (filePath: string) => ipcRenderer.invoke('attachment:processPath', filePath),
  },

  // Skills
  skills: {
    getConfig: () => ipcRenderer.invoke('skills:getConfig'),
    setConfig: (config: { disabledSkillIds: string[]; customSkills: unknown[] }) =>
      ipcRenderer.invoke('skills:setConfig', config),
  },

  // Events from main process
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const wrapper = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args)
    ipcRenderer.on(channel, wrapper)
    return wrapper
  },
  off: (channel: string, wrapper: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, wrapper as any)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
