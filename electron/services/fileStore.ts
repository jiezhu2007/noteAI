import fs from 'fs'
import path from 'path'

export const fileStore = {
  readNote(filePath: string): string {
    try {
      if (!fs.existsSync(filePath)) return ''
      return fs.readFileSync(filePath, 'utf-8')
    } catch {
      return ''
    }
  },

  writeNote(filePath: string, content: string): boolean {
    try {
      const dir = path.dirname(filePath)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(filePath, content, 'utf-8')
      return true
    } catch {
      return false
    }
  },

  deleteNote(filePath: string): boolean {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      return true
    } catch {
      return false
    }
  },
}
