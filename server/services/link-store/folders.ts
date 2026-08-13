import type { H3Event } from 'h3'
import type { CreateFolderInput, EditFolderInput, Folder, FolderWithCount } from '#shared/schemas/folder'
import { count, eq, inArray, isNull, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { createError } from 'h3'
import { customAlphabet } from 'nanoid'
import { MAX_FOLDER_DEPTH } from '#shared/schemas/folder'
import { folders, links } from '../../database/schema'

const newFolderId = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 10)

/**
 * Folder trees are small enough to validate in memory, so the whole index is
 * loaded once per mutation instead of issuing recursive CTEs per check.
 * ponytail: in-memory validation; move to recursive CTEs if a deployment ever
 * grows past a few thousand folders.
 */
type FolderIndex = Map<string, Folder>

function getDatabase(event: H3Event) {
  return drizzle(event.context.cloudflare.env.DB)
}

async function loadFolderIndex(db: ReturnType<typeof getDatabase>): Promise<FolderIndex> {
  const rows = await db.select({ id: folders.id, name: folders.name, parentId: folders.parentId }).from(folders)
  return new Map(rows.map(row => [row.id, row]))
}

/** Folder ids from `id` up to the root, excluding `id` itself. */
function ancestorIds(index: FolderIndex, id: string): string[] {
  const chain: string[] = []
  let current = index.get(id)?.parentId ?? null
  // Bounded by MAX_FOLDER_DEPTH so corrupted data cannot spin forever.
  while (current && chain.length <= MAX_FOLDER_DEPTH) {
    chain.push(current)
    current = index.get(current)?.parentId ?? null
  }
  return chain
}

/** 1 for a root folder. */
function depthOf(index: FolderIndex, id: string | null | undefined): number {
  if (!id)
    return 0
  return ancestorIds(index, id).length + 1
}

/** 1 when the folder has no children. */
function subtreeHeight(index: FolderIndex, id: string): number {
  const childrenByParent = new Map<string, string[]>()
  for (const folder of index.values()) {
    if (!folder.parentId)
      continue
    const siblings = childrenByParent.get(folder.parentId)
    if (siblings)
      siblings.push(folder.id)
    else
      childrenByParent.set(folder.parentId, [folder.id])
  }

  let height = 1
  let level = [id]
  const visited = new Set(level)
  while (level.length && height <= MAX_FOLDER_DEPTH) {
    const next = level.flatMap(parent => childrenByParent.get(parent) ?? []).filter(child => !visited.has(child))
    if (!next.length)
      break
    next.forEach(child => visited.add(child))
    level = next
    height += 1
  }
  return height
}

function assertParentExists(index: FolderIndex, parentId: string | null | undefined): void {
  if (parentId && !index.has(parentId))
    throw createError({ status: 404, statusText: 'Parent folder not found' })
}

function assertDepth(depth: number): void {
  if (depth > MAX_FOLDER_DEPTH)
    throw createError({ status: 400, statusText: `Folder nesting cannot exceed ${MAX_FOLDER_DEPTH} levels` })
}

/**
 * Sibling names are unique for anything the user asks for directly. This is not
 * backed by a database constraint on purpose: deleting a folder promotes its
 * children one level up, and a constraint would abort that delete whenever a
 * promoted child collided with an existing folder.
 *
 * Names are compared exactly, so casing distinguishes them.
 * ponytail: last-writer-wins on a concurrent create; the worst case is two
 * folders sharing a name, which the user can rename.
 */
function assertNameAvailable(index: FolderIndex, name: string, parentId: string | null, exceptId?: string): void {
  for (const folder of index.values()) {
    if (folder.id !== exceptId && folder.parentId === parentId && folder.name === name)
      throw createError({ status: 409, statusText: 'A folder with this name already exists here' })
  }
}

export async function d1ListFolders(event: H3Event): Promise<FolderWithCount[]> {
  return await getDatabase(event)
    .select({
      id: folders.id,
      name: folders.name,
      parentId: folders.parentId,
      linkCount: count(links.slug),
    })
    .from(folders)
    .leftJoin(links, eq(links.folderId, folders.id))
    .groupBy(folders.id)
    .orderBy(sql`${folders.name} collate nocase asc`)
}

export async function d1CountUncategorizedLinks(event: H3Event): Promise<number> {
  const [result] = await getDatabase(event).select({ count: count() }).from(links).where(isNull(links.folderId))
  return result?.count ?? 0
}

export async function d1CreateFolder(event: H3Event, input: CreateFolderInput): Promise<Folder> {
  const db = getDatabase(event)
  const index = await loadFolderIndex(db)
  assertParentExists(index, input.parentId)
  assertDepth(depthOf(index, input.parentId) + 1)
  assertNameAvailable(index, input.name, input.parentId ?? null)

  const now = Math.floor(Date.now() / 1000)
  const folder: Folder = {
    id: newFolderId(),
    name: input.name,
    parentId: input.parentId ?? null,
  }
  await db.insert(folders).values({ ...folder, createdAt: now, updatedAt: now })
  return folder
}

export async function d1UpdateFolder(event: H3Event, input: EditFolderInput): Promise<Folder> {
  const db = getDatabase(event)
  const index = await loadFolderIndex(db)
  const current = index.get(input.id)
  if (!current)
    throw createError({ status: 404, statusText: 'Folder not found' })

  const isMove = input.parentId !== undefined
  const nextParentId = isMove ? input.parentId ?? null : current.parentId

  if (isMove && nextParentId) {
    assertParentExists(index, nextParentId)
    if (nextParentId === input.id || ancestorIds(index, nextParentId).includes(input.id))
      throw createError({ status: 400, statusText: 'A folder cannot be moved into itself or its own subfolder' })
    assertDepth(depthOf(index, nextParentId) + subtreeHeight(index, input.id))
  }

  const next: Folder = {
    id: current.id,
    name: input.name ?? current.name,
    parentId: nextParentId,
  }
  assertNameAvailable(index, next.name, next.parentId, next.id)

  await db.update(folders)
    .set({ name: next.name, parentId: next.parentId, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(folders.id, input.id))
  return next
}

/**
 * Subfolders and links are re-homed by the `on delete set null` foreign keys:
 * children move up one level and links return to the uncategorized root.
 */
export async function d1DeleteFolder(event: H3Event, id: string): Promise<boolean> {
  const db = getDatabase(event)
  const parentId = (await db.select({ parentId: folders.parentId }).from(folders).where(eq(folders.id, id)).limit(1))[0]?.parentId
  // Captured before the delete: afterwards `set null` makes these indistinguishable
  // from folders that already lived at the root.
  const childIds = (await db.select({ id: folders.id }).from(folders).where(eq(folders.parentId, id))).map(row => row.id)

  const deleted = await db.delete(folders).where(eq(folders.id, id)).returning({ id: folders.id })
  if (!deleted.length)
    return false

  if (parentId && childIds.length)
    await db.update(folders).set({ parentId }).where(inArray(folders.id, childIds))
  return true
}

export async function d1MoveLinks(event: H3Event, slugs: string[], folderId: string | null): Promise<string[]> {
  const db = getDatabase(event)
  if (folderId) {
    const exists = await db.select({ id: folders.id }).from(folders).where(eq(folders.id, folderId)).limit(1)
    if (!exists.length)
      throw createError({ status: 404, statusText: 'Folder not found' })
  }

  const moved = await db.update(links)
    .set({ folderId })
    .where(inArray(links.slug, slugs))
    .returning({ slug: links.slug })
  return moved.map(row => row.slug)
}

export async function d1FolderExists(event: H3Event, id: string): Promise<boolean> {
  const rows = await getDatabase(event).select({ id: folders.id }).from(folders).where(eq(folders.id, id)).limit(1)
  return rows.length > 0
}
