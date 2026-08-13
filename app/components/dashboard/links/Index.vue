<script setup lang="ts">
import type { LinkUpdateType } from '@/types'
import type { DashboardLink, DashboardLinkListResponse } from '@/types/dashboard-links'
import { AlertCircle, Inbox, LoaderCircle } from '@lucide/vue'
import { useInfiniteScroll } from '@vueuse/core'
import { UNCATEGORIZED_FOLDER } from '#shared/schemas/folder'

const linksStore = useDashboardLinksStore()

const links = ref<DashboardLink[]>([])
const listComplete = ref(false)
const listError = ref(false)
const listLoading = ref(false)
const limit = 48
let cursor = ''
let requestGeneration = 0

const { countersMap, counterErrorIds, fetchCounters, resetCounters } = useLinkCounters()
provide(LINKS_COUNTERS_MAP_KEY, countersMap)
provide(LINKS_COUNTER_ERROR_IDS_KEY, counterErrorIds)
provide(RETRY_LINK_COUNTERS_KEY, (id: string) => void fetchCounters([id]))

const scrollContainer = shallowRef<HTMLElement | null>(null)

onMounted(() => {
  scrollContainer.value = document.getElementById('dashboard-main')
  // resetAndLoad, not getLinks: this is the path that paints from the cache, so
  // a first render and a back-navigation get the same instant list.
  resetAndLoad()
})

async function getLinks() {
  if (listLoading.value || listComplete.value)
    return

  const generation = requestGeneration
  const requestCursor = cursor
  listLoading.value = true
  try {
    const data = await useAPI<DashboardLinkListResponse>('/api/link/list', {
      query: {
        limit,
        cursor: requestCursor,
        sort: linksStore.sortBy,
        status: linksStore.status,
        tag: linksStore.tag,
        folder: linksStore.folder,
      },
    })

    if (generation !== requestGeneration)
      return

    const newLinks = data.links.filter(Boolean)
    if (!requestCursor) {
      // The first page replaces whatever the cache painted, so links deleted or
      // moved elsewhere since it was written do not linger.
      links.value = newLinks
      writeDashboardCache(cacheKey(), newLinks)
    }
    else {
      const existingSlugs = new Set(links.value.map(link => link.slug))
      links.value = links.value.concat(newLinks.filter(link => !existingSlugs.has(link.slug)))
    }
    cursor = data.cursor
    listComplete.value = data.list_complete
    listError.value = false

    const ids = newLinks.map(l => l.id).filter(id => !countersMap.value[id])
    void fetchCounters(ids)
  }
  catch (error) {
    if (generation !== requestGeneration)
      return
    console.error(error)
    listError.value = true
  }
  finally {
    if (generation === requestGeneration)
      listLoading.value = false
  }
}

/** One cache entry per filter combination, since each yields a different page. */
function cacheKey() {
  return `links:${linksStore.sortBy}:${linksStore.status}:${linksStore.tag ?? ''}:${linksStore.folder ?? ''}`
}

function resetAndLoad() {
  requestGeneration++
  resetCounters()
  cursor = ''
  listComplete.value = false
  listError.value = false
  listLoading.value = false

  // Paint the last page seen for these filters right away, then revalidate.
  // The cursor stays empty so getLinks() refetches page one and replaces it.
  const cached = readDashboardCache<DashboardLink[]>(cacheKey())
  links.value = cached ?? []
  if (cached?.length)
    void fetchCounters(cached.map(link => link.id))

  void getLinks()
}

useInfiniteScroll(
  scrollContainer,
  getLinks,
  {
    distance: 0,
    interval: 1000,
    canLoadMore: () => {
      return !listError.value && !listComplete.value
    },
  },
)

watch(
  [() => linksStore.sortBy, () => linksStore.status, () => linksStore.tag, () => linksStore.folder],
  resetAndLoad,
)

function matchesFolderFilter(link: DashboardLink) {
  if (!linksStore.folder)
    return true
  if (linksStore.folder === UNCATEGORIZED_FOLDER)
    return !link.folderId
  return link.folderId === linksStore.folder
}

function matchesCurrentFilters(link: DashboardLink) {
  const isExpired = Boolean(link.expiration && link.expiration <= Math.floor(Date.now() / 1000))
  return (linksStore.status === 'expired') === isExpired
    && (!linksStore.tag || link.tags?.includes(linksStore.tag))
    && matchesFolderFilter(link)
}

function updateLinkList(link: DashboardLink, type: LinkUpdateType) {
  if (type === 'edit') {
    const index = links.value.findIndex(l => l.slug === link.slug)
    if (index >= 0 && matchesCurrentFilters(link))
      links.value[index] = link
    else if (index >= 0)
      links.value.splice(index, 1)
  }
  else if (type === 'delete') {
    const index = links.value.findIndex(l => l.slug === link.slug)
    if (index >= 0)
      links.value.splice(index, 1)
  }
  else {
    if (!matchesCurrentFilters(link))
      return

    if (linksStore.sortBy !== 'newest') {
      linksStore.sortBy = 'newest'
      return
    }

    links.value = [link, ...links.value.filter(item => item.slug !== link.slug)]
  }
}

linksStore.onLinkUpdate(({ link, type }) => {
  // Captured first: updateLinkList can switch sortBy to 'newest', and computing
  // the key afterwards filed the old, differently sorted page under the new sort.
  const key = cacheKey()
  updateLinkList(link, type)
  // Keep the cache in step so navigating away and back does not briefly show
  // the link as it was before this edit.
  if (key === cacheKey())
    writeDashboardCache(key, links.value.slice(0, limit))
})

linksStore.onLinksRefresh(() => {
  // A bulk change such as a folder delete can touch links on pages this client
  // never loaded, so every cached list page is suspect. The folder entry is left
  // alone: the folders store has just refreshed and rewritten it.
  clearDashboardCache('links:')
  resetAndLoad()
})

/**
 * Moves are patched in place rather than reloaded. Without multi-select the only
 * way to move several links is to drag them one after another, and a reload
 * between drags would reset the list to page one and drop the scroll position,
 * pulling the next card out from under the cursor.
 */
linksStore.onLinksMoved(({ slugs, folderId }) => {
  const moved = new Set(slugs)
  const next: DashboardLink[] = []
  let changed = false

  for (const link of links.value) {
    if (!moved.has(link.slug)) {
      next.push(link)
      continue
    }
    changed = true
    const updated: DashboardLink = { ...link, folderId: folderId ?? undefined }
    // A link moved out of the folder being browsed no longer belongs in the list.
    if (matchesFolderFilter(updated))
      next.push(updated)
  }

  if (!changed)
    return

  links.value = next
  // Other cached views now disagree about where these links live.
  clearDashboardCache('links:')
  writeDashboardCache(cacheKey(), next.slice(0, limit))
})
</script>

<template>
  <section
    v-if="links.length"
    class="
      grid grid-cols-1 gap-4
      md:grid-cols-2
      lg:grid-cols-3
    "
  >
    <DashboardLinksLink
      v-for="link in links"
      :key="link.slug"
      :link="link"
    />
  </section>
  <section
    v-else-if="listLoading"
    class="
      grid grid-cols-1 gap-4
      md:grid-cols-2
      lg:grid-cols-3
    "
    role="status"
    aria-live="polite"
  >
    <DashboardLinksLinkSkeleton v-for="index in 6" :key="index" />
    <span class="sr-only">{{ $t('dashboard.loading') }}</span>
  </section>
  <div
    v-if="links.length"
    class="flex min-h-14 items-center justify-center py-4"
    role="status"
    aria-live="polite"
  >
    <template v-if="listLoading">
      <LoaderCircle class="motion-safe:animate-spin" aria-hidden="true" />
      <span class="sr-only">{{ $t('dashboard.loading') }}</span>
    </template>
    <span v-else-if="listComplete" class="text-sm">
      {{ $t('links.no_more') }}
    </span>
  </div>
  <Card v-if="!listLoading && listComplete && links.length === 0">
    <CardContent
      class="
        flex min-h-48 flex-col items-center justify-center gap-3 text-center
        text-muted-foreground
      "
    >
      <Inbox class="size-8" aria-hidden="true" />
      <p class="text-sm">
        {{ $t('links.no_filtered_results') }}
      </p>
    </CardContent>
  </Card>
  <Alert
    v-if="listError"
    variant="destructive"
    class="mx-auto max-w-xl"
  >
    <AlertCircle aria-hidden="true" />
    <AlertTitle>{{ $t('links.load_failed') }}</AlertTitle>
    <AlertDescription>
      <Button variant="link" size="sm" class="text-destructive" @click="getLinks">
        {{ $t('common.try_again') }}
      </Button>
    </AlertDescription>
  </Alert>
</template>
