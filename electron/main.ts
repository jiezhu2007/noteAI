import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron'
import path from 'path'
import { initDB } from './services/db'
import { fileStore } from './services/fileStore'
import { aiService } from './services/ai'
import { reminderService } from './services/reminder'

// Fix: Chrome DevTools v127+ added Autofill CDP domain, but Electron 35 does not
// implement it. Disabling the feature prevents DevTools from requesting methods
// that return -32601 (method not found) errors in the terminal.
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication')

const isDev = process.env.NODE_ENV === 'development'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    vibrancy: 'sidebar',
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // Don't auto-open DevTools — Electron 35 CDP doesn't implement the Autofill
    // domain, causing -32601 errors whenever DevTools initializes the Autofill
    // panel. Open on demand with F12 or Cmd+Option+I instead.
    mainWindow.webContents.on('before-input-event', (_evt, input) => {
      if (
        input.type === 'keyDown' &&
        (input.key === 'F12' ||
          (input.meta && input.alt && input.key === 'I'))
      ) {
        mainWindow?.webContents.toggleDevTools()
      }
    })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  // Initialize database (sql.js init is async)
  await initDB()

  createWindow()

  // Initialize reminder service after window is created
  reminderService.startScheduler(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  reminderService.stopScheduler()
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Notes ──────────────────────────────────────────────────────────────

ipcMain.handle('notes:getAll', async () => {
  const { getNotes } = await import('./services/db')
  const notes = getNotes() as any[]
  // 为每条笔记补充正文摘要预览（前80字符，去HTML标签）
  return notes.map((note) => {
    try {
      const raw = fileStore.readNote(note.file_path)
      const plain = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      return { ...note, preview: plain.slice(0, 80) }
    } catch {
      return { ...note, preview: '' }
    }
  })
})

ipcMain.handle('notes:create', async (_, data) => {
  const { createNote } = await import('./services/db')
  return createNote(data)
})

ipcMain.handle('notes:update', async (_, id, data) => {
  const { updateNote } = await import('./services/db')
  return updateNote(id, data)
})

ipcMain.handle('notes:delete', async (_, id) => {
  const { deleteNote } = await import('./services/db')
  return deleteNote(id)
})

ipcMain.handle('notes:getContent', async (_, filePath) => {
  return fileStore.readNote(filePath)
})

ipcMain.handle('notes:saveContent', async (_, filePath, content) => {
  return fileStore.writeNote(filePath, content)
})

ipcMain.handle('notes:search', async (_, query) => {
  const { searchNotes, getAllNotesForSearch } = await import('./services/db')
  // 标题匹配
  const titleMatches = searchNotes(query) as any[]
  const matchedIds = new Set(titleMatches.map((n: any) => n.id))

  // 全文匹配（扫描正文文件）
  const allNotes = getAllNotesForSearch() as any[]
  const lowerQuery = query.toLowerCase()
  for (const note of allNotes) {
    if (matchedIds.has(note.id)) continue
    try {
      const content = fileStore.readNote(note.file_path)
      if (content && content.toLowerCase().includes(lowerQuery)) {
        titleMatches.push(note)
        matchedIds.add(note.id)
      }
    } catch {
      // 文件不存在，跳过
    }
    if (titleMatches.length >= 30) break
  }

  return titleMatches.slice(0, 30)
})

// ─── IPC: Folders ─────────────────────────────────────────────────────────────

ipcMain.handle('folders:getAll', async () => {
  const { getFolders } = await import('./services/db')
  return getFolders()
})

ipcMain.handle('folders:create', async (_, data) => {
  const { createFolder } = await import('./services/db')
  return createFolder(data)
})

ipcMain.handle('folders:update', async (_, id, data) => {
  const { updateFolder } = await import('./services/db')
  return updateFolder(id, data)
})

ipcMain.handle('folders:delete', async (_, id) => {
  const { deleteFolder } = await import('./services/db')
  return deleteFolder(id)
})

// ─── IPC: Tags ───────────────────────────────────────────────────────────────

ipcMain.handle('tags:getAll', async () => {
  const { getTags } = await import('./services/db')
  return getTags()
})

ipcMain.handle('tags:create', async (_, name, color) => {
  const { createTag } = await import('./services/db')
  return createTag(name, color)
})

ipcMain.handle('tags:setNoteTags', async (_, noteId, tagIds) => {
  const { setNoteTags } = await import('./services/db')
  return setNoteTags(noteId, tagIds)
})

// ─── IPC: Reminders ──────────────────────────────────────────────────────────

ipcMain.handle('reminders:getAll', async () => {
  const { getReminders } = await import('./services/db')
  return getReminders()
})

ipcMain.handle('reminders:create', async (_, data) => {
  const { createReminder } = await import('./services/db')
  const reminder = createReminder(data)
  reminderService.scheduleReminder(reminder, mainWindow)
  return reminder
})

ipcMain.handle('reminders:update', async (_, id, data) => {
  const { updateReminder } = await import('./services/db')
  const reminder = updateReminder(id, data)
  reminderService.scheduleReminder(reminder, mainWindow)
  return reminder
})

ipcMain.handle('reminders:delete', async (_, id) => {
  const { deleteReminder } = await import('./services/db')
  reminderService.cancelReminder(id)
  return deleteReminder(id)
})

ipcMain.handle('reminders:complete', async (_, id) => {
  const { completeReminder } = await import('./services/db')
  reminderService.cancelReminder(id)
  return completeReminder(id)
})

ipcMain.handle('reminders:getLists', async () => {
  const { getReminderLists } = await import('./services/db')
  return getReminderLists()
})

ipcMain.handle('reminders:createList', async (_, data) => {
  const { createReminderList } = await import('./services/db')
  return createReminderList(data)
})

// ─── IPC: AI ─────────────────────────────────────────────────────────────────

ipcMain.handle('ai:summarize', async (_, content) => {
  return aiService.summarize(content)
})

ipcMain.handle('ai:extractPoints', async (_, content) => {
  return aiService.extractKeyPoints(content)
})

ipcMain.handle('ai:parseReminder', async (_, text) => {
  return aiService.parseReminder(text)
})

ipcMain.handle('ai:autocomplete', async (_, context) => {
  return aiService.autocomplete(context)
})

ipcMain.handle('ai:getConfig', async () => {
  return aiService.getConfig()
})

ipcMain.handle('ai:setConfig', async (_, config) => {
  return aiService.setConfig(config)
})

ipcMain.handle('ai:testConnection', async () => {
  return aiService.testConnection()
})

// ─── IPC: Shell ──────────────────────────────────────────────────────────────

ipcMain.handle('shell:openPath', async (_, filePath) => {
  return shell.openPath(filePath)
})
