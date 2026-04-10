/**
 * 集中管理所有 system prompt 模板，避免跨文件重复。
 */

const BASE_SYSTEM_PROMPT =
  '你是一个智能笔记助手，帮助用户分析、编辑和改进笔记内容。请用中文回答。'

const NOTE_ACTION_BLOCK = `\`\`\`noteaction
{"type": "insert" 或 "replace", "content": "要写入的内容", "description": "操作说明"}
\`\`\``

/**
 * 构建 chat/agent 的完整 system prompt。
 * 与 main.ts ai:chatStart handler 和 agentLoop.ts buildActMessages 共用。
 */
export function buildSystemPrompt(options: {
  noteTitle?: string
  noteContext?: string
  skillSystemPrompt?: string
}): string {
  const { noteTitle, noteContext, skillSystemPrompt } = options

  let systemContent = BASE_SYSTEM_PROMPT

  if (skillSystemPrompt) {
    systemContent = skillSystemPrompt + '\n\n' + systemContent
  }

  if (noteTitle || noteContext) {
    systemContent += `\n\n当前笔记标题：${noteTitle || '无标题'}`
    if (noteContext) {
      systemContent += `\n当前笔记内容：\n${noteContext.slice(0, 4000)}`
    }
    systemContent += `\n\n如果用户要求修改笔记内容，请在回复末尾附上以下格式的 JSON 块（用 \`\`\`noteaction 包裹）：\n${NOTE_ACTION_BLOCK}\n只在用户明确要求编辑笔记时才附加这个 JSON 块。`
  }

  return systemContent
}
