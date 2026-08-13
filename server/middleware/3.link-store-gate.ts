import { readCompletedLinkMigrationMarker } from '../services/link-store/migration'

const ALLOWED_MIGRATION_PATH = /^\/api\/link\/migration\/(?:status|run)\/?$/
// Folder endpoints are gated too: their link counts come from D1, so before the
// migration completes they would report zero for links that still live in KV.
const GATED_PREFIXES = ['/api/link', '/api/folder']

export default eventHandler(async (event) => {
  const pathname = getRequestURL(event).pathname
  if (!GATED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)))
    return
  if (ALLOWED_MIGRATION_PATH.test(pathname))
    return
  if (await readCompletedLinkMigrationMarker(event.context.cloudflare.env))
    return

  throw createError({
    status: 423,
    statusText: 'Link migration is required',
  })
})
