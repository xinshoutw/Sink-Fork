import { toast } from 'vue-sonner'
import { MAX_FOLDER_DEPTH } from '#shared/schemas/folder'

export type FolderDragPayload
  // folderId is carried so dropping a link back where it already is can be
  // recognised as a no-op instead of issuing a real move.
  = | { kind: 'link', slug: string, folderId: string | null }
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

    if (payload.kind === 'link') {
      // Dropping a link back into its own folder would still fire a move, wiping
      // the caches and resetting an infinitely scrolled list to page one.
      return payload.folderId !== targetFolderId
    }

    if (targetFolderId === payload.id || (targetFolderId && folders.isDescendant(targetFolderId, payload.id)))
      return false

    // Reject a subtree that cannot fit rather than painting a valid drop ring
    // and failing with a generic error after the drop.
    const depth = targetFolderId ? folders.breadcrumb(targetFolderId).length : 0
    return depth + folders.subtreeHeight(payload.id) <= MAX_FOLDER_DEPTH
  }

  function readDrop(event: DragEvent): FolderDragPayload | null {
    const slug = event.dataTransfer?.getData(LINK_MIME)
    if (slug) {
      // dataTransfer carries the slug only; the source folder comes from the
      // mirrored payload, which is still set when the drop fires.
      const source = activeDrag.value
      return { kind: 'link', slug, folderId: source?.kind === 'link' ? source.folderId : null }
    }
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
      if (payload.folderId === targetFolderId)
        return null
      await folders.moveLinks([payload.slug], targetFolderId, payload.folderId)
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
      if (payload) {
        // A fixed id replaces the previous toast instead of stacking one per
        // drag, which is the normal way to move several links.
        toast(t(payload.kind === 'link' ? 'links.folders.move_link_success' : 'links.folders.move_folder_success'), {
          id: 'sink-folder-move',
        })
      }
    }
    catch (cause) {
      console.error(cause)
      // Surfaces the depth and duplicate-name cases the API distinguishes.
      toast.error(getFolderErrorMessage(cause, t))
    }
  }

  return { activeDrag, startDrag, endDrag, canDropOn, readDrop, applyDrop, applyDropWithFeedback }
}
