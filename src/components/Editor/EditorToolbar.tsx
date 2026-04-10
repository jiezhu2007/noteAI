import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold, Italic, Underline, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare,
  Quote, Code, Code2,
  Link, Image as ImageIcon,
} from 'lucide-react'
import clsx from 'clsx'

interface EditorToolbarProps {
  editor: Editor | null
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  if (!editor) return null

  const handleSetLink = () => {
    if (!linkUrl.trim()) {
      editor.chain().focus().unsetLink().run()
    } else {
      editor.chain().focus().setLink({ href: linkUrl.trim() }).run()
    }
    setLinkUrl('')
    setShowLinkInput(false)
  }

  const handleInsertImage = () => {
    const src = window.prompt('请输入图片 URL')
    if (src?.trim()) {
      editor.chain().focus().setImage({ src: src.trim() }).run()
    }
  }

  return (
    <div className="flex flex-col border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
      <div className="flex items-center gap-0.5 px-4 py-1.5 flex-wrap">
        <ToolGroup>
          <ToolBtn
            active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="标题 1"
          >
            <Heading1 size={14} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="标题 2"
          >
            <Heading2 size={14} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="标题 3"
          >
            <Heading3 size={14} />
          </ToolBtn>
        </ToolGroup>

        <Divider />

        <ToolGroup>
          <ToolBtn
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="加粗 ⌘B"
          >
            <Bold size={14} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="斜体 ⌘I"
          >
            <Italic size={14} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="下划线 ⌘U"
          >
            <Underline size={14} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="删除线"
          >
            <Strikethrough size={14} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="行内代码"
          >
            <Code size={14} />
          </ToolBtn>
        </ToolGroup>

        <Divider />

        <ToolGroup>
          <ToolBtn
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="无序列表"
          >
            <List size={14} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="有序列表"
          >
            <ListOrdered size={14} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('taskList')}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            title="任务列表"
          >
            <CheckSquare size={14} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="引用"
          >
            <Quote size={14} />
          </ToolBtn>
          <ToolBtn
            active={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            title="代码块"
          >
            <Code2 size={14} />
          </ToolBtn>
        </ToolGroup>

        <Divider />

        <ToolGroup>
          <ToolBtn
            active={editor.isActive('link')}
            onClick={() => {
              if (editor.isActive('link')) {
                editor.chain().focus().unsetLink().run()
              } else {
                setLinkUrl('')
                setShowLinkInput((v) => !v)
              }
            }}
            title="插入链接"
          >
            <Link size={14} />
          </ToolBtn>
          <ToolBtn
            active={false}
            onClick={handleInsertImage}
            title="插入图片"
          >
            <ImageIcon size={14} />
          </ToolBtn>
        </ToolGroup>
      </div>

      {/* Link input */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSetLink()
              if (e.key === 'Escape') setShowLinkInput(false)
            }}
            placeholder="https://..."
            className="flex-1 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 outline-none"
          />
          <button
            onClick={handleSetLink}
            className="text-xs px-2 py-1 rounded bg-primary-500 text-white hover:bg-primary-600 transition-colors"
          >
            确认
          </button>
          <button
            onClick={() => setShowLinkInput(false)}
            className="text-xs px-2 py-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            取消
          </button>
        </div>
      )}
    </div>
  )
}

function ToolGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center">{children}</div>
}

function ToolBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={clsx(
        'p-1.5 rounded transition-colors',
        active
          ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300'
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
}
