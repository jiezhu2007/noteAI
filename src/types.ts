export interface Folder {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
  created_at: number
  updated_at: number
}

export interface Note {
  id: string
  title: string
  folder_id: string | null
  file_path: string
  is_pinned: number
  is_archived: number
  is_deleted: number
  deleted_at: number | null
  created_at: number
  updated_at: number
  tag_ids?: string
  tag_names?: string
  preview?: string
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Reminder {
  id: string
  title: string
  notes: string | null
  due_date: number | null
  priority: 0 | 1 | 2 | 3
  is_completed: number
  completed_at: number | null
  repeat_rule: string | null
  list_id: string | null
  linked_note_id: string | null
  created_at: number
  updated_at: number
}

export interface ReminderList {
  id: string
  name: string
  color: string
  sort_order: number
}

export type ReminderPriority = 'none' | 'low' | 'medium' | 'high'

export interface AIConfig {
  provider: 'ollama' | 'claude' | 'openai' | 'custom'
  ollamaBaseUrl: string
  ollamaModel: string
  claudeApiKey: string
  openaiApiKey: string
  openaiModel: string
  customBaseUrl: string
  customToken: string
  customModel: string
}

// Extend Window with Electron API
declare global {
  interface Window {
    electronAPI: {
      notes: {
        getAll: () => Promise<Note[]>
        create: (data: { title?: string; folderId?: string; content?: string }) => Promise<Note>
        update: (id: string, data: {
          title?: string
          folderId?: string | null
          isPinned?: boolean
          isArchived?: boolean
          isDeleted?: boolean
        }) => Promise<Note>
        delete: (id: string) => Promise<void>
        getContent: (filePath: string) => Promise<string>
        saveContent: (filePath: string, content: string) => Promise<boolean>
        search: (query: string) => Promise<Note[]>
      }
      folders: {
        getAll: () => Promise<Folder[]>
        create: (data: { name: string; parentId?: string }) => Promise<Folder>
        update: (id: string, data: any) => Promise<Folder>
        delete: (id: string) => Promise<void>
      }
      tags: {
        getAll: () => Promise<Tag[]>
        create: (name: string, color?: string) => Promise<Tag>
        setNoteTags: (noteId: string, tagIds: string[]) => Promise<void>
      }
      reminders: {
        getAll: () => Promise<Reminder[]>
        create: (data: any) => Promise<Reminder>
        update: (id: string, data: any) => Promise<Reminder>
        delete: (id: string) => Promise<void>
        complete: (id: string) => Promise<Reminder>
        getLists: () => Promise<ReminderList[]>
        createList: (data: { name: string; color?: string }) => Promise<ReminderList>
      }
      ai: {
        summarize: (content: string) => Promise<{ summary: string; keyPoints: string[] }>
        extractPoints: (content: string) => Promise<string[]>
        parseReminder: (text: string) => Promise<{
          title: string
          dueDate: string | null
          repeatRule: string | null
          confidence: number
        }>
        autocomplete: (context: string) => Promise<string>
        getConfig: () => Promise<AIConfig>
        setConfig: (config: Partial<AIConfig>) => Promise<AIConfig>
        testConnection: () => Promise<{ ok: boolean; message: string }>
      }
      on: (channel: string, callback: (...args: any[]) => void) => void
      off: (channel: string, callback: (...args: any[]) => void) => void
    }
  }
}
