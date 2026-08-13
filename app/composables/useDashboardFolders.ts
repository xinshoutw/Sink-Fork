import type { CreateFolderInput, EditFolderInput, Folder, FolderWithCount } from '#shared/schemas/folder'
import { useStorage } from '@vueuse/core'

export interface FolderNode extends FolderWithCount {
  children: FolderNode[]
  depth: number
  /** Links in this folder and every folder below it. */
  totalCount: number
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
    flat.map(folder => [folder.id, { ...folder, children: [], depth: 0, totalCount: folder.linkCount }]),
  )

  const roots: FolderNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent)
      parent.children.push(node)
    else
      roots.push(node)
  }

  // Depth top-down, rolled-up counts bottom-up.
  const assign = (node: FolderNode, depth: number): number => {
    node.depth = depth
    node.totalCount = node.linkCount + node.children.reduce((sum, child) => sum + assign(child, depth + 1), 0)
    return node.totalCount
  }
  roots.forEach(root => assign(root, 0))
  return roots
}

/** Flattens the tree back into render order, parents before their children. */
function flattenTree(nodes: FolderNode[]): FolderNode[] {
  return nodes.flatMap(node => [node, ...flattenTree(node.children)])
}

export const useDashboardFoldersStore = defineStore('dashboard-folders', () => {
  const flat = shallowRef<FolderWithCount[]>([])
  const uncategorizedCount = shallowRef(0)
  const loading = shallowRef(false)
  const error = shallowRef(false)
  let requestGeneration = 0

  // Expansion is view state, not data, so it stays local instead of in the URL.
  const expandedIds = useStorage<string[]>('sink:dashboard:expanded-folders', [])

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
    tree.value.reduce((sum, node) => sum + node.totalCount, 0) + uncategorizedCount.value,
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

  async function createFolder(input: CreateFolderInput): Promise<Folder> {
    const folder = await useAPI<Folder>('/api/folder/create', { method: 'POST', body: input })
    await fetchFolders()
    return folder
  }

  async function updateFolder(input: EditFolderInput): Promise<Folder> {
    const folder = await useAPI<Folder>('/api/folder/edit', { method: 'PUT', body: input })
    await fetchFolders()
    return folder
  }

  async function deleteFolder(id: string): Promise<void> {
    await useAPI('/api/folder/delete', { method: 'POST', body: { id } })
    await fetchFolders()
  }

  async function moveLinks(slugs: string[], folderId: string | null): Promise<string[]> {
    const { moved } = await useAPI<{ moved: string[] }>('/api/link/move', {
      method: 'PUT',
      body: { slugs, folderId },
    })
    await fetchFolders()
    useDashboardLinksStore().requestLinksRefresh()
    return moved
  }

  // Dialog plumbing lives here so the sidebar tree, the link cards and the
  // folder header can all open the same dialogs without prop drilling.
  const createParentId = shallowRef<string | null>(null)
  const showCreateDialog = shallowRef(false)
  const renameTarget = shallowRef<Folder | null>(null)
  const deleteTarget = shallowRef<FolderNode | null>(null)
  const moveLinkSlugs = shallowRef<string[]>([])
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

  function openMoveLinkDialog(slugs: string[]) {
    moveLinkSlugs.value = slugs
    showMoveLinkDialog.value = true
  }

  return {
    createParentId,
    showCreateDialog,
    renameTarget,
    deleteTarget,
    moveLinkSlugs,
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
    breadcrumb,
    pathLabel,
    isDescendant,
    createFolder,
    updateFolder,
    deleteFolder,
    moveLinks,
  }
})
