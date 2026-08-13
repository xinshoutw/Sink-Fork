import type { ExportData, Link } from '#shared/schemas/link'

defineRouteMeta({
  openAPI: {
    description: 'Export all links with pagination',
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'cursor',
        in: 'query',
        required: false,
        schema: { type: 'string' },
        description: 'Pagination cursor from previous response',
      },
    ],
  },
})

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const cursor = query.cursor as string | undefined
  const kvBatchLimit = useRuntimeConfig(event).public.kvBatchLimit as string
  const limit = +kvBatchLimit

  const list = await listLinks(event, { limit, cursor, status: 'all' })
  const links: Link[] = []
  for (const link of list.links) {
    if (link) {
      links.push(await protectLinkPasswordForExport(link))
    }
  }

  const exportData: ExportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    count: links.length,
    links,
    // Only on the first page: folders are not paginated, and repeating them on
    // every page would bloat a multi-page export.
    ...(cursor ? {} : { folders: await listPortableFolders(event) }),
    cursor: list.cursor,
    list_complete: list.list_complete,
  }

  setResponseHeader(event, 'Content-Type', 'application/json')
  setResponseHeader(event, 'Cache-Control', 'no-store')

  return exportData
})
