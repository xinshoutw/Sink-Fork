import { DeleteFolderSchema } from '#shared/schemas/folder'

defineRouteMeta({
  openAPI: {
    description: 'Delete a folder. Its subfolders move up one level and its links become uncategorized; no link is deleted.',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', description: 'The folder to delete' },
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
      statusText: 'Preview mode cannot delete folders.',
    })
  }

  const { id } = await readValidatedBody(event, DeleteFolderSchema.parse)
  if (!await deleteFolder(event, id)) {
    throw createError({
      status: 404,
      statusText: 'Folder not found',
    })
  }
})
