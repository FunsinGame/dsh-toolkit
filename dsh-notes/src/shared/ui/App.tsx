/**
 * Shared notes application.
 *
 * The same component tree powers the standalone web app and the DSH activity
 * page. Data access and DSH-only sync/settings/conflict features arrive through
 * AppBackend.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppBackend, ConflictBox, EditorDraft } from './backend.ts'
import {
  isAuthError,
  isConflictError,
  NotesApiError,
  errorMessage,
} from '../errors.ts'
import type {
  ConflictDetail,
  ConflictSummary,
  FolderMeta,
  HostSettingsPublic,
  HostState,
  NoteDetail,
  NoteMeta,
  SearchResult,
  TreeSnapshot,
  VersionSummary,
} from '../types.ts'
import { formatBytes, formatDateTime, formatRelative, wordCount } from '../format.ts'
import { renderMarkdown, attachmentIdFromHref } from './markdown.ts'
import { ensureNotesStyles } from './styles.ts'
import {
  continueLine,
  findNext,
  indentSelection,
  insertAtCursor,
  insertBlock,
  prefixLines,
  replaceAll,
  replaceRange,
  TOOLBAR_ACTIONS,
  wrapSelection,
  type EditResult,
  type TextSelection,
} from './editor.ts'
import {
  IconCheck,
  IconChevron,
  IconClose,
  IconDownload,
  IconEdit,
  IconFolder,
  IconFolderOpen,
  IconHistory,
  IconMenu,
  IconMore,
  IconNote,
  IconPaperclip,
  IconPin,
  IconPlus,
  IconPreview,
  IconSearch,
  IconSettings,
  IconSplit,
  IconSync,
  IconTrash,
  IconUpload,
} from './icons.tsx'

type ViewMode = 'edit' | 'preview' | 'split'
type ThemeMode = 'auto' | 'light' | 'dark'

type DialogState =
  | { kind: 'none' }
  | { kind: 'prompt'; title: string; label: string; initial: string; placeholder?: string; submit: (value: string) => Promise<void> | void }
  | { kind: 'confirm'; title: string; message: string; confirmLabel?: string; danger?: boolean; submit: () => Promise<void> | void }
  | { kind: 'delete-folder'; folder: FolderMeta }
  | { kind: 'delete-note'; note: NoteMeta }
  | { kind: 'move-note'; note: NoteMeta }
  | { kind: 'settings' }
  | { kind: 'history' }
  | { kind: 'trash' }
  | { kind: 'conflict-list' }
  | { kind: 'conflict'; noteId: string }

interface ToastState {
  text: string
  kind: 'info' | 'success' | 'error'
}

export interface NotesAppProps {
  backend: AppBackend
  onLogout?: () => void
  brand?: string
}

const SELECTED_KEY = 'dsh-notes:selected'
const VIEW_KEY = 'dsh-notes:view'
const THEME_KEY = 'dsh-notes:theme'
const EXPANDED_KEY = 'dsh-notes:expanded'

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* Storage can be unavailable in private windows. */
  }
}

function isNoteDetail(value: unknown): value is NoteDetail {
  return typeof value === 'object' && value !== null && typeof (value as NoteDetail).id === 'string' && typeof (value as NoteDetail).content === 'string'
}

function draftFromNote(note: NoteDetail): EditorDraft {
  return {
    title: note.title,
    content: note.content,
    tags: note.tags,
    pinned: note.pinned,
    baseRevision: note.revision,
    dirty: false,
  }
}

export function NotesApp({ backend, onLogout, brand = '笔记' }: NotesAppProps): React.ReactElement {
  ensureNotesStyles()
  const [tree, setTree] = useState<TreeSnapshot | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [note, setNote] = useState<NoteDetail | null>(null)
  const [draft, setDraft] = useState<EditorDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = readStorage(VIEW_KEY)
    return stored === 'edit' || stored === 'preview' || stored === 'split' ? stored : 'split'
  })
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = readStorage(THEME_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto'
  })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [hostState, setHostState] = useState<HostState | null>(null)
  const [conflict, setConflict] = useState<ConflictBox | null>(null)
  const [conflictList, setConflictList] = useState<ConflictSummary[]>([])
  const [settings, setSettings] = useState<HostSettingsPublic | null>(null)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' })
  const [toast, setToast] = useState<ToastState | null>(null)
  const [externalChange, setExternalChange] = useState<NoteDetail | null>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [attachmentBusy, setAttachmentBusy] = useState(false)

  const selectedRef = useRef<string | null>(null)
  const noteRef = useRef<NoteDetail | null>(null)
  const draftRef = useRef<EditorDraft | null>(null)
  const draftsRef = useRef<Map<string, EditorDraft>>(new Map())
  const saveDraftRef = useRef<() => Promise<void>>(async () => undefined)
  const saveTimerRef = useRef<number | null>(null)
  const savePromiseRef = useRef<Promise<void> | null>(null)
  const pendingSaveRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const selectionRef = useRef<{ start: number; end: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const lastSyncRef = useRef<number | null>(null)
  const reloadingRef = useRef(false)
  const treeRef = useRef<TreeSnapshot | null>(null)

  selectedRef.current = selectedId
  noteRef.current = note
  draftRef.current = draft
  treeRef.current = tree

  const showToast = useCallback((text: string, kind: ToastState['kind'] = 'info'): void => {
    setToast({ text, kind })
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3600)
  }, [])

  const reloadTreeQuiet = useCallback(async (): Promise<TreeSnapshot | null> => {
    try {
      const next = await backend.getTree()
      setTree(next)
      treeRef.current = next
      return next
    } catch (caught) {
      if (isAuthError(caught)) setError('登录已过期，请重新登录')
      return null
    }
  }, [backend])

  const selectFirstAvailable = useCallback((snapshot: TreeSnapshot | null): string | null => {
    if (snapshot === null) return null
    const stored = readStorage(SELECTED_KEY)
    if (stored !== null && snapshot.notes.some((item) => item.id === stored)) return stored
    return snapshot.notes[0]?.id ?? null
  }, [])

  const openNote = useCallback(async (id: string): Promise<void> => {
    if (id === selectedRef.current && noteRef.current !== null) return
    if (draftRef.current !== null && draftRef.current.dirty && selectedRef.current !== null) {
      await saveDraftRef.current()
    }
    setLoading(true)
    setError(null)
    try {
      const fresh = await backend.getNote(id)
      const cachedDraft = draftsRef.current.get(id)
      const nextDraft = cachedDraft !== undefined && cachedDraft.dirty ? cachedDraft : draftFromNote(fresh)
      setSelectedId(id)
      selectedRef.current = id
      setNote(fresh)
      noteRef.current = fresh
      setDraft(nextDraft)
      draftRef.current = nextDraft
      selectionRef.current = null
      setSavedAt(fresh.updatedAt)
      setConflict(null)
      setExternalChange(null)
      setFindOpen(false)
      writeStorage(SELECTED_KEY, id)
      setSidebarOpen(false)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [backend])

  const saveDraftInternal = useCallback(async (options: { force?: boolean } = {}): Promise<void> => {
    const currentDraft = draftRef.current
    const currentNote = noteRef.current
    const id = selectedRef.current
    if (currentDraft === null || currentNote === null || id === null) return
    if (!currentDraft.dirty && options.force !== true) return
    if (savePromiseRef.current !== null) {
      pendingSaveRef.current = true
      return savePromiseRef.current
    }
    const payload = {
      baseRevision: currentDraft.baseRevision,
      title: currentDraft.title,
      content: currentDraft.content,
      tags: currentDraft.tags,
      pinned: currentDraft.pinned,
    }
    const run = (async () => {
      setSaving(true)
      try {
        const updated = await backend.updateNote(id, payload)
        if (selectedRef.current !== id) return
        noteRef.current = updated
        setNote(updated)
        setSavedAt(Date.now())
        const latest = draftRef.current
        const changedDuringSave = latest !== null
          && (latest.content !== payload.content || latest.title !== payload.title
            || JSON.stringify(latest.tags) !== JSON.stringify(payload.tags) || latest.pinned !== payload.pinned)
        if (changedDuringSave) {
          const next = { ...latest, baseRevision: updated.revision, dirty: true }
          draftRef.current = next
          setDraft(next)
          pendingSaveRef.current = true
        } else if (latest !== null) {
          const next = { ...latest, baseRevision: updated.revision, dirty: false }
          draftRef.current = next
          setDraft(next)
          draftsRef.current.delete(id)
        }
        setError(null)
        setConflict(null)
        void reloadTreeQuiet()
      } catch (caught) {
        if (isConflictError(caught)) {
          const payloadError = caught as NotesApiError
          const current = isNoteDetail((payloadError.payload as { current?: unknown } | null)?.current)
            ? (payloadError.payload as { current: NoteDetail }).current
            : await backend.getNote(id).catch(() => null)
          if (current !== null && isNoteDetail(current)) {
            setConflict({ noteId: id, serverNote: current, local: draftRef.current ?? draftFromNote(current) })
            setError('检测到冲突：服务器上的这条笔记已被修改，请选择处理方式。')
          } else {
            setError('保存冲突，请刷新后重试。')
          }
        } else if (isAuthError(caught)) {
          setError('登录已过期，请重新登录')
        } else {
          setError(errorMessage(caught))
        }
      } finally {
        setSaving(false)
      }
    })()
    savePromiseRef.current = run
    try {
      await run
    } finally {
      savePromiseRef.current = null
    }
    if (pendingSaveRef.current) {
      pendingSaveRef.current = false
      if (draftRef.current !== null && draftRef.current.dirty) {
        window.setTimeout(() => { void saveDraftInternal() }, 60)
      }
    }
  }, [backend, reloadTreeQuiet])
  saveDraftRef.current = saveDraftInternal

  const initiallyLoadedRef = useRef(false)
  useEffect(() => {
    if (initiallyLoadedRef.current) return
    initiallyLoadedRef.current = true
    void (async () => {
      setLoading(true)
      const snapshot = await reloadTreeQuiet()
      const preferred = selectFirstAvailable(snapshot)
      if (preferred !== null) await openNote(preferred)
      setLoading(false)
    })()
  }, [openNote, reloadTreeQuiet, selectFirstAvailable])

  useEffect(() => {
    if (backend.subscribe === undefined) return
    return backend.subscribe(() => {
      if (reloadingRef.current) return
      reloadingRef.current = true
      void (async () => {
        try {
          const snapshot = await reloadTreeQuiet()
          const id = selectedRef.current
          if (id === null || snapshot === null) return
          const meta = snapshot.notes.find((item) => item.id === id)
          if (meta === undefined) {
            setSelectedId(null)
            setNote(null)
            setDraft(null)
            return
          }
          if (draftRef.current === null || !draftRef.current.dirty) {
            const fresh = await backend.getNote(id)
            if (fresh.revision !== draftRef.current?.baseRevision) {
              setNote(fresh)
              setDraft(draftFromNote(fresh))
              draftRef.current = draftFromNote(fresh)
              setSavedAt(fresh.updatedAt)
            }
          } else if (meta.revision !== draftRef.current.baseRevision) {
            setExternalChange(await backend.getNote(id))
          }
        } catch {
          /* The next invalidation retries. */
        } finally {
          reloadingRef.current = false
        }
      })()
    })
  }, [backend, reloadTreeQuiet])

  useEffect(() => {
    if (backend.getState === undefined) return
    let cancelled = false
    const tick = async (): Promise<void> => {
      try {
        const state = await backend.getState!()
        if (cancelled) return
        setHostState(state)
        setSettings(state.settings)
        if (state.sync.conflicts > 0) {
          const list = await backend.getConflicts?.().catch(() => [])
          if (!cancelled && list !== undefined) setConflictList(list)
        } else if (conflictList.length > 0) {
          setConflictList([])
        }
        if (state.configured && state.sync.pending === 0 && state.sync.lastSyncAt !== null
          && state.sync.lastSyncAt !== lastSyncRef.current) {
          lastSyncRef.current = state.sync.lastSyncAt
          const snapshot = await reloadTreeQuiet()
          if (snapshot === null || cancelled) return
          const id = selectedRef.current
          if (id !== null && draftRef.current !== null && !draftRef.current.dirty) {
            const fresh = await backend.getNote(id).catch(() => null)
            if (fresh !== null && fresh.revision !== draftRef.current.baseRevision) {
              setNote(fresh)
              const next = draftFromNote(fresh)
              draftRef.current = next
              setDraft(next)
              setSavedAt(fresh.updatedAt)
              setExternalChange(null)
            }
          }
        }
      } catch (caught) {
        if (!cancelled && isAuthError(caught)) setError('登录已过期，请重新登录')
      }
    }
    void tick()
    const timer = window.setInterval(() => { void tick() }, 3000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [backend, conflictList.length, reloadTreeQuiet])

  useEffect(() => {
    if (draft === null || !draft.dirty || conflict !== null) return
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => { void saveDraftInternal() }, 800)
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    }
  }, [draft, conflict, saveDraftInternal])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (draftRef.current?.dirty === true) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    if (query.trim() === '') {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = window.setTimeout(() => {
      void backend.search(query.trim(), { limit: 50 }).then((found) => {
        setResults(found)
        setSearching(false)
      }).catch((caught) => {
        setSearching(false)
        setError(errorMessage(caught))
      })
    }, 280)
    return () => window.clearTimeout(timer)
  }, [backend, query])

  useEffect(() => { writeStorage(VIEW_KEY, viewMode) }, [viewMode])
  useEffect(() => { writeStorage(THEME_KEY, theme) }, [theme])

  const updateDraft = useCallback((patch: Partial<EditorDraft>, dirty = true): void => {
    setDraft((previous) => {
      if (previous === null) return previous
      const next = { ...previous, ...patch, dirty: previous.dirty || dirty }
      draftRef.current = next
      if (selectedRef.current !== null) draftsRef.current.set(selectedRef.current, next)
      return next
    })
  }, [])

  const handleCreateNote = useCallback(async (folderId: string | null = null): Promise<void> => {
    try {
      await saveDraftInternal()
      const created = await backend.createNote({ folderId, title: '', content: '' })
      await reloadTreeQuiet()
      await openNote(created.id)
      showToast('已创建笔记', 'success')
    } catch (caught) {
      setError(errorMessage(caught))
      showToast(errorMessage(caught), 'error')
    }
  }, [backend, openNote, reloadTreeQuiet, saveDraftInternal, showToast])

  const handleCreateFolder = useCallback((parentId: string | null = null): void => {
    setDialog({
      kind: 'prompt',
      title: '新建目录',
      label: '目录名称',
      initial: '',
      submit: async (value) => {
        const name = value.trim()
        if (name === '') return
        try {
          await backend.createFolder({ name, parentId })
          await reloadTreeQuiet()
          setDialog({ kind: 'none' })
          showToast('已创建目录', 'success')
        } catch (caught) {
          showToast(errorMessage(caught), 'error')
        }
      },
    })
  }, [backend, reloadTreeQuiet, showToast])

  const handleRenameFolder = useCallback((folder: FolderMeta): void => {
    setDialog({
      kind: 'prompt',
      title: '重命名目录',
      label: '目录名称',
      initial: folder.name,
      submit: async (value) => {
        const name = value.trim()
        if (name === '' || name === folder.name) {
          setDialog({ kind: 'none' })
          return
        }
        try {
          await backend.updateFolder(folder.id, { baseRevision: folder.revision, name })
          await reloadTreeQuiet()
          setDialog({ kind: 'none' })
          showToast('目录已重命名', 'success')
        } catch (caught) {
          showToast(errorMessage(caught), 'error')
        }
      },
    })
  }, [backend, reloadTreeQuiet, showToast])

  const handleMoveNote = useCallback((meta: NoteMeta): void => {
    setDialog({ kind: 'move-note', note: meta })
  }, [])

  const handleDeleteNote = useCallback((meta: NoteMeta): void => {
    setDialog({ kind: 'delete-note', note: meta })
  }, [])

  const handleDeleteFolder = useCallback((folder: FolderMeta): void => {
    setDialog({ kind: 'delete-folder', folder })
  }, [])

  const handleLogout = useCallback(async (): Promise<void> => {
    try {
      await backend.logout?.()
    } finally {
      onLogout?.()
    }
  }, [backend, onLogout])

  const applyToolbar = useCallback((action: string): void => {
    const currentDraft = draftRef.current
    if (currentDraft === null) return
    const textarea = textareaRef.current
    const remembered = selectionRef.current
    const selection: TextSelection = {
      value: currentDraft.content,
      start: remembered?.start ?? (textarea?.selectionStart ?? currentDraft.content.length),
      end: remembered?.end ?? (textarea?.selectionEnd ?? currentDraft.content.length),
    }
    let result: EditResult | null = null
    switch (action) {
      case 'bold': result = wrapSelection(selection, '**', '**', '粗体'); break
      case 'italic': result = wrapSelection(selection, '_', '_', '斜体'); break
      case 'strike': result = wrapSelection(selection, '~~', '~~', '删除线'); break
      case 'code': result = wrapSelection(selection, '`', '`', '代码'); break
      case 'h1': result = prefixLines(selection, '# '); break
      case 'h2': result = prefixLines(selection, '## '); break
      case 'h3': result = prefixLines(selection, '### '); break
      case 'quote': result = prefixLines(selection, '> '); break
      case 'ul': result = prefixLines(selection, '- '); break
      case 'ol': result = prefixLines(selection, '1. '); break
      case 'task': result = prefixLines(selection, '- [ ] '); break
      case 'codeblock': result = insertBlock(selection, '```\n\n```'); break
      case 'link': result = wrapSelection(selection, '[', '](https://)', '链接文字'); break
      case 'image': fileInputRef.current?.click(); return
      case 'table': result = insertBlock(selection, '| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |'); break
      case 'hr': result = insertBlock(selection, '---'); break
      default: return
    }
    if (result === null) return
    updateDraft({ content: result.value })
    const next = result
    selectionRef.current = { start: next.start, end: next.end }
    window.requestAnimationFrame(() => {
      const area = textareaRef.current
      if (area === null) return
      area.focus()
      area.setSelectionRange(next.start, next.end)
    })
  }, [updateDraft])

  const insertIntoNote = useCallback((text: string): void => {
    const currentDraft = draftRef.current
    if (currentDraft === null) return
    const area = textareaRef.current
    const remembered = selectionRef.current
    const start = remembered?.start ?? currentDraft.content.length
    const end = remembered?.end ?? currentDraft.content.length
    const result = insertAtCursor({ value: currentDraft.content, start, end }, text)
    updateDraft({ content: result.value })
    selectionRef.current = { start: result.start, end: result.end }
    window.requestAnimationFrame(() => {
      if (area === null) return
      area.focus()
      area.setSelectionRange(result.start, result.end)
    })
  }, [updateDraft])

  const handleUpload = useCallback(async (files: FileList | File[]): Promise<void> => {
    const id = selectedRef.current
    if (id === null) {
      showToast('请先选择或创建一条笔记', 'error')
      return
    }
    const list = Array.from(files)
    if (list.length === 0) return
    setAttachmentBusy(true)
    setUploadProgress(0)
    try {
      for (const file of list) {
        const uploaded = await backend.uploadAttachment(id, file, (percent) => setUploadProgress(percent))
        setNote((previous) => previous === null ? previous : { ...previous, attachments: [...previous.attachments, uploaded.attachment] })
        insertIntoNote(uploaded.markdown)
      }
      showToast(`已上传 ${list.length} 个附件`, 'success')
      void saveDraftInternal()
    } catch (caught) {
      showToast(errorMessage(caught), 'error')
    } finally {
      setAttachmentBusy(false)
      setUploadProgress(null)
    }
  }, [backend, insertIntoNote, saveDraftInternal, showToast])

  const handleDeleteAttachment = useCallback(async (attachmentId: string): Promise<void> => {
    try {
      await backend.deleteAttachment(attachmentId)
      setNote((previous) => previous === null ? previous : {
        ...previous,
        attachments: previous.attachments.filter((item) => item.id !== attachmentId),
      })
      showToast('附件已删除', 'success')
    } catch (caught) {
      showToast(errorMessage(caught), 'error')
    }
  }, [backend, showToast])

  const markdownHtml = useMemo(() => {
    if (draft === null) return ''
    const mimes = new Map<string, string>()
    for (const attachment of note?.attachments ?? []) mimes.set(attachment.id, attachment.mime)
    try {
      return renderMarkdown(draft.content, {
        resolveAttachment: (id) => backend.attachmentUrl(id),
        attachmentMimes: mimes,
      })
    } catch {
      return '<p>预览失败。</p>'
    }
  }, [backend, draft?.content, note?.attachments])

  const handlePreviewClick = useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest('a')
    if (anchor === null) return
    const noteLink = anchor.getAttribute('data-note-link')
    if (noteLink !== null) {
      event.preventDefault()
      void openNote(noteLink)
    }
  }, [openNote])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const primary = event.ctrlKey || event.metaKey
    if (primary && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void saveDraftInternal({ force: true })
      return
    }
    if (primary && event.key.toLowerCase() === 'b') {
      event.preventDefault()
      applyToolbar('bold')
      return
    }
    if (primary && event.key.toLowerCase() === 'i') {
      event.preventDefault()
      applyToolbar('italic')
      return
    }
    if (primary && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      applyToolbar('link')
      return
    }
    if (primary && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      setFindOpen(true)
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      const currentDraft = draftRef.current
      const area = textareaRef.current
      if (currentDraft === null || area === null) return
      const result = indentSelection({ value: currentDraft.content, start: area.selectionStart, end: area.selectionEnd }, event.shiftKey)
      updateDraft({ content: result.value })
      selectionRef.current = { start: result.start, end: result.end }
      window.requestAnimationFrame(() => area.setSelectionRange(result.start, result.end))
      return
    }
    if (event.key === 'Enter' && !event.shiftKey && !primary) {
      const currentDraft = draftRef.current
      const area = textareaRef.current
      if (currentDraft !== null && area !== null) {
        const result = continueLine({ value: currentDraft.content, start: area.selectionStart, end: area.selectionEnd })
        if (result !== null) {
          event.preventDefault()
          updateDraft({ content: result.value })
          selectionRef.current = { start: result.start, end: result.end }
          window.requestAnimationFrame(() => area.setSelectionRange(result.start, result.end))
        }
      }
    }
  }, [applyToolbar, saveDraftInternal, updateDraft])

  const conflictResolve = useCallback(async (strategy: 'server' | 'local' | 'copy'): Promise<void> => {
    if (conflict === null) return
    const id = conflict.noteId
    try {
      if (backend.resolveConflict !== undefined) {
        const state = await backend.resolveConflict(id, strategy)
        setHostState(state)
      } else if (strategy === 'server') {
        const fresh = await backend.getNote(id)
        setNote(fresh)
        const next = draftFromNote(fresh)
        draftRef.current = next
        setDraft(next)
      } else if (strategy === 'local') {
        const result = await backend.updateNote(id, {
          baseRevision: conflict.serverNote.revision,
          title: conflict.local.title,
          content: conflict.local.content,
          tags: conflict.local.tags,
        })
        setNote(result)
        const next = draftFromNote(result)
        draftRef.current = next
        setDraft(next)
      } else {
        await backend.createNote({
          title: `${conflict.local.title || '未命名笔记'}（冲突副本）`,
          content: conflict.local.content,
          tags: conflict.local.tags,
          folderId: conflict.serverNote.folderId,
        })
        const fresh = await backend.getNote(id)
        setNote(fresh)
        const next = draftFromNote(fresh)
        draftRef.current = next
        setDraft(next)
      }
      setConflict(null)
      setError(null)
      await reloadTreeQuiet()
      showToast(strategy === 'server' ? '已采用服务器版本' : strategy === 'local' ? '已用本地内容覆盖' : '已另存为副本', 'success')
      setDialog({ kind: 'none' })
    } catch (caught) {
      showToast(errorMessage(caught), 'error')
    }
  }, [backend, conflict, reloadTreeQuiet, showToast])

  const rememberSelection = useCallback((event: React.SyntheticEvent<HTMLTextAreaElement>): void => {
    const target = event.currentTarget
    selectionRef.current = { start: target.selectionStart, end: target.selectionEnd }
  }, [])

  const findAction = useCallback((replace: boolean): void => {
    const currentDraft = draftRef.current
    const area = textareaRef.current
    if (currentDraft === null || findText === '') return
    const selection = { value: currentDraft.content, start: area?.selectionStart ?? 0, end: area?.selectionEnd ?? 0 }
    const found = findNext(currentDraft.content, findText, selection.end)
    if (found === null) return
    if (replace) {
      const result = replaceRange(selection, found.start, found.end, replaceText)
      updateDraft({ content: result.value })
      selectionRef.current = { start: result.start, end: result.end }
      window.requestAnimationFrame(() => area?.setSelectionRange(result.start, result.end))
    } else {
      selectionRef.current = { start: found.start, end: found.end }
      area?.focus()
      area?.setSelectionRange(found.start, found.end)
    }
  }, [findText, replaceText, updateDraft])

  const replaceAllAction = useCallback((): void => {
    const currentDraft = draftRef.current
    if (currentDraft === null || findText === '') return
    updateDraft({ content: replaceAll(currentDraft.content, findText, replaceText) })
  }, [findText, replaceText, updateDraft])

  const syncNow = useCallback(async (): Promise<void> => {
    if (backend.syncNow === undefined) return
    try {
      const state = await backend.syncNow()
      setHostState(state)
      setSettings(state.settings)
      lastSyncRef.current = state.sync.lastSyncAt
      await reloadTreeQuiet()
      const id = selectedRef.current
      if (id !== null && draftRef.current !== null && !draftRef.current.dirty) {
        const fresh = await backend.getNote(id).catch(() => null)
        if (fresh !== null && fresh.revision !== draftRef.current.baseRevision) {
          const next = draftFromNote(fresh)
          setNote(fresh)
          setDraft(next)
          draftRef.current = next
        }
      }
      showToast(state.sync.state === 'conflict' ? '同步完成，但存在冲突' : '同步完成', state.sync.state === 'conflict' ? 'error' : 'success')
    } catch (caught) {
      showToast(errorMessage(caught), 'error')
    }
  }, [backend, reloadTreeQuiet, showToast])

  const capabilities = backend.capabilities
  const syncLabel = hostState === null
    ? '同步'
    : hostState.sync.state === 'unconfigured' ? '未配置'
      : hostState.sync.state === 'syncing' ? '同步中'
        : hostState.sync.state === 'pending' ? `待同步 ${hostState.sync.pending}`
          : hostState.sync.state === 'offline' ? '离线'
            : hostState.sync.state === 'conflict' ? `冲突 ${hostState.sync.conflicts}`
              : hostState.sync.state === 'error' ? '同步失败'
                : '已同步'
  const rootClass = `dsh-notes-root theme-${theme}${sidebarOpen ? ' mobile-tree-open' : ''}`
  const notConfigured = hostState !== null && !hostState.configured

  return (
    <div className={rootClass}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/avif,audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,audio/flac,audio/webm,audio/opus"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files !== null) void handleUpload(event.target.files)
          event.target.value = ''
        }}
      />
      <header className="dsh-notes-header">
        <button className="dsh-notes-icon-btn dsh-notes-mobile-only" title="目录" onClick={() => setSidebarOpen((value) => !value)}>
          <IconMenu size={18} />
        </button>
        <div className="dsh-notes-brand">
          <IconNote size={20} />
          <span>{brand}</span>
        </div>
        <div className="dsh-notes-header-spacer" />
        {capabilities.sync && (
          <span className={`dsh-notes-sync-pill state-${hostState?.sync.state ?? 'idle'}`} title={hostState?.sync.error ?? syncLabel}>
            <span className="dot" />
            <span className="label">{syncLabel}</span>
          </span>
        )}
        <div className="dsh-notes-header-actions">
          {capabilities.sync && backend.syncNow !== undefined && (
            <button className="dsh-notes-icon-btn" title="立即同步" onClick={() => { void syncNow() }}>
              <IconSync size={17} />
            </button>
          )}
          <button className="dsh-notes-icon-btn" title="切换主题" onClick={() => setTheme((value) => value === 'auto' ? 'light' : value === 'light' ? 'dark' : 'auto')}>
            {theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}
          </button>
          {capabilities.settings && backend.saveSettings !== undefined && (
            <button className="dsh-notes-icon-btn" title="设置" onClick={() => setDialog({ kind: 'settings' })}>
              <IconSettings size={17} />
            </button>
          )}
          {onLogout !== undefined && (
            <button className="dsh-notes-btn dsh-notes-btn-ghost" onClick={() => { void handleLogout() }}>退出</button>
          )}
        </div>
      </header>

      {error !== null && (
        <div className="dsh-notes-banner is-error">
          <div className="grow">{error}</div>
          <button className="dsh-notes-icon-btn" onClick={() => setError(null)}><IconClose size={14} /></button>
        </div>
      )}
      {externalChange !== null && (
        <div className="dsh-notes-banner is-warn">
          <div className="grow">服务器上的这条笔记有新版本。你当前有未保存的修改。</div>
          <div className="dsh-notes-banner-actions">
            <button className="dsh-notes-btn" onClick={() => {
              setNote(externalChange)
              const next = draftFromNote(externalChange)
              draftRef.current = next
              setDraft(next)
              setExternalChange(null)
            }}>采用新版本</button>
            <button className="dsh-notes-btn" onClick={() => setExternalChange(null)}>继续编辑</button>
          </div>
        </div>
      )}
      {conflict !== null && (
        <div className="dsh-notes-banner is-warn">
          <div className="grow">保存冲突：服务器上的版本与本地不同。请选择处理方式。</div>
          <div className="dsh-notes-banner-actions">
            <button className="dsh-notes-btn" onClick={() => setDialog({ kind: 'conflict', noteId: conflict.noteId })}>查看差异</button>
            <button className="dsh-notes-btn" onClick={() => { void conflictResolve('server') }}>采用服务器</button>
            <button className="dsh-notes-btn" onClick={() => { void conflictResolve('local') }}>保留本地</button>
            <button className="dsh-notes-btn" onClick={() => { void conflictResolve('copy') }}>另存副本</button>
          </div>
        </div>
      )}

      <div className="dsh-notes-body">
        <div className="dsh-notes-mobile-backdrop" onClick={() => setSidebarOpen(false)} />
        <aside className="dsh-notes-sidebar">
          <div className="dsh-notes-sidebar-head">
            <div className="dsh-notes-search">
              <IconSearch size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索笔记…"
                aria-label="搜索笔记"
              />
              {query !== '' && (
                <button className="dsh-notes-icon-btn" onClick={() => setQuery('')} title="清除搜索"><IconClose size={13} /></button>
              )}
            </div>
            <div className="dsh-notes-sidebar-actions">
              <button className="dsh-notes-btn" onClick={() => { void handleCreateNote(null) }}>
                <IconPlus size={14} /> 笔记
              </button>
              <button className="dsh-notes-btn" onClick={() => handleCreateFolder(null)}>
                <IconFolder size={14} /> 目录
              </button>
            </div>
          </div>
          <div className="dsh-notes-tree">
            {query.trim() !== '' ? (
              <SearchResults results={results} searching={searching} onOpen={(id) => { void openNote(id) }} />
            ) : (
              <TreeView
                tree={tree}
                selectedId={selectedId}
                onOpen={(id) => { void openNote(id) }}
                onCreateNote={(folderId) => { void handleCreateNote(folderId) }}
                onCreateFolder={handleCreateFolder}
                onRenameFolder={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
                onDeleteNote={handleDeleteNote}
                onMoveNote={handleMoveNote}
                emptyLabel={notConfigured ? '先配置服务器' : '还没有笔记'}
              />
            )}
          </div>
          <div className="dsh-notes-sidebar-foot">
            {capabilities.trash && (
              <button className="dsh-notes-icon-btn" title="回收站" onClick={() => setDialog({ kind: 'trash' })}>
                <IconTrash size={15} />
              </button>
            )}
            <span className="muted">
              {hostState !== null
                ? hostState.sync.lastSyncAt !== null ? `同步于 ${formatRelative(hostState.sync.lastSyncAt)}` : '尚未同步'
                : tree !== null ? `${tree.notes.length} 条笔记 · ${tree.folders.length} 个目录` : '加载中…'}
            </span>
            {hostState !== null && hostState.sync.conflicts > 0 && (
              <button className="dsh-notes-btn dsh-notes-btn-danger" onClick={() => setDialog({ kind: 'conflict-list' })}>
                冲突 {hostState.sync.conflicts}
              </button>
            )}
          </div>
        </aside>

        <main className="dsh-notes-main">
          {notConfigured ? (
            <div className="dsh-notes-empty">
              <div className="dsh-notes-empty-title">连接你的笔记服务器</div>
              <p>在服务器上运行 <code>dsh-notes-server token create</code> 生成访问令牌，然后在这里填写服务器地址与令牌。</p>
              <div className="dsh-notes-empty-actions">
                <button className="dsh-notes-btn dsh-notes-btn-primary" onClick={() => setDialog({ kind: 'settings' })}>打开设置</button>
              </div>
            </div>
          ) : loading && note === null ? (
            <div className="dsh-notes-empty"><div className="dsh-notes-empty-title">加载中…</div></div>
          ) : draft === null || note === null ? (
            <div className="dsh-notes-empty">
              <div className="dsh-notes-empty-title">{tree?.notes.length === 0 ? '开始写第一条笔记' : '选择一条笔记'}</div>
              <p>Markdown 编辑、附件上传与实时预览都在这里。</p>
              <div className="dsh-notes-empty-actions">
                <button className="dsh-notes-btn dsh-notes-btn-primary" onClick={() => { void handleCreateNote(null) }}>
                  <IconPlus size={14} /> 新建笔记
                </button>
                <button className="dsh-notes-btn" onClick={() => handleCreateFolder(null)}>
                  <IconFolder size={14} /> 新建目录
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="dsh-notes-editor-head">
                <div className="dsh-notes-title-row">
                  <input
                    className="dsh-notes-title-input"
                    value={draft.title}
                    placeholder="笔记标题"
                    onChange={(event) => updateDraft({ title: event.target.value })}
                    aria-label="笔记标题"
                  />
                  <button
                    className={`dsh-notes-icon-btn${draft.pinned ? ' is-active' : ''}`}
                    title={draft.pinned ? '取消置顶' : '置顶'}
                    onClick={() => {
                      updateDraft({ pinned: !draft.pinned })
                      window.setTimeout(() => { void saveDraftInternal() }, 60)
                    }}
                    style={draft.pinned ? { color: 'var(--notes-accent)' } : undefined}
                  >
                    <IconPin size={16} />
                  </button>
                  {capabilities.versions && (
                    <button className="dsh-notes-icon-btn" title="历史版本" onClick={() => setDialog({ kind: 'history' })}>
                      <IconHistory size={16} />
                    </button>
                  )}
                  <button
                    className="dsh-notes-icon-btn"
                    title="下载 Markdown"
                    onClick={() => {
                      const blob = new Blob([draft.content], { type: 'text/markdown;charset=utf-8' })
                      const url = URL.createObjectURL(blob)
                      const anchor = document.createElement('a')
                      anchor.href = url
                      anchor.download = `${(draft.title || 'note').replace(/[\\/:*?"<>|]/g, '_')}.md`
                      anchor.click()
                      URL.revokeObjectURL(url)
                    }}
                  >
                    <IconDownload size={16} />
                  </button>
                  <button className="dsh-notes-icon-btn" title="移动笔记" onClick={() => {
                    const meta = tree?.notes.find((item) => item.id === note.id)
                    if (meta !== undefined) handleMoveNote(meta)
                  }}>
                    <IconMore size={16} />
                  </button>
                  <button className="dsh-notes-icon-btn" title="删除笔记" onClick={() => {
                    const meta = tree?.notes.find((item) => item.id === note.id)
                    if (meta !== undefined) handleDeleteNote(meta)
                  }}>
                    <IconTrash size={16} />
                  </button>
                </div>
                <div className="dsh-notes-note-meta">
                  <span>更新于 {formatRelative(note.updatedAt)}</span>
                  <span>·</span>
                  <span>版本 {draft.baseRevision}</span>
                  {hostState !== null && hostState.sync.state !== 'idle' && <span>· {syncLabel}</span>}
                  <TagsEditor tags={draft.tags} onChange={(tags) => updateDraft({ tags })} />
                </div>
                <div className="dsh-notes-toolbar">
                  {TOOLBAR_ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      className="dsh-notes-toolbar-btn"
                      title={action.title}
                      onClick={() => applyToolbar(action.id)}
                      type="button"
                    >
                      {action.label}
                    </button>
                  ))}
                  <span className="dsh-notes-toolbar-sep" />
                  <button className="dsh-notes-toolbar-btn" title="查找替换 (Ctrl+F)" onClick={() => setFindOpen((value) => !value)}>查找</button>
                  <div className="dsh-notes-view-switch">
                    <button className={viewMode === 'edit' ? 'is-active' : ''} title="编辑" onClick={() => setViewMode('edit')}><IconEdit size={14} /></button>
                    <button className={viewMode === 'split' ? 'is-active' : ''} title="分栏" onClick={() => setViewMode('split')}><IconSplit size={14} /></button>
                    <button className={viewMode === 'preview' ? 'is-active' : ''} title="预览" onClick={() => setViewMode('preview')}><IconPreview size={14} /></button>
                  </div>
                </div>
                {findOpen && (
                  <div className="dsh-notes-findbar">
                    <input value={findText} onChange={(event) => setFindText(event.target.value)} placeholder="查找" />
                    <input value={replaceText} onChange={(event) => setReplaceText(event.target.value)} placeholder="替换为" />
                    <button className="dsh-notes-btn" onClick={() => findAction(false)}>下一个</button>
                    <button className="dsh-notes-btn" onClick={() => findAction(true)}>替换</button>
                    <button className="dsh-notes-btn" onClick={replaceAllAction}>全部替换</button>
                    <button className="dsh-notes-icon-btn" onClick={() => setFindOpen(false)}><IconClose size={13} /></button>
                  </div>
                )}
              </div>

              <div className={`dsh-notes-split view-${viewMode}`}>
                <textarea
                  ref={textareaRef}
                  className="dsh-notes-textarea"
                  value={draft.content}
                  onChange={(event) => updateDraft({ content: event.target.value })}
                  onKeyDown={handleKeyDown}
                  onKeyUp={rememberSelection}
                  onSelect={rememberSelection}
                  onMouseUp={rememberSelection}
                  onClick={rememberSelection}
                  onBlur={rememberSelection}
                  placeholder="用 Markdown 写点什么…"
                  spellCheck={false}
                />
                <div className="dsh-notes-preview" onClick={handlePreviewClick}>
                  {draft.content.trim() === ''
                    ? <div className="dsh-notes-preview-empty">预览会显示在这里</div>
                    : <div className="dsh-notes-markdown" dangerouslySetInnerHTML={{ __html: markdownHtml }} />}
                </div>
              </div>

              <div className="dsh-notes-attachments">
                <div className="dsh-notes-attachments-head">
                  <IconPaperclip size={14} />
                  <span>附件 {note.attachments.length > 0 ? `(${note.attachments.length})` : ''}</span>
                  <span className="grow" />
                  {uploadProgress !== null && <span>{uploadProgress}%</span>}
                  <button className="dsh-notes-btn" disabled={attachmentBusy} onClick={() => fileInputRef.current?.click()}>
                    <IconUpload size={14} /> 上传
                  </button>
                </div>
                {uploadProgress !== null && <div className="dsh-notes-upload-progress"><div style={{ width: `${uploadProgress}%` }} /></div>}
                {note.attachments.length === 0 ? (
                  <div className="dsh-notes-hint" style={{ padding: '9px 14px' }}>上传图片或音频；插入的 Markdown 链接会自动关联到附件。</div>
                ) : (
                  note.attachments.map((attachment) => (
                    <AttachmentRow
                      key={attachment.id}
                      attachment={attachment}
                      url={backend.attachmentUrl(attachment.id)}
                      onInsert={() => insertIntoNote(`${attachment.mime.startsWith('image/') ? '!' : ''}[${attachment.filename}](api/attachments/${attachment.id})`)}
                      onDelete={() => { void handleDeleteAttachment(attachment.id) }}
                    />
                  ))
                )}
              </div>

              <div className="dsh-notes-statusbar">
                <span>{wordCount(draft.content).characters} 字符</span>
                <span>{wordCount(draft.content).lines} 行</span>
                <span className="grow" />
                {saving ? <span>保存中…</span> : draft.dirty ? <span>未保存</span> : savedAt !== null ? <span className="is-saved"><IconCheck size={12} /> 已保存 {formatRelative(savedAt)}</span> : null}
                {error !== null && <span className="is-error">保存失败</span>}
              </div>
            </>
          )}
        </main>
      </div>

      {dialog.kind === 'prompt' && (
        <PromptDialog
          title={dialog.title}
          label={dialog.label}
          initial={dialog.initial}
          placeholder={dialog.placeholder}
          onCancel={() => setDialog({ kind: 'none' })}
          onSubmit={dialog.submit}
        />
      )}
      {dialog.kind === 'confirm' && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          danger={dialog.danger}
          onCancel={() => setDialog({ kind: 'none' })}
          onConfirm={async () => { await dialog.submit(); setDialog({ kind: 'none' }) }}
        />
      )}
      {dialog.kind === 'delete-note' && (
        <ConfirmDialog
          title="删除笔记"
          message={`确定把「${dialog.note.title || '未命名笔记'}」移入回收站吗？`}
          confirmLabel="移入回收站"
          danger
          onCancel={() => setDialog({ kind: 'none' })}
          onConfirm={async () => {
            try {
              await backend.deleteNote(dialog.note.id)
              setDialog({ kind: 'none' })
              setSelectedId(null)
              setNote(null)
              setDraft(null)
              await reloadTreeQuiet()
              showToast('已移入回收站', 'success')
            } catch (caught) { showToast(errorMessage(caught), 'error') }
          }}
        />
      )}
      {dialog.kind === 'delete-folder' && (
        <DeleteFolderDialog
          folder={dialog.folder}
          onCancel={() => setDialog({ kind: 'none' })}
          onDelete={async (recursive) => {
            try {
              await backend.deleteFolder(dialog.folder.id, recursive)
              setDialog({ kind: 'none' })
              if (selectedId !== null) {
                const snapshot = await reloadTreeQuiet()
                if (snapshot !== null && !snapshot.notes.some((item) => item.id === selectedId)) {
                  setSelectedId(null)
                  setNote(null)
                  setDraft(null)
                }
              }
              showToast(recursive ? '目录和笔记已删除' : '目录已删除，笔记已移到上一级', 'success')
            } catch (caught) { showToast(errorMessage(caught), 'error') }
          }}
        />
      )}
      {dialog.kind === 'move-note' && (
        <MoveNoteDialog
          note={dialog.note}
          tree={tree}
          onCancel={() => setDialog({ kind: 'none' })}
          onMove={async (folderId) => {
            try {
              const updated = await backend.moveNote(dialog.note.id, folderId, dialog.note.revision)
              setDialog({ kind: 'none' })
              await reloadTreeQuiet()
              if (selectedId === dialog.note.id) {
                setNote(updated)
                setDraft((previous) => previous === null ? previous : { ...previous, baseRevision: updated.revision, dirty: false })
              }
              showToast('笔记已移动', 'success')
            } catch (caught) { showToast(errorMessage(caught), 'error') }
          }}
        />
      )}
      {dialog.kind === 'settings' && (
        <SettingsDialog
          backend={backend}
          current={settings}
          onClose={() => setDialog({ kind: 'none' })}
          onSaved={(state) => {
            setHostState(state)
            setSettings(state.settings)
            lastSyncRef.current = state.sync.lastSyncAt
            setDialog({ kind: 'none' })
            void reloadTreeQuiet()
            showToast('设置已保存', 'success')
          }}
        />
      )}
      {dialog.kind === 'history' && note !== null && (
        <HistoryDialog
          backend={backend}
          noteId={note.id}
          onClose={() => setDialog({ kind: 'none' })}
          onRestored={async (restored) => {
            setNote(restored)
            const next = draftFromNote(restored)
            draftRef.current = next
            setDraft(next)
            setDialog({ kind: 'none' })
            await reloadTreeQuiet()
            showToast('已恢复历史版本', 'success')
          }}
        />
      )}
      {dialog.kind === 'trash' && (
        <TrashDialog
          backend={backend}
          onClose={() => setDialog({ kind: 'none' })}
          onChanged={() => { void reloadTreeQuiet(); showToast('回收站已更新', 'success') }}
        />
      )}
      {dialog.kind === 'conflict' && conflict !== null && (
        <ConflictDialog
          conflict={conflict}
          onClose={() => setDialog({ kind: 'none' })}
          onResolve={(strategy) => { void conflictResolve(strategy) }}
        />
      )}
      {dialog.kind === 'conflict-list' && (
        <ConflictListDialog
          backend={backend}
          conflicts={conflictList}
          onClose={() => setDialog({ kind: 'none' })}
          onOpen={(detail) => {
            const serverNote: NoteDetail = {
              id: detail.noteId,
              folderId: detail.serverFolderId,
              title: detail.serverTitle,
              tags: detail.serverTags,
              pinned: false,
              revision: detail.serverRevision,
              createdAt: detail.createdAt,
              updatedAt: detail.createdAt,
              deletedAt: null,
              content: detail.serverContent,
              attachments: [],
            }
            setConflict({
              noteId: detail.noteId,
              serverNote,
              local: {
                title: detail.localTitle,
                content: detail.localContent,
                tags: detail.localTags,
                pinned: false,
                baseRevision: detail.baseRevision ?? detail.serverRevision,
                dirty: true,
              },
            })
            setDialog({ kind: 'conflict', noteId: detail.noteId })
          }}
        />
      )}

      {toast !== null && (
        <div className="dsh-notes-toast-wrap">
          <div className={`dsh-notes-toast is-${toast.kind}`}>{toast.text}</div>
        </div>
      )}
    </div>
  )
}

// -- tree ------------------------------------------------------------------

interface TreeViewProps {
  tree: TreeSnapshot | null
  selectedId: string | null
  onOpen: (id: string) => void
  onCreateNote: (folderId: string | null) => void
  onCreateFolder: (parentId: string | null) => void
  onRenameFolder: (folder: FolderMeta) => void
  onDeleteFolder: (folder: FolderMeta) => void
  onDeleteNote: (note: NoteMeta) => void
  onMoveNote: (note: NoteMeta) => void
  emptyLabel: string
}

function TreeView(props: TreeViewProps): React.ReactElement {
  const { tree, selectedId, onOpen, onCreateNote, onCreateFolder, onRenameFolder, onDeleteFolder, onDeleteNote, onMoveNote, emptyLabel } = props
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem(EXPANDED_KEY)
      if (raw !== null) return new Set(JSON.parse(raw) as string[])
    } catch {
      /* Ignore. */
    }
    return new Set()
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(expanded)))
    } catch {
      /* Ignore. */
    }
  }, [expanded])
  const folderChildren = useMemo(() => {
    const map = new Map<string | null, FolderMeta[]>()
    for (const folder of tree?.folders ?? []) {
      const list = map.get(folder.parentId) ?? []
      list.push(folder)
      map.set(folder.parentId, list)
    }
    return map
  }, [tree?.folders])
  const notesByFolder = useMemo(() => {
    const map = new Map<string | null, NoteMeta[]>()
    for (const note of tree?.notes ?? []) {
      const list = map.get(note.folderId) ?? []
      list.push(note)
      map.set(note.folderId, list)
    }
    for (const list of map.values()) list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
    return map
  }, [tree?.notes])
  if (tree === null) return <div className="dsh-notes-tree-empty">加载中…</div>
  if (tree.folders.length === 0 && tree.notes.length === 0) {
    return <div className="dsh-notes-tree-empty">{emptyLabel}</div>
  }
  const toggle = (id: string): void => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const renderFolder = (folder: FolderMeta, depth: number): React.ReactNode => {
    const children = folderChildren.get(folder.id) ?? []
    const notes = notesByFolder.get(folder.id) ?? []
    const isOpen = expanded.has(folder.id)
    return (
      <React.Fragment key={folder.id}>
        <div
          className="dsh-notes-tree-row is-folder"
          style={{ paddingLeft: 6 + depth * 12 }}
          role="button"
          tabIndex={0}
          onClick={() => toggle(folder.id)}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') toggle(folder.id) }}
          title={folder.name}
        >
          <span className={`twisty${isOpen ? ' is-open' : ''}`}><IconChevron size={12} /></span>
          <span className="row-icon">{isOpen ? <IconFolderOpen size={14} /> : <IconFolder size={14} />}</span>
          <span className="row-label">{folder.name}</span>
          <span className="row-count">{notes.length}</span>
          <span className="row-actions" onClick={(event) => event.stopPropagation()}>
            <button className="dsh-notes-icon-btn" title="新建笔记" onClick={() => onCreateNote(folder.id)}><IconPlus size={13} /></button>
            <button className="dsh-notes-icon-btn" title="新建子目录" onClick={() => onCreateFolder(folder.id)}><IconFolder size={13} /></button>
            <button className="dsh-notes-icon-btn" title="重命名" onClick={() => onRenameFolder(folder)}><IconEdit size={13} /></button>
            <button className="dsh-notes-icon-btn" title="删除目录" onClick={() => onDeleteFolder(folder)}><IconTrash size={13} /></button>
          </span>
        </div>
        {isOpen && (
          <>
            {children.map((child) => renderFolder(child, depth + 1))}
            {notes.map((note) => renderNote(note, depth + 1))}
            {children.length === 0 && notes.length === 0 && (
              <div className="dsh-notes-tree-empty" style={{ padding: '6px 0 6px 28px', textAlign: 'left' }}>空目录</div>
            )}
          </>
        )}
      </React.Fragment>
    )
  }
  const renderNote = (note: NoteMeta, depth: number): React.ReactNode => (
    <div
      key={note.id}
      className={`dsh-notes-tree-row${selectedId === note.id ? ' is-active' : ''}`}
      style={{ paddingLeft: 6 + depth * 12 + 20 }}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(note.id)}
      onKeyDown={(event) => { if (event.key === 'Enter') onOpen(note.id) }}
      title={note.title || '未命名笔记'}
    >
      <span className="row-icon">{note.pinned ? <IconPin size={13} /> : <IconNote size={14} />}</span>
      <span className="row-label">{note.title || '未命名笔记'}</span>
      <span className="row-actions" onClick={(event) => event.stopPropagation()}>
        <button className="dsh-notes-icon-btn" title="移动" onClick={() => onMoveNote(note)}><IconMore size={13} /></button>
        <button className="dsh-notes-icon-btn" title="删除" onClick={() => onDeleteNote(note)}><IconTrash size={13} /></button>
      </span>
    </div>
  )
  return (
    <>
      {(folderChildren.get(null) ?? []).map((folder) => renderFolder(folder, 0))}
      {(notesByFolder.get(null) ?? []).map((note) => renderNote(note, 0))}
    </>
  )
}

function SearchResults({ results, searching, onOpen }: { results: SearchResult[] | null; searching: boolean; onOpen: (id: string) => void }): React.ReactElement {
  if (searching) return <div className="dsh-notes-tree-empty">搜索中…</div>
  if (results === null || results.length === 0) return <div className="dsh-notes-tree-empty">没有匹配的笔记</div>
  return (
    <div className="dsh-notes-list">
      {results.map((result) => (
        <button key={result.note.id} className="dsh-notes-list-row" style={{ textAlign: 'left', background: 'transparent', border: '1px solid transparent' }} onClick={() => onOpen(result.note.id)}>
          <span className="row-icon"><IconNote size={14} /></span>
          <span className="grow">
            <div className="title">{result.note.title || '未命名笔记'}</div>
            {result.snippet !== '' && <div className="sub">{result.snippet}</div>}
          </span>
        </button>
      ))}
    </div>
  )
}

// -- tags / attachments -----------------------------------------------------

function TagsEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }): React.ReactElement {
  const [value, setValue] = useState('')
  const commit = (): void => {
    const tag = value.trim().replace(/^#/, '')
    if (tag === '') return
    if (!tags.includes(tag)) onChange([...tags, tag])
    setValue('')
  }
  return (
    <span className="dsh-notes-tags">
      {tags.map((tag) => (
        <span key={tag} className="dsh-notes-tag">#{tag}<button title="移除标签" onClick={() => onChange(tags.filter((item) => item !== tag))}>×</button></span>
      ))}
      <input
        className="dsh-notes-tag-input"
        value={value}
        placeholder="+ 标签"
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault()
            commit()
          }
        }}
      />
    </span>
  )
}

function AttachmentRow({ attachment, url, onInsert, onDelete }: {
  attachment: { id: string; filename: string; mime: string; size: number }
  url: string
  onInsert: () => void
  onDelete: () => void
}): React.ReactElement {
  return (
    <div className="dsh-notes-attachment">
      {attachment.mime.startsWith('image/') ? (
        <img className="dsh-notes-attachment-thumb" src={url} alt={attachment.filename} loading="lazy" />
      ) : (
        <span className="dsh-notes-attachment-icon"><IconPaperclip size={16} /></span>
      )}
      <div className="dsh-notes-attachment-main">
        <div className="dsh-notes-attachment-name">{attachment.filename}</div>
        <div className="dsh-notes-attachment-sub">{formatBytes(attachment.size)} · {attachment.mime}</div>
        {attachment.mime.startsWith('audio/') && <audio controls preload="none" src={url} />}
      </div>
      <button className="dsh-notes-btn" onClick={onInsert}>插入</button>
      <button className="dsh-notes-btn dsh-notes-btn-danger" onClick={onDelete}>删除</button>
    </div>
  )
}

// -- dialogs ----------------------------------------------------------------

function Modal({ title, children, footer, onClose, wide = false }: {
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  onClose: () => void
  wide?: boolean
}): React.ReactElement {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
  return (
    <div className="dsh-notes-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className={`dsh-notes-modal${wide ? ' is-wide' : ''}`} role="dialog" aria-modal="true">
        <div className="dsh-notes-modal-head">
          <span className="grow">{title}</span>
          <button className="dsh-notes-icon-btn" onClick={onClose} title="关闭"><IconClose size={15} /></button>
        </div>
        <div className="dsh-notes-modal-body">{children}</div>
        {footer !== undefined && <div className="dsh-notes-modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

function PromptDialog({ title, label, initial, placeholder, onSubmit, onCancel }: {
  title: string
  label: string
  initial: string
  placeholder?: string
  onSubmit: (value: string) => Promise<void> | void
  onCancel: () => void
}): React.ReactElement {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const submit = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try { await onSubmit(value) } finally { setBusy(false) }
  }
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={<>
        <button className="dsh-notes-btn" onClick={onCancel}>取消</button>
        <button className="dsh-notes-btn dsh-notes-btn-primary" disabled={busy || value.trim() === ''} onClick={() => { void submit() }}>确定</button>
      </>}
    >
      <div className="dsh-notes-field">
        <label>{label}</label>
        <input
          className="dsh-notes-input"
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') void submit() }}
        />
      </div>
    </Modal>
  )
}

function ConfirmDialog({ title, message, confirmLabel = '确定', danger = false, onConfirm, onCancel }: {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}): React.ReactElement {
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={<>
        <button className="dsh-notes-btn" onClick={onCancel}>取消</button>
        <button className={`dsh-notes-btn ${danger ? 'dsh-notes-btn-danger' : 'dsh-notes-btn-primary'}`} disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}>{confirmLabel}</button>
      </>}
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  )
}

function DeleteFolderDialog({ folder, onDelete, onCancel }: {
  folder: FolderMeta
  onDelete: (recursive: boolean) => Promise<void>
  onCancel: () => void
}): React.ReactElement {
  return (
    <Modal
      title="删除目录"
      onClose={onCancel}
      footer={<button className="dsh-notes-btn" onClick={onCancel}>取消</button>}
    >
      <p>要删除目录「{folder.name}」吗？</p>
      <div className="dsh-notes-list">
        <button className="dsh-notes-btn" onClick={() => { void onDelete(false) }}>仅删除目录，笔记移到上一级</button>
        <button className="dsh-notes-btn dsh-notes-btn-danger" onClick={() => { void onDelete(true) }}>删除目录及其中的笔记（移入回收站）</button>
      </div>
    </Modal>
  )
}

function MoveNoteDialog({ note, tree, onMove, onCancel }: {
  note: NoteMeta
  tree: TreeSnapshot | null
  onMove: (folderId: string | null) => Promise<void>
  onCancel: () => void
}): React.ReactElement {
  const [selected, setSelected] = useState<string | null>(note.folderId)
  const folders = [...(tree?.folders ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <Modal
      title="移动笔记"
      onClose={onCancel}
      footer={<>
        <button className="dsh-notes-btn" onClick={onCancel}>取消</button>
        <button className="dsh-notes-btn dsh-notes-btn-primary" onClick={() => { void onMove(selected) }}>移动</button>
      </>}
    >
      <div className="dsh-notes-list">
        <button className={`dsh-notes-list-row${selected === null ? ' is-selected' : ''}`} style={{ background: 'transparent', border: selected === null ? undefined : '1px solid transparent', textAlign: 'left' }} onClick={() => setSelected(null)}>
          <IconFolder size={14} /><span className="grow">根目录</span>
        </button>
        {folders.map((folder) => (
          <button key={folder.id} className={`dsh-notes-list-row${selected === folder.id ? ' is-selected' : ''}`} style={{ background: 'transparent', border: selected === folder.id ? undefined : '1px solid transparent', textAlign: 'left' }} onClick={() => setSelected(folder.id)}>
            <IconFolder size={14} /><span className="grow">{folder.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

function SettingsDialog({ backend, current, onClose, onSaved }: {
  backend: AppBackend
  current: HostSettingsPublic | null
  onClose: () => void
  onSaved: (state: HostState) => void
}): React.ReactElement {
  const [serverUrl, setServerUrl] = useState(current?.serverUrl ?? '')
  const [token, setToken] = useState('')
  const [autoSyncSeconds, setAutoSyncSeconds] = useState(String(current?.autoSyncSeconds ?? 60))
  const [quickSync, setQuickSync] = useState(current?.quickSync ?? true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (current === null || backend.getSettings === undefined) return
    void backend.getSettings().then((value) => {
      setServerUrl(value.serverUrl)
      setAutoSyncSeconds(String(value.autoSyncSeconds))
      setQuickSync(value.quickSync)
    }).catch(() => undefined)
  }, [backend, current])
  const test = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await backend.testConnection?.({ serverUrl, token: token === '' ? undefined : token })
      if (result === undefined) {
        setMessage('当前后端不支持连接测试')
      } else if (result.ok) {
        setMessage(result.message)
      } else {
        setError(result.message)
      }
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  const save = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const state = await backend.saveSettings?.({
        serverUrl: serverUrl.trim(),
        ...(token === '' ? {} : { token }),
        autoSyncSeconds: Number(autoSyncSeconds),
        quickSync,
      })
      if (state !== undefined) onSaved(state)
      else onClose()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="笔记同步设置"
      onClose={onClose}
      footer={<>
        <button className="dsh-notes-btn" disabled={busy} onClick={() => { void test() }}>测试连接</button>
        <span style={{ flex: 1 }} />
        <button className="dsh-notes-btn" onClick={onClose}>取消</button>
        <button className="dsh-notes-btn dsh-notes-btn-primary" disabled={busy || serverUrl.trim() === ''} onClick={() => { void save() }}>保存</button>
      </>}
    >
      <div className="dsh-notes-field">
        <label>服务器地址</label>
        <input className="dsh-notes-input" value={serverUrl} placeholder="https://notes.example.com" onChange={(event) => setServerUrl(event.target.value)} />
        <span className="dsh-notes-hint">例如 https://notes.example.com 或 http://192.168.1.10:8787</span>
      </div>
      <div className="dsh-notes-field">
        <label>访问令牌 {current?.hasToken === true ? `（已保存，${current.tokenSource}）` : ''}</label>
        <input className="dsh-notes-input" type="password" value={token} placeholder={current?.hasToken === true ? '留空表示不修改' : 'dshn_...'} onChange={(event) => setToken(event.target.value)} autoComplete="off" />
        <span className="dsh-notes-hint">
          令牌只能在服务器上生成：<code>dsh-notes-server token create --user &lt;用户名&gt; --name dsh-plugin</code>。
          插件不会保存账号密码。
        </span>
      </div>
      <div className="dsh-notes-field">
        <label>自动同步间隔（秒）</label>
        <input className="dsh-notes-input" type="number" min={10} max={3600} value={autoSyncSeconds} onChange={(event) => setAutoSyncSeconds(event.target.value)} />
      </div>
      <label className="dsh-notes-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={quickSync} onChange={(event) => setQuickSync(event.target.checked)} />
        <span>编辑后快速同步（否则只按间隔/手动同步）</span>
      </label>
      {message !== null && <div className="dsh-notes-success">{message}</div>}
      {error !== null && <div className="dsh-notes-error">{error}</div>}
    </Modal>
  )
}

function HistoryDialog({ backend, noteId, onClose, onRestored }: {
  backend: AppBackend
  noteId: string
  onClose: () => void
  onRestored: (note: NoteDetail) => Promise<void>
}): React.ReactElement {
  const [versions, setVersions] = useState<VersionSummary[] | null>(null)
  const [selected, setSelected] = useState<{ revision: number; content: string; title: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (backend.getVersions === undefined) return
    void backend.getVersions(noteId).then(setVersions).catch((caught) => setError(errorMessage(caught)))
  }, [backend, noteId])
  return (
    <Modal
      title="历史版本"
      wide
      onClose={onClose}
      footer={<button className="dsh-notes-btn" onClick={onClose}>关闭</button>}
    >
      {versions === null ? <div className="dsh-notes-hint">加载中…</div> : versions.length === 0 ? <div className="dsh-notes-hint">还没有历史版本。</div> : (
        <div className="dsh-notes-list">
          {versions.map((version) => (
            <div key={version.revision} className="dsh-notes-list-row">
              <span className="grow">
                <div className="title">版本 {version.revision} · {version.title || '未命名笔记'}</div>
                <div className="sub">{formatDateTime(version.createdAt)}</div>
              </span>
              <button className="dsh-notes-btn" onClick={() => {
                if (backend.getVersion === undefined) return
                void backend.getVersion(noteId, version.revision).then((detail) => setSelected({ revision: detail.revision, content: detail.content, title: detail.title })).catch((caught) => setError(errorMessage(caught)))
              }}>查看</button>
              <button className="dsh-notes-btn dsh-notes-btn-primary" onClick={() => {
                if (backend.revertNote === undefined) return
                void backend.revertNote(noteId, version.revision).then(onRestored).catch((caught) => setError(errorMessage(caught)))
              }}>恢复</button>
            </div>
          ))}
        </div>
      )}
      {selected !== null && (
        <div style={{ marginTop: 12 }}>
          <div className="dsh-notes-hint">版本 {selected.revision} 预览</div>
          <pre className="dsh-notes-textarea-small" style={{ maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{selected.content}</pre>
        </div>
      )}
      {error !== null && <div className="dsh-notes-error">{error}</div>}
    </Modal>
  )
}

function TrashDialog({ backend, onClose, onChanged }: {
  backend: AppBackend
  onClose: () => void
  onChanged: () => void
}): React.ReactElement {
  const [notes, setNotes] = useState<NoteMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (backend.getTrash === undefined) return
    void backend.getTrash().then(setNotes).catch((caught) => setError(errorMessage(caught)))
  }, [backend])
  const refresh = (): void => {
    if (backend.getTrash === undefined) return
    void backend.getTrash().then(setNotes).catch((caught) => setError(errorMessage(caught)))
  }
  return (
    <Modal title="回收站" onClose={onClose} footer={<button className="dsh-notes-btn" onClick={onClose}>关闭</button>}>
      {notes === null ? <div className="dsh-notes-hint">加载中…</div> : notes.length === 0 ? <div className="dsh-notes-hint">回收站是空的。</div> : (
        <div className="dsh-notes-list">
          {notes.map((note) => (
            <div key={note.id} className="dsh-notes-list-row">
              <span className="grow">
                <div className="title">{note.title || '未命名笔记'}</div>
                <div className="sub">删除于 {formatDateTime(note.deletedAt)}</div>
              </span>
              <button className="dsh-notes-btn" onClick={() => {
                void backend.restoreNote(note.id).then(() => { refresh(); onChanged() }).catch((caught) => setError(errorMessage(caught)))
              }}>恢复</button>
              <button className="dsh-notes-btn dsh-notes-btn-danger" onClick={() => {
                void backend.deleteNote(note.id, true).then(() => { refresh(); onChanged() }).catch((caught) => setError(errorMessage(caught)))
              }}>永久删除</button>
            </div>
          ))}
        </div>
      )}
      {error !== null && <div className="dsh-notes-error">{error}</div>}
    </Modal>
  )
}

function ConflictDialog({ conflict, onClose, onResolve }: {
  conflict: ConflictBox
  onClose: () => void
  onResolve: (strategy: 'server' | 'local' | 'copy') => void
}): React.ReactElement {
  const localLines = conflict.local.content.split('\n')
  const serverLines = conflict.serverNote.content.split('\n')
  return (
    <Modal
      title="解决冲突"
      wide
      onClose={onClose}
      footer={<>
        <button className="dsh-notes-btn" onClick={() => onResolve('server')}>采用服务器版本</button>
        <button className="dsh-notes-btn" onClick={() => onResolve('copy')}>另存副本</button>
        <button className="dsh-notes-btn dsh-notes-btn-primary" onClick={() => onResolve('local')}>保留本地内容</button>
      </>}
    >
      <p style={{ marginTop: 0 }}>本地版本基于版本 {conflict.local.baseRevision}，服务器当前是版本 {conflict.serverNote.revision}。</p>
      <div className="dsh-notes-diff">
        <div className="dsh-notes-diff-col">
          <h4>本地：{conflict.local.title || '未命名笔记'}</h4>
          {localLines.map((line, index) => <div key={index} className="dsh-notes-diff-line is-remove">{line || ' '}</div>)}
        </div>
        <div className="dsh-notes-diff-col">
          <h4>服务器：{conflict.serverNote.title || '未命名笔记'}</h4>
          {serverLines.map((line, index) => <div key={index} className="dsh-notes-diff-line is-add">{line || ' '}</div>)}
        </div>
      </div>
    </Modal>
  )
}

function ConflictListDialog({ backend, conflicts, onClose, onOpen }: {
  backend: AppBackend
  conflicts: ConflictSummary[]
  onClose: () => void
  onOpen: (detail: ConflictDetail) => void
}): React.ReactElement {
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal title="同步冲突" onClose={onClose} footer={<button className="dsh-notes-btn" onClick={onClose}>关闭</button>}>
      {conflicts.length === 0 ? <div className="dsh-notes-hint">没有冲突。</div> : (
        <div className="dsh-notes-list">
          {conflicts.map((item) => (
            <div key={item.noteId} className="dsh-notes-list-row">
              <span className="grow">
                <div className="title">{item.localTitle || '未命名笔记'}</div>
                <div className="sub">本地基于版本 {item.baseRevision ?? '?'} · 服务器版本 {item.serverRevision}</div>
              </span>
              <button className="dsh-notes-btn" onClick={() => {
                void backend.getConflict?.(item.noteId).then(onOpen).catch((caught) => setError(errorMessage(caught)))
              }}>处理</button>
            </div>
          ))}
        </div>
      )}
      {error !== null && <div className="dsh-notes-error">{error}</div>}
    </Modal>
  )
}

export { attachmentIdFromHref }
