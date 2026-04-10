import { app, dialog } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { randomUUID } from 'crypto'

export interface AttachmentResult {
  id: string
  filename: string
  ext: string
  mimeType: string
  storedPath: string
  size: number
  type: 'image' | 'text' | 'data'
  base64?: string
  textContent?: string
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_TEXT_LENGTH = 8000

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  // '.bmp' intentionally excluded: OpenAI Vision only supports png/jpeg/webp/gif
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
}

function getAttachmentsDir(): string {
  const dir = path.join(app.getPath('userData'), 'attachments')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getFileType(ext: string): 'image' | 'text' | 'data' {
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
  const textExts = ['.txt', '.md', '.csv', '.json']
  if (imageExts.includes(ext)) return 'image'
  if (textExts.includes(ext)) return 'text'
  return 'data' // pdf, xlsx etc.
}

export async function processFile(filePath: string): Promise<AttachmentResult> {
  const stat = fs.statSync(filePath)
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`文件大小超过限制 (${(stat.size / 1024 / 1024).toFixed(1)}MB > 10MB)`)
  }

  const ext = path.extname(filePath).toLowerCase()
  const filename = path.basename(filePath)
  const id = randomUUID()
  const storedPath = path.join(getAttachmentsDir(), `${id}${ext}`)

  // Copy file to attachments directory
  fs.copyFileSync(filePath, storedPath)

  const mimeType = MIME_MAP[ext] || 'application/octet-stream'
  const type = getFileType(ext)

  const result: AttachmentResult = {
    id,
    filename,
    ext,
    mimeType,
    storedPath,
    size: stat.size,
    type,
  }

  if (type === 'image') {
    const buf = fs.readFileSync(filePath)
    result.base64 = buf.toString('base64')
  } else if (type === 'text') {
    const content = fs.readFileSync(filePath, 'utf-8')
    result.textContent = content.slice(0, MAX_TEXT_LENGTH)
  } else if (ext === '.pdf') {
    try {
      const { PDFParse } = await import('pdf-parse')
      const buf = fs.readFileSync(filePath)
      const parser = new PDFParse({ data: new Uint8Array(buf) })
      const textResult = await parser.getText()
      result.textContent = textResult.text.slice(0, MAX_TEXT_LENGTH)
      await parser.destroy()
    } catch (e: any) {
      result.textContent = `[PDF 解析失败: ${e.message}]`
    }
  } else if (ext === '.xlsx' || ext === '.xls') {
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(fs.readFileSync(filePath))
      const sheets: string[] = []
      for (const sheetName of workbook.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName])
        sheets.push(`--- Sheet: ${sheetName} ---\n${csv}`)
      }
      result.textContent = sheets.join('\n\n').slice(0, MAX_TEXT_LENGTH)
    } catch (e: any) {
      result.textContent = `[Excel 解析失败: ${e.message}]`
    }
  }

  return result
}

export async function pickFile(): Promise<AttachmentResult | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: '所有支持的文件', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'xlsx', 'xls', 'csv', 'json', 'txt', 'md'] },
      { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
      { name: '文档', extensions: ['pdf', 'txt', 'md'] },
      { name: '数据', extensions: ['xlsx', 'xls', 'csv', 'json'] },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return processFile(result.filePaths[0])
}
