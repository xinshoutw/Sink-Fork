import type { H3Event } from 'h3'
import type { CreateFolderInput, EditFolderInput, Folder, FolderWithCount } from '#shared/schemas/folder'
import {
  d1CountUncategorizedLinks,
  d1CreateFolder,
  d1DeleteFolder,
  d1FolderExists,
  d1ListFolders,
  d1MoveLinks,
  d1UpdateFolder,
} from '../services/link-store/folders'
import { deleteLinkCache } from '../services/link-store/kv'

export interface FolderListResult {
  folders: FolderWithCount[]
  uncategorizedCount: number
}

export async function listFolders(event: H3Event): Promise<FolderListResult> {
  const [folders, uncategorizedCount] = await Promise.all([
    d1ListFolders(event),
    d1CountUncategorizedLinks(event),
  ])
  return { folders, uncategorizedCount }
}

export async function folderExists(event: H3Event, id: string): Promise<boolean> {
  return await d1FolderExists(event, id)
}

/** Ids of every existing folder, for bulk validation such as import. */
export async function listFolderIds(event: H3Event): Promise<Set<string>> {
  return new Set((await d1ListFolders(event)).map(folder => folder.id))
}

export async function createFolder(event: H3Event, input: CreateFolderInput): Promise<Folder> {
  return await d1CreateFolder(event, input)
}

export async function updateFolder(event: H3Event, input: EditFolderInput): Promise<Folder> {
  return await d1UpdateFolder(event, input)
}

export async function deleteFolder(event: H3Event, id: string): Promise<boolean> {
  return await d1DeleteFolder(event, id)
}

/**
 * Moves links between folders. The KV cache stores the whole link payload, so
 * every moved slug is evicted and repopulated on its next read rather than
 * rewritten here.
 */
export async function moveLinks(event: H3Event, slugs: string[], folderId: string | null): Promise<string[]> {
  const moved = await d1MoveLinks(event, slugs, folderId)
  await Promise.all(moved.map(slug => deleteLinkCache(event, slug)))
  return moved
}
