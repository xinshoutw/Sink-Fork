import { CreateFolderSchema } from '#shared/schemas/folder'

defineRouteMeta({
  openAPI: {
    description: 'Create a folder',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', description: 'Folder name, 1-64 characters, unique among its siblings' },
              parentId: { type: 'string', nullable: true, description: 'Parent folder id, omit or null to create at the root level' },
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
      statusText: 'Preview mode cannot create folders.',
    })
  }

  const input = await readValidatedBody(event, CreateFolderSchema.parse)
  const folder = await createFolder(event, input)
  setResponseStatus(event, 201)
  return folder
})
