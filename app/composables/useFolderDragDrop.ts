import { toast } from 'vue-sonner'

export type FolderDragPayload
  = | { kind: 'link', slug: string }
    | { kind: 'folder', id: string }

const LINK_MIME = 'application/x-sink-link'
const FOLDER_MIME = 'application/x-sink-folder'

/**
 * `dataTransfer.getData()` is deliberately unreadable during `dragover`, so the
 * payload is mirrored here for drop targets that need to validate before the drop.
 *
 * Module scope is safe because the dashboard renders client-only (`ssr: false`).
 *
 * ponytail: native HTML5 drag events, which do not fire on touch devices. The
 * move dialog is the universal path; add a pointer-event library only if touch
 * dragging is actually requested.
 */
const activeDrag = shallowRef<FolderDragPayload | null>(null)

export function useFolderDragDrop() {
  const folders = useDashboardFoldersStore()
  const { t } = useI18n()

  function startDrag(event: DragEvent, payload: FolderDragPayload) {
    const { dataTransfer } = event
    if (!dataTransfer)
      return

    dataTransfer.effectAllowed = 'move'
    if (payload.kind === 'link')
      dataTransfer.setData(LINK_MIME, payload.slug)
    else
      dataTransfer.setData(FOLDER_MIME, payload.id)
    // Plain text fallback keeps the drag image sensible and satisfies Firefox,
    // which ignores drags that carry no well-known type.
    dataTransfer.setData('text/plain', payload.kind === 'link' ? payload.slug : payload.id)
    activeDrag.value = payload
  }

  function endDrag() {
    activeDrag.value = null
  }

  /** `null` targets the uncategorized root. */
  function canDropOn(targetFolderId: string | null): boolean {
    const payload = activeDrag.value
    if (!payload)
      return false
    if (payload.kind === 'link')
      return true
    if (targetFolderId === payload.id)
      return false
    return !(targetFolderId && folders.isDescendant(targetFolderId, payload.id))
  }

  function readDrop(event: DragEvent): FolderDragPayload | null {
    const slug = event.dataTransfer?.getData(LINK_MIME)
    if (slug)
      return { kind: 'link', slug }
    const id = event.dataTransfer?.getData(FOLDER_MIME)
    return id ? { kind: 'folder', id } : null
  }

  /** Applies a dropped payload to `targetFolderId`, returning true when something moved. */
  async function applyDrop(event: DragEvent, targetFolderId: string | null): Promise<FolderDragPayload | null> {
    const payload = readDrop(event)
    endDrag()
    if (!payload)
      return null

    if (payload.kind === 'link') {
      await folders.moveLinks([payload.slug], targetFolderId)
      return payload
    }

    if (targetFolderId === payload.id || (targetFolderId && folders.isDescendant(targetFolderId, payload.id)))
      return null

    await folders.updateFolder({ id: payload.id, parentId: targetFolderId })
    return payload
  }

  /**
   * Applies a drop and reports the outcome, so every drop target behaves the
   * same. A rejected drop (onto itself or its own subfolder) stays silent.
   */
  async function applyDropWithFeedback(event: DragEvent, targetFolderId: string | null): Promise<void> {
    try {
      const payload = await applyDrop(event, targetFolderId)
      if (payload)
        toast(t(payload.kind === 'link' ? 'links.folders.move_link_success' : 'links.folders.move_folder_success'))
    }
    catch (cause) {
      console.error(cause)
      toast.error(t('links.folders.action_failed'))
    }
  }

  return { activeDrag, startDrag, endDrag, canDropOn, readDrop, applyDrop, applyDropWithFeedback }
}
