import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { DownloadSimple, File, FileImage, FilePdf, FileText, FileXls, FileZip, Paperclip, Trash } from '@phosphor-icons/react'
import { ApiError, downloadFile } from '../../api/client'
import { useDeleteAttachment, useUploadAttachment } from '../../api/hooks'
import type { Attachment } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { formatDateTime } from '../boards/status'

const MAX_BYTES = 10 * 1024 * 1024

function iconFor(a: Attachment) {
  const name = a.fileName.toLowerCase()
  const type = a.contentType
  if (type.startsWith('image/')) return <FileImage size={18} aria-hidden />
  if (type === 'application/pdf' || name.endsWith('.pdf')) return <FilePdf size={18} aria-hidden />
  if (name.endsWith('.doc') || name.endsWith('.docx') || name.endsWith('.txt') || type.startsWith('text/')) return <FileText size={18} aria-hidden />
  if (name.endsWith('.xls') || name.endsWith('.xlsx') || name.endsWith('.csv')) return <FileXls size={18} aria-hidden />
  if (name.endsWith('.zip') || name.endsWith('.rar') || name.endsWith('.7z')) return <FileZip size={18} aria-hidden />
  return <File size={18} aria-hidden />
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface AttachmentsSectionProps {
  boardId: string
  itemId: string
  attachments: Attachment[]
}

/** Files clipped to the item: a list you can add to by button or by dropping files onto it. */
export function AttachmentsSection({ boardId, itemId, attachments }: AttachmentsSectionProps) {
  const upload = useUploadAttachment(boardId)
  const remove = useDeleteAttachment(boardId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const addFiles = async (files: FileList | File[]) => {
    setError(null)
    for (const file of Array.from(files)) {
      if (file.size > MAX_BYTES) {
        setError(`"${file.name}" גדול מ-10 MB ולא צורף.`)
        continue
      }
      try {
        await upload.mutateAsync({ itemId, file })
      } catch (e) {
        setError(e instanceof ApiError ? (e.detail ?? e.title) : `"${file.name}" לא צורף. נסו שוב.`)
      }
    }
  }

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    // Copy first: a FileList is live and empties when the input's value is reset.
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length > 0) void addFiles(files)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files)
  }

  const download = async (a: Attachment) => {
    setBusyId(a.id)
    setError(null)
    try {
      await downloadFile(`/api/attachments/${a.id}`, a.fileName)
    } catch {
      setError(`לא ניתן להוריד את "${a.fileName}".`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section
      className={`px-4 pt-4 ${dragOver ? 'bg-accent-soft/50' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
      }}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-ink-2">
          קבצים
          {attachments.length > 0 && <span className="ms-1.5 font-normal text-pencil">{attachments.length}</span>}
        </h3>
        <input ref={fileRef} type="file" multiple className="sr-only" onChange={onInput} aria-label="בחירת קבצים לצירוף" />
        <Button size="sm" variant="ghost" icon={<Paperclip size={14} aria-hidden />} onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
          {upload.isPending ? 'מצרף…' : 'צירוף קובץ'}
        </Button>
      </div>

      {attachments.length === 0 ? (
        <p className={`mt-2 rounded-sm border border-dashed px-3 py-3 text-xs ${dragOver ? 'border-accent text-ink' : 'border-rule-strong text-pencil'}`}>
          {dragOver ? 'שחררו כדי לצרף' : 'אין קבצים. גררו לכאן קובץ, למשל מסמך אפיון, או לחצו על צירוף קובץ.'}
        </p>
      ) : (
        <ul className="ruled mt-1">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2.5 py-2 text-sm">
              <span className="shrink-0 text-ink-2">{iconFor(a)}</span>
              <button
                type="button"
                onClick={() => void download(a)}
                disabled={busyId === a.id}
                className="min-w-0 flex-1 text-start"
                title={`הורדת ${a.fileName}`}
              >
                <span className="block truncate text-ink hover:underline">{a.fileName}</span>
                <span className="block truncate text-xs text-pencil">
                  {formatSize(a.size)}, {a.uploadedByName}, {formatDateTime(a.uploadedAt)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void download(a)}
                disabled={busyId === a.id}
                aria-label={`הורדת ${a.fileName}`}
                className="pressable shrink-0 rounded-sm p-1 text-ink-2 hover:bg-paper-2 hover:text-ink"
              >
                <DownloadSimple size={16} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`להסיר את "${a.fileName}"?`)) remove.mutate(a.id)
                }}
                disabled={remove.isPending}
                aria-label={`הסרת ${a.fileName}`}
                className="pressable shrink-0 rounded-sm p-1 text-pencil hover:bg-paper-2 hover:text-stuck"
              >
                <Trash size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-stuck">
          {error}
        </p>
      )}
    </section>
  )
}
