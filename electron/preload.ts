import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Notes
  notes: {
    getAll: () => ipcRenderer.invoke('notes:getAll'),
    create: (data: any) => ipcRenderer.invoke('notes:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('notes:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
    getContent: (filePath: string) => ipcRenderer.invoke('notes:getContent', filePath),
    saveContent: (filePath: string, content: string) =>
      ipcRenderer.invoke('notes:saveContent', filePath, content),
    search: (query: string) => ipcRenderer.invoke('notes:search', query),
  },

  // Folders
  folders: {
    getAll: () => ipcRenderer.invoke('folders:getAll'),
    create: (data: any) => ipcRenderer.invoke('folders:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('folders:update', id, data),
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
    create: (data: any) => ipcRenderer.invoke('reminders:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('reminders:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('reminders:delete', id),
    complete: (id: string) => ipcRenderer.invoke('reminders:complete', id),
    getLists: () => ipcRenderer.invoke('reminders:getLists'),
    createList: (data: any) => ipcRenderer.invoke('reminders:createList', data),
  },

  // AI
  ai: {
    summarize: (content: string) => ipcRenderer.invoke('ai:summarize', content),
    extractPoints: (content: string) => ipcRenderer.invoke('ai:extractPoints', content),
    parseReminder: (text: string) => ipcRenderer.invoke('ai:parseReminder', text),
    autocomplete: (context: string) => ipcRenderer.invoke('ai:autocomplete', context),
    getConfig: () => ipcRenderer.invoke('ai:getConfig'),
    setConfig: (config: any) => ipcRenderer.invoke('ai:setConfig', config),
    testConnection: () => ipcRenderer.invoke('ai:testConnection'),
  },

  // Events from main process
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args))
  },
  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback)
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
