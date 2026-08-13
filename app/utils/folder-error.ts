type Translate = (key: string) => string

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null)
    return undefined
  if ('status' in error && typeof error.status === 'number')
    return error.status
  if ('statusCode' in error && typeof error.statusCode === 'number')
    return error.statusCode
  return undefined
}

/**
 * The folder endpoints answer with distinct statuses for the cases a user can
 * actually cause, so those get a specific message instead of a generic failure.
 */
export function getFolderErrorMessage(error: unknown, t: Translate): string {
  switch (errorStatus(error)) {
    case 409:
      return t('links.folders.error_duplicate')
    case 404:
      return t('links.folders.error_not_found')
    case 400:
      return t('links.folders.error_invalid_move')
    case 403:
      return t('links.folders.error_preview_mode')
    default:
      return t('links.folders.action_failed')
  }
}
