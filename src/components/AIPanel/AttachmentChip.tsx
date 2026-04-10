import { FileText, Image, Table, X } from 'lucide-react'
import type { ChatAttachment } from '../../types'

interface AttachmentChipProps {
  attachment: ChatAttachment
  onRemove?: () => void
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const icon = attachment.type === 'image' ? <Image size={12} /> :
    attachment.type === 'data' ? <Table size={12} /> :
    <FileText size={12} />

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400 max-w-[180px]">
      {attachment.type === 'image' && attachment.base64 ? (
        <img
          src={`data:${attachment.mimeType};base64,${attachment.base64}`}
          alt={attachment.filename}
          className="w-5 h-5 rounded object-cover flex-shrink-0"
        />
      ) : (
        <span className="flex-shrink-0">{icon}</span>
      )}
      <span className="truncate">{attachment.filename}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600"
        >
          <X size={10} />
        </button>
      )}
    </div>
  )
}
