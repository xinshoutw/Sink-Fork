import type { CreateFolderInput, EditFolderInput, Folder, FolderWithCount } from '#shared/schemas/folder'
import { useDebounceFn, useSessionStorage } from '@vueuse/core'
import { serializeLinksQuery } from '@/utils/dashboard-query'

export interface FolderNode extends FolderWithCount {
  children: FolderNode[]
  depth: number
}

interface FolderListResponse {
  folders: FolderWithCount[]
  uncategorizedCount: number
}

/**
 * Builds the tree in one pass over a flat list. Folders whose parent is missing
 * are surfaced at the root so a broken reference can never hide links.
 */
function buildTree(flat: FolderWithCount[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>(
    flat.map(folder => [folder.id, { ...folder, children: [], depth: 0 }]),
  )

  const roots: FolderNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent)
      parent.children.push(node)
    else
      roots.push(node)
  }

  const assign = (node: FolderNode, depth: number): void => {
    node.depth = depth
    node.children.forEach(child => assign(child, depth + 1))
  }
  roots.forEach(root => assign(root, 0))
  return roots
}

/** Flattens the tree back into render order, parents before their children. */
function flattenTree(nodes: FolderNode[]): FolderNode[] {
  return nodes.flatMap(node => [node, ...flattenTree(node.children)])
}

const FOLDERS_CACHE_KEY = 'folders'
export const EXPANDED_STORAGE_KEY = 'sink:dashboard:expanded-folders'

export const useDashboardFoldersStore = defineStore('dashboard-folders', () => {
  // Seed from the last response so the tree paints with the sidebar instead of
  // appearing once the request lands.
  const cached = readDashboardCache<FolderListResponse>(FOLDERS_CACHE_KEY)
  const flat = shallowRef<FolderWithCount[]>(cached?.folders ?? [])
  const uncategorizedCount = shallowRef(cached?.uncategorizedCount ?? 0)
  const loading = shallowRef(false)
  const error = shallowRef(false)
  let requestGeneration = 0

  // Expansion is view state, not data, so it stays local instead of in the URL.
  // sessionStorage matches the read cache: per tab, and gone with the session.
  const expandedIds = useSessionStorage<string[]>(EXPANDED_STORAGE_KEY, [])

  const tree = computed(() => buildTree(flat.value))
  const ordered = computed(() => flattenTree(tree.value))
  const byId = computed(() => new Map(ordered.value.map(node => [node.id, node])))

  /**
   * Rows to render, in tree order. The sidebar draws the tree as equal-width
   * rows indented by depth rather than nested lists, so every row shares one
   * right edge and the counts and action buttons line up down the column.
   */
  const visibleNodes = computed(() => {
    const hidden = new Set<string>()
    return ordered.value.filter((node) => {
      const parentHidden = Boolean(node.parentId && hidden.has(node.parentId))
      if (parentHidden || (node.parentId && !isExpanded(node.parentId)))
        hidden.add(node.id)
      return !parentHidden && (!node.parentId || isExpanded(node.parentId))
    })
  })

  const totalCount = computed(() =>
    flat.value.reduce((sum, folder) => sum + folder.linkCount, 0) + uncategorizedCount.value,
  )

  async function fetchFolders() {
    const generation = ++requestGeneration
    loading.value = true
    error.value = false
    try {
      const data = await useAPI<FolderListResponse>('/api/folder/list')
      if (generation !== requestGeneration)
        return
      flat.value = data.folders
      uncategorizedCount.value = data.uncategorizedCount
      writeDashboardCache(FOLDERS_CACHE_KEY, data)

      const live = new Set(data.folders.map(folder => folder.id))
      if (expandedIds.value.some(id => !live.has(id)))
        expandedIds.value = expandedIds.value.filter(id => live.has(id))
    }
    catch (cause) {
      if (generation !== requestGeneration)
        return
      console.error(cause)
      error.value = true
    }
    finally {
      if (generation === requestGeneration)
        loading.value = false
    }
  }

  /**
   * Collapses a burst of changes into one request. Dragging links one at a time
   * is the only way to move several, since there is no multi-select, so this is
   * the common path rather than an edge case.
   */
  const scheduleFoldersRefresh = useDebounceFn(() => void fetchFolders(), 500, { maxWait: 2000 })

  function isExpanded(id: string): boolean {
    return expandedIds.value.includes(id)
  }

  function setExpanded(id: string, expanded: boolean) {
    if (expanded === isExpanded(id))
      return
    expandedIds.value = expanded
      ? [...expandedIds.value, id]
      : expandedIds.value.filter(item => item !== id)
  }

  /**
   * The folder tree lives in the sidebar, which is present on every dashboard
   * page, so selecting a folder has to navigate to the link list rather than
   * only mutate the store. Navigating with the query also covers the case where
   * the list is already open, because the route watcher applies it back.
   *
   * `folder` is a folder id, `UNCATEGORIZED_FOLDER`, or undefined for all links.
   */
  async function openFolder(folder?: string): Promise<void> {
    const links = useDashboardLinksStore()
    await navigateTo({
      path: '/dashboard/links',
      query: serializeLinksQuery({
        status: links.status,
        sort: links.sortBy,
        tag: links.tag,
        folder,
      }),
    })
  }

  /** Ancestors of `id`, outermost first, including the folder itself. */
  function breadcrumb(id: string | undefined): FolderNode[] {
    const path: FolderNode[] = []
    let current = id ? byId.value.get(id) : undefined
    while (current && path.length <= ordered.value.length) {
      path.unshift(current)
      current = current.parentId ? byId.value.get(current.parentId) : undefined
    }
    return path
  }

  /** `Work / Clients`, used for the folder chip on link cards. */
  function pathLabel(id: string | undefined): string {
    return breadcrumb(id).map(node => node.name).join(' / ')
  }

  function isDescendant(candidateId: string, ancestorId: string): boolean {
    return breadcrumb(candidateId).some(node => node.id === ancestorId && node.id !== candidateId)
  }

  /** 1 for a leaf; how many levels a subtree needs at its destination. */
  function subtreeHeight(id: string): number {
    const node = byId.value.get(id)
    if (!node?.children.length)
      return 1
    return 1 + Math.max(...node.children.map(child => subtreeHeight(child.id)))
  }

  async function createFolder(input: CreateFolderInput): Promise<Folder> {
    const folder = await useAPI<Folder>('/api/folder/create', { method: 'POST', body: input })
    await fetchFolders()
    return folder
  }

  /** Exposed so the layout can reconcile counts without a request per link edit. */
  function refreshFoldersSoon(): void {
    void scheduleFoldersRefresh()
  }

  async function updateFolder(input: EditFolderInput): Promise<Folder> {
    const folder = await useAPI<Folder>('/api/folder/edit', { method: 'PUT', body: input })
    await fetchFolders()
    return folder
  }

  async function deleteFolder(id: string): Promise<void> {
    await useAPI('/api/folder/delete', { method: 'POST', body: { id } })
    await fetchFolders()
    // The delete re-homes every link inside, so any open list is now stale.
    useDashboardLinksStore().requestLinksRefresh()
  }

  /**
   * `fromFolderId` lets the badges move with the drop instead of waiting on the
   * reconciling fetch. Nothing here reloads the link list: a reload would reset
   * it to page one between two consecutive drags, so the list patches the moved
   * rows in place from the event below.
   */
  async function moveLinks(slugs: string[], folderId: string | null, fromFolderId?: string | null): Promise<string[]> {
    const { moved } = await useAPI<{ moved: string[] }>('/api/link/move', {
      method: 'PUT',
      body: { slugs, folderId },
    })

    if (fromFolderId !== undefined)
      applyLocalMove(moved.length, fromFolderId, folderId)
    scheduleFoldersRefresh()
    useDashboardLinksStore().notifyLinksMoved({ slugs: moved, folderId })
    return moved
  }

  /**
   * Moves the counts immediately so a drop reads as done. The debounced fetch
   * that follows is the source of truth and corrects any drift.
   */
  function applyLocalMove(count: number, fromFolderId: string | null, toFolderId: string | null): void {
    if (!count || fromFolderId === toFolderId)
      return

    flat.value = flat.value.map((folder) => {
      if (folder.id === fromFolderId)
        return { ...folder, linkCount: Math.max(0, folder.linkCount - count) }
      if (folder.id === toFolderId)
        return { ...folder, linkCount: folder.linkCount + count }
      return folder
    })

    if (fromFolderId === null)
      uncategorizedCount.value = Math.max(0, uncategorizedCount.value - count)
    if (toFolderId === null)
      uncategorizedCount.value += count
  }

  // Dialog plumbing lives here so the sidebar tree, the link cards and the
  // folder header can all open the same dialogs without prop drilling.
  const createParentId = shallowRef<string | null>(null)
  const showCreateDialog = shallowRef(false)
  const renameTarget = shallowRef<Folder | null>(null)
  const deleteTarget = shallowRef<FolderNode | null>(null)
  const moveLinkSlugs = shallowRef<string[]>([])
  const moveLinkFolderId = shallowRef<string | null>(null)
  const showMoveLinkDialog = shallowRef(false)

  function openCreateDialog(parentId: string | null = null) {
    createParentId.value = parentId
    showCreateDialog.value = true
  }

  function openRenameDialog(folder: Folder) {
    renameTarget.value = folder
  }

  function openDeleteDialog(folder: FolderNode) {
    deleteTarget.value = folder
  }

  /** `currentFolderId` preselects the picker so Save is not a destructive default. */
  function openMoveLinkDialog(slugs: string[], currentFolderId: string | null = null) {
    moveLinkSlugs.value = slugs
    moveLinkFolderId.value = currentFolderId
    showMoveLinkDialog.value = true
  }

  return {
    createParentId,
    showCreateDialog,
    renameTarget,
    deleteTarget,
    moveLinkSlugs,
    moveLinkFolderId,
    showMoveLinkDialog,
    openCreateDialog,
    openRenameDialog,
    openDeleteDialog,
    openMoveLinkDialog,
    flat,
    tree,
    ordered,
    visibleNodes,
    byId,
    uncategorizedCount,
    totalCount,
    loading,
    error,
    expandedIds,
    isExpanded,
    setExpanded,
    fetchFolders,
    refreshFoldersSoon,
    openFolder,
    breadcrumb,
    pathLabel,
    isDescendant,
    subtreeHeight,
    createFolder,
    updateFolder,
    deleteFolder,
    moveLinks,
  }
})
