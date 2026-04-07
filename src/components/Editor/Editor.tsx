import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Underline from '@tiptap/extension-underline'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import TextStyle from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { createLowlight } from 'lowlight'
import { useNotesStore } from '../../store/notesStore'
import { EditorToolbar } from './EditorToolbar'
import { Sparkles, CheckCircle, Loader } from 'lucide-react'
import clsx from 'clsx'

const lowlight = createLowlight()

interface EditorProps {
  onToggleAI: () => void
}

export function Editor({ onToggleAI }: EditorProps) {
  const { selectedNote, noteContent, updateNoteContent, updateNoteTitle, isSaving, isLoading } =
    useNotesStore()

  const [title, setTitle] = useState('')
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [slashMenu, setSlashMenu] = useState<{ open: boolean; pos: { top: number; left: number } }>({
    open: false,
    pos: { top: 0, left: 0 },
  })
  const slashPosRef = useRef<number | null>(null)

  const calcWords = useCallback((text: string) => {
    if (!text.trim()) return 0
    const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length
    const nonChinese = (text.replace(/[\u4e00-\u9fff]/g, ' ').trim().split(/\s+/).filter(Boolean)).length
    return chinese + nonChinese
  }, [])
  const isGeneratingRef = useRef(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const titleSaveTimer = useRef<ReturnType<typeof setTimeout>>()

  // 同步 isGenerating 到 ref，供 effect 内部读取（避免频繁重注册）
  useEffect(() => {
    isGeneratingRef.current = isGenerating
  }, [isGenerating])

  // Sync title from selected note
  useEffect(() => {
    setTitle(selectedNote?.title ?? '')
  }, [selectedNote?.id])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({ placeholder: '开始写点什么…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      Image,
      Link.configure({ openOnClick: false }),
      TextStyle,
      Highlight,
      Typography,
    ],
    content: noteContent,
    onUpdate({ editor }) {
      updateNoteContent(editor.getHTML())
      setWordCount(calcWords(editor.getText()))
    },
    editorProps: {
      handleKeyDown(view, event) {
        // Tab: accept AI suggestion
        if (event.key === 'Tab' && aiSuggestion) {
          event.preventDefault()
          const { state, dispatch } = view
          const { tr, selection } = state
          dispatch(tr.insertText(aiSuggestion, selection.from))
          setAiSuggestion('')
          return true
        }
        // Escape: cancel AI suggestion or close slash menu
        if (event.key === 'Escape' && aiSuggestion) {
          setAiSuggestion('')
          return true
        }
        if (event.key === 'Escape' && slashMenu.open) {
          setSlashMenu(s => ({ ...s, open: false }))
          return true
        }
        // Slash: open slash command menu
        if (event.key === '/') {
          const { from } = view.state.selection
          const coords = view.coordsAtPos(from)
          slashPosRef.current = from
          setSlashMenu({ open: true, pos: { top: coords.bottom + 6, left: coords.left } })
          return false
        }
        return false
      },
    },
  })

  // Update editor content when note changes
  useEffect(() => {
    if (editor && noteContent !== undefined && !isLoading) {
      editor.commands.setContent(noteContent, false)
      setWordCount(calcWords(editor.getText()))
    }
  }, [selectedNote?.id, isLoading])

  // AI inline autocomplete (debounced on typing pause)
  const autocompleteTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (!editor || !selectedNote) return

    const handleKeyUp = () => {
      if (autocompleteTimer.current) clearTimeout(autocompleteTimer.current)
      autocompleteTimer.current = setTimeout(async () => {
        // Only trigger if editor has focus and content
        if (!editor.isFocused || isGeneratingRef.current) return
        const text = editor.getText()
        if (text.length < 20) return

        try {
          setIsGenerating(true)
          const suggestion = await window.electronAPI.ai.autocomplete(text)
          if (suggestion.trim()) setAiSuggestion(suggestion)
        } catch {
          // AI not configured
        } finally {
          setIsGenerating(false)
        }
      }, 3000) // 3 second pause before triggering
    }

    editor.on('update', handleKeyUp)
    return () => {
      editor.off('update', handleKeyUp)
      if (autocompleteTimer.current) clearTimeout(autocompleteTimer.current)
    }
  }, [editor, selectedNote])

  const handleSlashAI = useCallback(async () => {
    if (!editor || slashPosRef.current === null) return
    setSlashMenu(s => ({ ...s, open: false }))

    // 删除 "/"：slashPosRef 记录的是光标在 "/" 之后的位置
    const slashFrom = slashPosRef.current
    editor.chain().focus()
      .deleteRange({ from: slashFrom, to: slashFrom + 1 })
      .run()

    const text = editor.getText()
    if (!text.trim()) return

    try {
      setIsGenerating(true)
      const suggestion = await window.electronAPI.ai.autocomplete(text)
      if (suggestion.trim()) {
        editor.chain().focus().insertContent(suggestion).run()
      }
    } catch {
      // AI not configured
    } finally {
      setIsGenerating(false)
    }
  }, [editor])

  // Close slash menu when clicking outside
  useEffect(() => {
    if (!slashMenu.open) return
    const handler = () => setSlashMenu(s => ({ ...s, open: false }))
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [slashMenu.open])

  const handleTitleChange = (val: string) => {
    setTitle(val)
    if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current)
    if (!selectedNote) return
    titleSaveTimer.current = setTimeout(() => {
      updateNoteTitle(selectedNote.id, val)
    }, 500)
  }

  // Cleanup title timer on unmount
  useEffect(() => {
    return () => {
      if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current)
    }
  }, [])

  if (!selectedNote) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 gap-4">
        <div className="text-6xl select-none">📝</div>
        <p className="text-sm">选择一篇笔记或新建</p>
        <p className="text-xs">⌘K 全局搜索</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
      {/* Toolbar */}
      <EditorToolbar editor={editor} onToggleAI={onToggleAI} />

      {/* Title */}
      <div className="px-10 pt-6 pb-2 flex-shrink-0">
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="无标题"
          className="w-full text-2xl font-bold bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600"
        />
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-y-auto px-10 pb-10 relative">
        <EditorContent editor={editor} className="tiptap min-h-full" />

        {/* AI autocomplete ghost text */}
        {aiSuggestion && (
          <div className="mt-0 pointer-events-none">
            <span className="text-gray-300 dark:text-gray-600 text-sm italic">
              {aiSuggestion}
            </span>
            <span className="ml-2 text-xs text-gray-300 dark:text-gray-600 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
              Tab 确认 · Esc 取消
            </span>
          </div>
        )}

        {/* Slash command menu */}
        {slashMenu.open && (
          <div
            style={{ position: 'fixed', top: slashMenu.pos.top, left: slashMenu.pos.left, zIndex: 50 }}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]"
            onMouseDown={e => e.stopPropagation()}
          >
            <button
              onMouseDown={(e) => { e.preventDefault(); handleSlashAI() }}
              className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
            >
              <Sparkles size={14} className="text-purple-500" /> AI 续写
            </button>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-10 py-1.5 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-500">
        <span>
          {wordCount} 词
        </span>
        <div className="flex items-center gap-1.5">
          {isGenerating && <Loader size={11} className="animate-spin" />}
          {isSaving ? (
            <span>保存中…</span>
          ) : (
            <span className="flex items-center gap-1">
              <CheckCircle size={11} className="text-green-500" /> 已保存
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
