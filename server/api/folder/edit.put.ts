import { EditFolderSchema } from '#shared/schemas/folder'

defineRouteMeta({
  openAPI: {
    description: 'Rename a folder, move it to another parent, or both',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', description: 'The folder to update' },
              name: { type: 'string', description: 'New name, omit to keep the current one' },
              parentId: { type: 'string', nullable: true, description: 'New parent folder id, null to move to the root level, omit to keep the current parent' },
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
      statusText: 'Preview mode cannot edit folders.',
    })
  }

  const input = await readValidatedBody(event, EditFolderSchema.parse)
  return await updateFolder(event, input)
})
