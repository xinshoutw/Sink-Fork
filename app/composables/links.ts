import type { Link, LinkUpdateType } from '@/types'
import type { DashboardLinkStatus } from '@/types/dashboard-links'
import type { DashboardLinkSort, LinksQueryState } from '@/utils/dashboard-query'
import { createEventHook, tryOnScopeDispose } from '@vueuse/core'
import { ref } from 'vue'
import { defineStore } from '#imports'

export interface LinkUpdateEvent {
  link: Link
  type: LinkUpdateType
}

export const useDashboardLinksStore = defineStore('dashboard-links', () => {
  const sortBy = ref<DashboardLinkSort>('newest')
  const status = ref<DashboardLinkStatus>('active')
  const tag = ref<string>()
  /** Folder id, `UNCATEGORIZED_FOLDER` for uncategorized links, undefined for all links. */
  const folder = ref<string>()

  const showLinkEditor = ref(false)
  const editingLink = ref<Record<string, unknown> | null>(null)

  const linkUpdateHook = createEventHook<LinkUpdateEvent>()
  // Bulk changes such as folder moves affect links the client may not have
  // loaded, so they ask for a reload instead of patching individual rows.
  const linksRefreshHook = createEventHook<void>()

  function openLinkEditor(link?: Record<string, unknown>) {
    editingLink.value = link || null
    showLinkEditor.value = true
  }

  function closeLinkEditor() {
    showLinkEditor.value = false
    editingLink.value = null
  }

  function notifyLinkUpdate(link: Link, type: LinkUpdateType) {
    linkUpdateHook.trigger({ link, type })
  }

  function onLinkUpdate(callback: (event: LinkUpdateEvent) => void) {
    const { off } = linkUpdateHook.on(callback)
    tryOnScopeDispose(off)
    return off
  }

  function requestLinksRefresh() {
    linksRefreshHook.trigger()
  }

  function onLinksRefresh(callback: () => void) {
    const { off } = linksRefreshHook.on(callback)
    tryOnScopeDispose(off)
    return off
  }

  function applyRouteState(state: LinksQueryState) {
    sortBy.value = state.sort
    status.value = state.status
    tag.value = state.tag
    folder.value = state.folder
  }

  return {
    sortBy,
    status,
    tag,
    folder,
    showLinkEditor,
    editingLink,
    openLinkEditor,
    closeLinkEditor,
    notifyLinkUpdate,
    onLinkUpdate,
    requestLinksRefresh,
    onLinksRefresh,
    applyRouteState,
  }
})
