import type { Folder, FolderWithCount } from '../../shared/schemas/folder'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MAX_FOLDER_DEPTH } from '../../shared/schemas/folder'
import {
  deleteStoredFolders,
  deleteStoredLinks,
  fetchWithAuth,
  getD1Folder,
  getD1Link,
  postJson,
  putJson,
  setLinkStoreD1Mode,
} from '../utils'

interface FolderListResponse {
  folders: FolderWithCount[]
  uncategorizedCount: number
}

const createdFolderIds: string[] = []
const createdSlugs = new Set<string>()

/** Unique per run so parallel names never collide with leftovers from a previous run. */
const suffix = crypto.randomUUID().slice(0, 8)

async function createFolder(name: string, parentId?: string | null): Promise<Folder> {
  const response = await postJson('/api/folder/create', { name, parentId })
  expect(response.status, `create folder ${name}`).toBe(201)
  const folder = await response.json<Folder>()
  createdFolderIds.push(folder.id)
  return folder
}

async function createLink(slug: string, folderId?: string | null) {
  createdSlugs.add(slug)
  const response = await postJson('/api/link/create', {
    url: `https://example.com/${slug}`,
    slug,
    folderId,
  })
  expect(response.status, `create link ${slug}`).toBe(201)
  return response
}

async function listFolders(): Promise<FolderListResponse> {
  const response = await fetchWithAuth('/api/folder/list')
  expect(response.status).toBe(200)
  return await response.json<FolderListResponse>()
}

async function listLinkSlugs(query: string): Promise<string[]> {
  const response = await fetchWithAuth(`/api/link/list?${query}`)
  expect(response.status, `list ${query}`).toBe(200)
  const data = await response.json<{ links: { slug: string }[] }>()
  return data.links.map(link => link.slug)
}

beforeAll(async () => {
  await setLinkStoreD1Mode()
})

afterAll(async () => {
  await deleteStoredLinks([...createdSlugs])
  await deleteStoredFolders(createdFolderIds)
})

describe.sequential('/api/folder', () => {
  it('creates a root folder and nests children under it', async () => {
    const root = await createFolder(`work-${suffix}`)
    expect(root.parentId).toBe(null)

    const child = await createFolder(`clients-${suffix}`, root.id)
    expect(child.parentId).toBe(root.id)
  })

  it('rejects a duplicate name among siblings but allows it under a different parent', async () => {
    const parentA = await createFolder(`dup-a-${suffix}`)
    const parentB = await createFolder(`dup-b-${suffix}`)
    await createFolder(`shared-${suffix}`, parentA.id)

    const duplicate = await postJson('/api/folder/create', { name: `shared-${suffix}`, parentId: parentA.id })
    expect(duplicate.status).toBe(409)

    await createFolder(`shared-${suffix}`, parentB.id)
  })

  it('rejects a duplicate name at the root level', async () => {
    await createFolder(`root-dup-${suffix}`)
    const duplicate = await postJson('/api/folder/create', { name: `root-dup-${suffix}` })
    expect(duplicate.status).toBe(409)
  })

  it('rejects an unknown parent', async () => {
    const response = await postJson('/api/folder/create', { name: `orphan-${suffix}`, parentId: 'does-not-ex' })
    expect(response.status).toBe(404)
  })

  it('renames a folder without changing its parent', async () => {
    const parent = await createFolder(`rename-parent-${suffix}`)
    const folder = await createFolder(`before-${suffix}`, parent.id)

    const response = await putJson('/api/folder/edit', { id: folder.id, name: `after-${suffix}` })
    expect(response.status).toBe(200)
    const updated = await response.json<Folder>()
    expect(updated.name).toBe(`after-${suffix}`)
    expect(updated.parentId).toBe(parent.id)
  })

  it('moves a folder to another parent and back to the root', async () => {
    const source = await createFolder(`move-src-${suffix}`)
    const target = await createFolder(`move-dst-${suffix}`)
    const moving = await createFolder(`moving-${suffix}`, source.id)

    const moved = await putJson('/api/folder/edit', { id: moving.id, parentId: target.id })
    expect(moved.status).toBe(200)
    expect((await moved.json<Folder>()).parentId).toBe(target.id)

    const toRoot = await putJson('/api/folder/edit', { id: moving.id, parentId: null })
    expect(toRoot.status).toBe(200)
    expect((await toRoot.json<Folder>()).parentId).toBe(null)
  })

  it('rejects moving a folder into itself', async () => {
    const folder = await createFolder(`self-${suffix}`)
    const response = await putJson('/api/folder/edit', { id: folder.id, parentId: folder.id })
    expect(response.status).toBe(400)
  })

  it('rejects moving a folder into its own descendant', async () => {
    const grandparent = await createFolder(`cycle-gp-${suffix}`)
    const parent = await createFolder(`cycle-p-${suffix}`, grandparent.id)
    const child = await createFolder(`cycle-c-${suffix}`, parent.id)

    const response = await putJson('/api/folder/edit', { id: grandparent.id, parentId: child.id })
    expect(response.status).toBe(400)

    // The rejected move must not have corrupted the chain.
    expect((await getD1Folder(grandparent.id))?.parentId).toBe(null)
  })

  it(`rejects nesting deeper than ${MAX_FOLDER_DEPTH} levels`, async () => {
    let parentId: string | null = null
    for (let depth = 1; depth <= MAX_FOLDER_DEPTH; depth++) {
      const folder: Folder = await createFolder(`depth-${depth}-${suffix}`, parentId)
      parentId = folder.id
    }

    const tooDeep = await postJson('/api/folder/create', { name: `depth-overflow-${suffix}`, parentId })
    expect(tooDeep.status).toBe(400)
  })

  it('rejects moving a subtree that would exceed the depth limit', async () => {
    // A two-level subtree cannot fit under a parent one level below the cap.
    let parentId: string | null = null
    for (let depth = 1; depth < MAX_FOLDER_DEPTH; depth++) {
      const folder: Folder = await createFolder(`limit-${depth}-${suffix}`, parentId)
      parentId = folder.id
    }

    const subtreeRoot = await createFolder(`subtree-root-${suffix}`)
    await createFolder(`subtree-leaf-${suffix}`, subtreeRoot.id)

    const response = await putJson('/api/folder/edit', { id: subtreeRoot.id, parentId })
    expect(response.status).toBe(400)
  })

  it('deletes a folder, promotes its subfolders and keeps its links', async () => {
    const grandparent = await createFolder(`del-gp-${suffix}`)
    const parent = await createFolder(`del-p-${suffix}`, grandparent.id)
    const child = await createFolder(`del-c-${suffix}`, parent.id)
    const slug = `del-link-${suffix}`
    await createLink(slug, parent.id)

    const response = await postJson('/api/folder/delete', { id: parent.id })
    expect(response.status).toBe(204)

    expect(await getD1Folder(parent.id)).toBe(null)
    // Child moves up one level, to the deleted folder's parent.
    expect((await getD1Folder(child.id))?.parentId).toBe(grandparent.id)

    const link = await getD1Link(slug)
    expect(link, 'deleting a folder must not delete its links').not.toBe(null)
    expect(link?.folderId).toBe(null)
  })

  it('leaves unrelated root folders alone when deleting a nested folder', async () => {
    const untouched = await createFolder(`untouched-${suffix}`)
    const grandparent = await createFolder(`keep-gp-${suffix}`)
    const parent = await createFolder(`keep-p-${suffix}`, grandparent.id)
    await createFolder(`keep-c-${suffix}`, parent.id)

    expect((await postJson('/api/folder/delete', { id: parent.id })).status).toBe(204)

    expect((await getD1Folder(untouched.id))?.parentId).toBe(null)
  })

  it('restores exported folders with their original ids and re-homes their links', async () => {
    const folderId = `imp${suffix}`
    const childId = `impc${suffix}`
    const slug = `import-folder-${suffix}`
    createdFolderIds.push(folderId, childId)
    createdSlugs.add(slug)

    const response = await postJson('/api/link/import', {
      version: '1.0',
      // Child first on purpose: the importer must order parents before children.
      folders: [
        { id: childId, name: `imported-child-${suffix}`, parentId: folderId },
        { id: folderId, name: `imported-${suffix}`, parentId: null },
      ],
      links: [{ url: 'https://example.com/imported', slug, folderId: childId }],
    })
    expect(response.status).toBe(200)

    expect((await getD1Folder(folderId))?.parentId).toBe(null)
    expect((await getD1Folder(childId))?.parentId).toBe(folderId)
    expect((await getD1Link(slug))?.folderId).toBe(childId)
  })

  it('keeps an imported link whose folder is not in the file, without creating that folder', async () => {
    const slug = `import-unknown-${suffix}`
    createdSlugs.add(slug)

    const response = await postJson('/api/link/import', {
      version: '1.0',
      links: [{ url: 'https://example.com/orphan', slug, folderId: 'does-not-ex' }],
    })
    expect(response.status).toBe(200)

    const link = await getD1Link(slug)
    expect(link, 'the link itself must survive an unknown folder reference').not.toBe(null)
    expect(link?.folderId).toBe(null)
    expect(await getD1Folder('does-not-ex')).toBe(null)
  })

  it('exports folders alongside links', async () => {
    const folder = await createFolder(`exported-${suffix}`)

    const response = await fetchWithAuth('/api/link/export')
    expect(response.status).toBe(200)
    const data = await response.json<{ folders?: { id: string, name: string }[] }>()
    expect(data.folders?.some(item => item.id === folder.id), 'export must carry the folder tree').toBe(true)
  })

  it('deletes a folder even when a promoted child collides with an existing name', async () => {
    // Regression: a unique index on (parent, name) used to abort the whole
    // delete because the promoted child landed next to a same-named folder.
    const collidingName = `collide-${suffix}`
    await createFolder(collidingName)
    const parent = await createFolder(`collide-parent-${suffix}`)
    const child = await createFolder(collidingName, parent.id)
    const slug = `collide-link-${suffix}`
    await createLink(slug, parent.id)

    expect((await postJson('/api/folder/delete', { id: parent.id })).status).toBe(204)

    expect(await getD1Folder(parent.id)).toBe(null)
    expect((await getD1Folder(child.id))?.parentId).toBe(null)
    expect((await getD1Link(slug))?.folderId).toBe(null)
  })

  it('returns 404 when deleting an unknown folder', async () => {
    const response = await postJson('/api/folder/delete', { id: 'does-not-ex' })
    expect(response.status).toBe(404)
  })

  it('reports the number of links directly inside each folder', async () => {
    const folder = await createFolder(`counted-${suffix}`)
    const child = await createFolder(`counted-child-${suffix}`, folder.id)
    await createLink(`count-a-${suffix}`, folder.id)
    await createLink(`count-b-${suffix}`, folder.id)
    await createLink(`count-c-${suffix}`, child.id)

    const { folders: listed } = await listFolders()
    expect(listed.find(item => item.id === folder.id)?.linkCount).toBe(2)
    expect(listed.find(item => item.id === child.id)?.linkCount).toBe(1)
  })
})

describe.sequential('/api/link folder filtering', () => {
  it('rejects creating a link in an unknown folder', async () => {
    const response = await postJson('/api/link/create', {
      url: 'https://example.com/unknown-folder',
      slug: `unknown-folder-${suffix}`,
      folderId: 'does-not-ex',
    })
    expect(response.status).toBe(404)
  })

  it('filters the link list by folder and by uncategorized', async () => {
    const folder = await createFolder(`filter-${suffix}`)
    const inside = `inside-${suffix}`
    const outside = `outside-${suffix}`
    await createLink(inside, folder.id)
    await createLink(outside)

    const filtered = await listLinkSlugs(`folder=${folder.id}&limit=100`)
    expect(filtered).toContain(inside)
    expect(filtered).not.toContain(outside)

    const uncategorized = await listLinkSlugs('folder=none&limit=100')
    expect(uncategorized).toContain(outside)
    expect(uncategorized).not.toContain(inside)

    const all = await listLinkSlugs('limit=100')
    expect(all).toEqual(expect.arrayContaining([inside, outside]))
  })

  it('keeps the folder filter across paginated pages', async () => {
    const folder = await createFolder(`paged-${suffix}`)
    const slugs = [`page-a-${suffix}`, `page-b-${suffix}`, `page-c-${suffix}`]
    for (const slug of slugs)
      await createLink(slug, folder.id)
    await createLink(`page-noise-${suffix}`)

    const first = await fetchWithAuth(`/api/link/list?folder=${folder.id}&limit=2`)
    const firstPage = await first.json<{ links: { slug: string }[], cursor?: string, list_complete: boolean }>()
    expect(firstPage.links).toHaveLength(2)
    expect(firstPage.cursor).toBeTruthy()

    const second = await fetchWithAuth(`/api/link/list?folder=${folder.id}&limit=2&cursor=${encodeURIComponent(firstPage.cursor!)}`)
    expect(second.status).toBe(200)
    const secondPage = await second.json<{ links: { slug: string }[] }>()

    const paged = [...firstPage.links, ...secondPage.links].map(link => link.slug)
    expect(paged.sort()).toEqual([...slugs].sort())
  })

  it('rejects a cursor issued for a different folder', async () => {
    const folder = await createFolder(`cursor-${suffix}`)
    await createLink(`cursor-a-${suffix}`, folder.id)
    await createLink(`cursor-b-${suffix}`, folder.id)

    const first = await fetchWithAuth(`/api/link/list?folder=${folder.id}&limit=1`)
    const { cursor } = await first.json<{ cursor?: string }>()
    expect(cursor).toBeTruthy()

    const reused = await fetchWithAuth(`/api/link/list?limit=1&cursor=${encodeURIComponent(cursor!)}`)
    expect(reused.status).toBe(400)
  })

  it('moves links into a folder and back out again', async () => {
    const folder = await createFolder(`bulk-${suffix}`)
    const slugs = [`bulk-a-${suffix}`, `bulk-b-${suffix}`]
    for (const slug of slugs)
      await createLink(slug)

    const moved = await putJson('/api/link/move', { slugs, folderId: folder.id })
    expect(moved.status).toBe(200)
    expect((await moved.json<{ moved: string[] }>()).moved.sort()).toEqual([...slugs].sort())
    expect((await getD1Link(slugs[0]!))?.folderId).toBe(folder.id)

    const cleared = await putJson('/api/link/move', { slugs, folderId: null })
    expect(cleared.status).toBe(200)
    expect((await getD1Link(slugs[0]!))?.folderId).toBe(null)
  })

  it('moves the schema maximum of 100 links in one request', async () => {
    const folder = await createFolder(`bulk-max-${suffix}`)
    const slugs = Array.from({ length: 100 }, (_, index) => `bulk-max-${index}-${suffix}`)
    for (const slug of slugs)
      await createLink(slug)

    const response = await putJson('/api/link/move', { slugs, folderId: folder.id })
    expect(response.status, 'D1 allows only 100 bound parameters per statement').toBe(200)
    expect((await response.json<{ moved: string[] }>()).moved).toHaveLength(100)
    expect((await getD1Link(slugs[99]!))?.folderId).toBe(folder.id)
  })

  it('rejects moving links into an unknown folder', async () => {
    const slug = `bulk-unknown-${suffix}`
    await createLink(slug)
    const response = await putJson('/api/link/move', { slugs: [slug], folderId: 'does-not-ex' })
    expect(response.status).toBe(404)
  })

  it('keeps the folder when the edit body omits folderId entirely', async () => {
    const folder = await createFolder(`edit-keep-${suffix}`)
    const slug = `edit-keep-${suffix}`
    await createLink(slug, folder.id)

    // The documented minimal edit body. It must not un-file the link.
    const response = await putJson('/api/link/edit', {
      url: 'https://example.com/edited',
      slug,
    })
    expect(response.status).toBe(201)
    expect((await getD1Link(slug))?.folderId).toBe(folder.id)
  })

  it('clears the folder when editing with a null folderId', async () => {
    const folder = await createFolder(`edit-clear-${suffix}`)
    const slug = `edit-clear-${suffix}`
    await createLink(slug, folder.id)

    const response = await putJson('/api/link/edit', {
      url: `https://example.com/${slug}`,
      slug,
      folderId: null,
    })
    expect(response.status).toBe(201)
    expect((await getD1Link(slug))?.folderId).toBe(null)
  })
})
