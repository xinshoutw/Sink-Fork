import { MoveLinksSchema } from '#shared/schemas/folder'

defineRouteMeta({
  openAPI: {
    description: 'Move one or more links into a folder, or out of every folder',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['slugs', 'folderId'],
            properties: {
              slugs: { type: 'array', items: { type: 'string' }, maxItems: 100, description: 'Slugs of the links to move' },
              folderId: { type: 'string', nullable: true, description: 'Destination folder id, or null to make the links uncategorized' },
            },
          },
        },
      },
    },
  },
})

export default eventHandler(async (event) => {
  const { previewMode } = useRuntimeConfig(event).public
  if (previewMode) {
    throw createError({
      status: 403,
      statusText: 'Preview mode cannot move links.',
    })
  }

  const { slugs, folderId } = await readValidatedBody(event, MoveLinksSchema.parse)
  const moved = await moveLinks(event, slugs.map(slug => normalizeSlug(event, slug)), folderId)
  return { moved }
})
