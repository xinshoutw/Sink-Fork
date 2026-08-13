defineRouteMeta({
  openAPI: {
    description: 'List all folders with the number of links directly inside each one',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async event => await listFolders(event))
