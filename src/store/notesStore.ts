import { create } from 'zustand'
import type { Note, Folder, Tag } from '../types'

interface NotesState {
  notes: Note[]
  folders: Folder[]
  tags: Tag[]
  selectedFolderId: string | null
  selectedNoteId: string | null
  selectedNote: Note | null
  noteContent: string
  isSaving: boolean
  isLoading: boolean
  forceEditorSync: number

  // Actions
  loadFolders: () => Promise<void>
  loadNotes: () => Promise<void>
  loadTags: () => Promise<void>
  selectNote: (note: Note | null) => Promise<void>
  selectFolder: (folderId: string | null) => void
  createNote: () => Promise<Note>
  updateNoteTitle: (id: string, title: string) => Promise<void>
  updateNoteContent: (content: string) => void
  deleteNote: (id: string) => Promise<void>
  selectedNoteIds: string[]
  toggleSelectNote: (id: string) => void
  clearSelection: () => void
  deleteNotes: (ids: string[]) => Promise<void>
  togglePin: (id: string) => Promise<void>
  archiveNote: (id: string) => Promise<void>
  createFolder: (name: string, parentId?: string) => Promise<Folder>
  deleteFolder: (id: string) => Promise<void>
  filteredNotes: () => Note[]
  applyAIContent: (content: string, mode: 'replace' | 'insert') => void
}

// saveTimer 是副作用状态，不应纳入响应式 Zustand store
let saveTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 通用 debounce 保存逻辑，避免在 updateNoteContent 和 applyAIContent 中重复。
 */
function scheduleSave(content: string, delay: number, getStore: () => NotesState) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    const { selectedNote } = getStore()
    if (!selectedNote) return
    useNotesStore.setState({ isSaving: true })
    await window.electronAPI.notes.saveContent(selectedNote.file_path, content)
    await window.electronAPI.notes.update(selectedNote.id, {})
    const now = Date.now()
    useNotesStore.setState((s) => ({
      notes: s.notes.map((n) => (n.id === selectedNote.id ? { ...n, updated_at: now } : n)),
      isSaving: false,
    }))
    saveTimer = null
  }, delay)
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  folders: [],
  tags: [],
  selectedFolderId: null,
  selectedNoteId: null,
  selectedNote: null,
  noteContent: '',
  isSaving: false,
  isLoading: false,
  forceEditorSync: 0,
  selectedNoteIds: [],

  loadFolders: async () => {
    const folders = await window.electronAPI.folders.getAll()
    set({ folders })
  },

  loadNotes: async () => {
    const notes = await window.electronAPI.notes.getAll()
    set({ notes })   // 立即渲染基础列表

    // 监听 preview 补丁，合并后自动解绑（wrapper 由 on() 返回，确保 off 能正确移除）
    let wrapper: ((...args: unknown[]) => void) | null = null
    const handler = (previews: Record<string, string>) => {
      useNotesStore.setState((s) => ({
        notes: s.notes.map((n) =>
          previews[n.id] !== undefined ? { ...n, preview: previews[n.id] } : n
        ),
      }))
      if (wrapper) window.electronAPI.off('notes:previewsReady', wrapper)
    }
    wrapper = window.electronAPI.on('notes:previewsReady', handler) as (...args: unknown[]) => void
  },

  loadTags: async () => {
    const tags = await window.electronAPI.tags.getAll()
    set({ tags })
  },

  selectFolder: (folderId) => {
    set({ selectedFolderId: folderId, selectedNoteId: null, selectedNote: null, noteContent: '' })
  },

  selectNote: async (note) => {
    if (!note) {
      set({ selectedNoteId: null, selectedNote: null, noteContent: '' })
      return
    }
    set({ isLoading: true, selectedNoteId: note.id, selectedNote: note })
    try {
      const content = await window.electronAPI.notes.getContent(note.file_path)
      set({ noteContent: content, isLoading: false })
    } catch {
      set({ noteContent: '', isLoading: false })
    }
  },

  createNote: async () => {
    const { selectedFolderId } = get()
    const note = await window.electronAPI.notes.create({
      title: '无标题',
      folderId: selectedFolderId ?? undefined,
    })
    await get().loadNotes()
    await get().selectNote(note)
    return note
  },

  updateNoteTitle: async (id, title) => {
    await window.electronAPI.notes.update(id, { title })
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, title } : n)),
      selectedNote: s.selectedNote?.id === id ? { ...s.selectedNote, title } : s.selectedNote,
    }))
  },

  updateNoteContent: (content) => {
    set({ noteContent: content, isSaving: false })
    if (!get().selectedNote) return
    scheduleSave(content, 1000, get)
  },

  deleteNote: async (id) => {
    await window.electronAPI.notes.delete(id)
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId,
      selectedNote: s.selectedNote?.id === id ? null : s.selectedNote,
      noteContent: s.selectedNoteId === id ? '' : s.noteContent,
    }))
  },

  toggleSelectNote: (id) => {
    set((s) => ({
      selectedNoteIds: s.selectedNoteIds.includes(id)
        ? s.selectedNoteIds.filter((x) => x !== id)
        : [...s.selectedNoteIds, id],
    }))
  },

  clearSelection: () => set({ selectedNoteIds: [] }),

  deleteNotes: async (ids) => {
    for (const id of ids) {
      await window.electronAPI.notes.delete(id)
    }
    set((s) => ({
      notes: s.notes.filter((n) => !ids.includes(n.id)),
      selectedNoteIds: [],
      selectedNoteId: ids.includes(s.selectedNoteId ?? '') ? null : s.selectedNoteId,
      selectedNote: ids.includes(s.selectedNote?.id ?? '') ? null : s.selectedNote,
      noteContent: ids.includes(s.selectedNoteId ?? '') ? '' : s.noteContent,
    }))
  },

  togglePin: async (id) => {
    const note = get().notes.find((n) => n.id === id)
    if (!note) return
    const newVal = note.is_pinned ? 0 : 1
    await window.electronAPI.notes.update(id, { isPinned: !!newVal })
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, is_pinned: newVal } : n)),
    }))
  },

  archiveNote: async (id) => {
    await window.electronAPI.notes.update(id, { isArchived: true })
    set((s) => ({
      notes: s.notes.filter((n) => n.id !== id),
      selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId,
    }))
  },

  createFolder: async (name, parentId) => {
    const folder = await window.electronAPI.folders.create({ name, parentId })
    await get().loadFolders()
    return folder
  },

  deleteFolder: async (id) => {
    await window.electronAPI.folders.delete(id)
    await get().loadFolders()
    if (get().selectedFolderId === id) {
      set({ selectedFolderId: null })
    }
  },

  filteredNotes: () => {
    const { notes, selectedFolderId } = get()
    if (!selectedFolderId) return notes
    return notes.filter((n) => n.folder_id === selectedFolderId)
  },

  applyAIContent: (content, mode) => {
    const { noteContent, selectedNote } = get()
    if (!selectedNote) return
    const newContent = mode === 'replace' ? content : noteContent + content
    set((s) => ({
      noteContent: newContent,
      forceEditorSync: s.forceEditorSync + 1,
    }))
    scheduleSave(newContent, 500, get)
  },
}))
