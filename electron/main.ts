import { app, BrowserWindow, ipcMain, Notification, shell, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { initDB, getNotes, createNote, updateNote, deleteNote, searchNotes, getAllNotesForSearch, getFolders, createFolder, updateFolder, deleteFolder, getTags, createTag, setNoteTags, getReminders, createReminder, updateReminder, deleteReminder, completeReminder, getReminderLists, createReminderList, getSetting, setSetting } from './services/db'
import { fileStore } from './services/fileStore'
import { aiService } from './services/ai'
import { reminderService } from './services/reminder'
import { pickFile, processFile } from './services/attachment'
import { agentLoop, loadAgentConfig, saveAgentConfig } from './services/agentLoop'
import { buildSystemPrompt } from './services/promptTemplates'

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
    minWidth: 1100,
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
  const notes = getNotes() as any[]
  // 立即返回基础数据，不读磁盘
  const baseNotes = notes.map((note) => ({ ...note, preview: '' }))

  // 后台异步补充 preview（真正异步，不阻塞事件循环）
  Promise.all(
    notes.map(async (note) => {
      try {
        const raw = await fs.promises.readFile(note.file_path, 'utf-8')
        const plain = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
        return [note.id, plain.slice(0, 80)] as [string, string]
      } catch {
        return [note.id, ''] as [string, string]
      }
    })
  ).then((entries) => {
    const previews: Record<string, string> = Object.fromEntries(entries)
    mainWindow?.webContents.send('notes:previewsReady', previews)
  })

  return baseNotes
})

ipcMain.handle('notes:create', async (_, data) => {
  return createNote(data)
})

ipcMain.handle('notes:update', async (_, id, data) => {
  return updateNote(id, data)
})

ipcMain.handle('notes:delete', async (_, id) => {
  return deleteNote(id)
})

ipcMain.handle('notes:getContent', async (_, filePath) => {
  return fileStore.readNote(filePath)
})

ipcMain.handle('notes:saveContent', async (_, filePath, content) => {
  return fileStore.writeNote(filePath, content)
})

ipcMain.handle('notes:search', async (_, query) => {
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
  return getFolders()
})

ipcMain.handle('folders:create', async (_, data) => {
  return createFolder(data)
})

ipcMain.handle('folders:update', async (_, id, data) => {
  return updateFolder(id, data)
})

ipcMain.handle('folders:delete', async (_, id) => {
  return deleteFolder(id)
})

// ─── IPC: Tags ───────────────────────────────────────────────────────────────

ipcMain.handle('tags:getAll', async () => {
  return getTags()
})

ipcMain.handle('tags:create', async (_, name, color) => {
  return createTag(name, color)
})

ipcMain.handle('tags:setNoteTags', async (_, noteId, tagIds) => {
  return setNoteTags(noteId, tagIds)
})

// ─── IPC: Reminders ──────────────────────────────────────────────────────────

ipcMain.handle('reminders:getAll', async () => {
  return getReminders()
})

ipcMain.handle('reminders:create', async (_, data) => {
  const reminder = createReminder(data)
  reminderService.scheduleReminder(reminder, mainWindow)
  return reminder
})

ipcMain.handle('reminders:update', async (_, id, data) => {
  const reminder = updateReminder(id, data)
  reminderService.scheduleReminder(reminder, mainWindow)
  return reminder
})

ipcMain.handle('reminders:delete', async (_, id) => {
  reminderService.cancelReminder(id)
  return deleteReminder(id)
})

ipcMain.handle('reminders:complete', async (_, id) => {
  reminderService.cancelReminder(id)
  return completeReminder(id)
})

ipcMain.handle('reminders:getLists', async () => {
  return getReminderLists()
})

ipcMain.handle('reminders:createList', async (_, data) => {
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

// ─── IPC: AI Chat (Streaming) ───────────────────────────────────────────────

const activeStreams = new Map<string, AbortController>()

ipcMain.handle('ai:chatStart', async (event, request) => {
  const { sessionId, messages, noteContext, noteTitle, skillSystemPrompt } = request

  const systemContent = buildSystemPrompt({ noteTitle, noteContext, skillSystemPrompt })

  const fullMessages = [
    { role: 'system', content: systemContent },
    ...messages.map((m: any) => ({
      role: m.role,
      content: m.content,
      ...(m.images && m.images.length > 0 ? { images: m.images } : {}),
    })),
  ]

  const abortController = new AbortController()
  activeStreams.set(sessionId, abortController)

  const sender = event.sender

  // Run streaming in background — return sessionId immediately
  ;(async () => {
    try {
      await aiService.chatStream(
        fullMessages,
        (delta) => {
          if (!sender.isDestroyed()) {
            sender.send('ai:chatChunk', { sessionId, delta, done: false })
          }
        },
        abortController.signal,
      )
      if (!sender.isDestroyed()) {
        sender.send('ai:chatChunk', { sessionId, delta: '', done: true })
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        if (!sender.isDestroyed()) {
          sender.send('ai:chatChunk', { sessionId, delta: '', done: true })
        }
      } else {
        if (!sender.isDestroyed()) {
          sender.send('ai:chatChunk', {
            sessionId,
            delta: '',
            done: true,
            error: err.message || 'AI 服务错误',
          })
        }
      }
    } finally {
      activeStreams.delete(sessionId)
    }
  })()

  return sessionId
})

ipcMain.handle('ai:chatStop', async (_, sessionId) => {
  const controller = activeStreams.get(sessionId)
  if (controller) {
    controller.abort()
    activeStreams.delete(sessionId)
  }
})

// ─── IPC: AI Agent (Reflective) ────────────────────────────────────────────

ipcMain.handle('ai:agentStart', async (event, request) => {
  const { sessionId } = request

  const abortController = new AbortController()
  activeStreams.set(sessionId, abortController)

  const sender = event.sender

  ;(async () => {
    try {
      await agentLoop.run(
        request,
        (chunk) => {
          if (!sender.isDestroyed()) {
            sender.send('ai:agentChunk', chunk)
          }
        },
        abortController.signal,
      )
    } catch (err: any) {
      if (err.name !== 'AbortError' && !sender.isDestroyed()) {
        sender.send('ai:agentChunk', {
          sessionId,
          phase: 'error',
          iteration: 0,
          maxIterations: 0,
          error: err.message || 'Agent 运行错误',
        })
      }
    } finally {
      activeStreams.delete(sessionId)
    }
  })()

  return sessionId
})

ipcMain.handle('ai:agentStop', async (_, sessionId) => {
  const controller = activeStreams.get(sessionId)
  if (controller) {
    controller.abort()
    activeStreams.delete(sessionId)
  }
})

ipcMain.handle('ai:getAgentConfig', async () => {
  return loadAgentConfig()
})

ipcMain.handle('ai:setAgentConfig', async (_, config) => {
  const current = loadAgentConfig()
  return saveAgentConfig({ ...current, ...config })
})

// ─── IPC: Attachments ────────────────────────────────────────────────────────

ipcMain.handle('attachment:pick', async () => {
  return pickFile()
})

ipcMain.handle('attachment:processPath', async (_, filePath: string) => {
  try {
    return await processFile(filePath)
  } catch (e: any) {
    return null
  }
})

// ─── IPC: Shell ──────────────────────────────────────────────────────────────

ipcMain.handle('shell:openPath', async (_, filePath) => {
  return shell.openPath(filePath)
})

// ─── IPC: Skills Config ──────────────────────────────────────────────────────

ipcMain.handle('skills:getConfig', async () => {
  const raw = getSetting('skills_config')
  if (raw) {
    try { return JSON.parse(raw) } catch { /* fall through */ }
  }
  return { disabledSkillIds: [], customSkills: [] }
})

ipcMain.handle('skills:setConfig', async (_, config) => {
  setSetting('skills_config', JSON.stringify(config))
  return config
})
