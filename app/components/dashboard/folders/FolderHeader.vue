<script setup lang="ts">
import { ChevronRight, FolderOpen, FolderPlus, Inbox, MoreHorizontal, PencilLine, Trash2 } from '@lucide/vue'
import { UNCATEGORIZED_FOLDER } from '#shared/schemas/folder'

const folders = useDashboardFoldersStore()
const linksStore = useDashboardLinksStore()

const isUncategorized = computed(() => linksStore.folder === UNCATEGORIZED_FOLDER)
const trail = computed(() => isUncategorized.value ? [] : folders.breadcrumb(linksStore.folder))
const current = computed(() => trail.value.at(-1))
/** Everything above the current folder; the current one is the heading below. */
const ancestors = computed(() => trail.value.slice(0, -1))

const { t } = useI18n()
const summary = computed(() => isUncategorized.value
  ? t('links.folders.header_uncategorized_summary', {
      links: t('links.folders.links_count', folders.uncategorizedCount),
    })
  : t('links.folders.header_summary', {
      links: t('links.folders.links_count', current.value?.linkCount ?? 0),
      folders: t('links.folders.subfolders_count', current.value?.children.length ?? 0),
    }))

// Keep the closing menu from pulling focus back out of the dialog it opened.
function handleMenuCloseAutoFocus(event: Event) {
  if (folders.deleteTarget || folders.renameTarget || folders.showCreateDialog)
    event.preventDefault()
}
</script>

<template>
  <Card
    v-if="current || isUncategorized"
    size="sm"
    class="border-dashed"
  >
    <CardContent class="flex min-w-0 items-center gap-3">
      <span
        class="
          flex size-9 shrink-0 items-center justify-center rounded-full
          bg-secondary text-secondary-foreground
        "
      >
        <component
          :is="isUncategorized ? Inbox : FolderOpen" aria-hidden="true" class="
            size-4
          "
        />
      </span>

      <div class="min-w-0 flex-1">
        <nav
          v-if="ancestors.length" :aria-label="$t('links.folders.breadcrumb_label')" class="
            min-w-0
          "
        >
          <ol
            class="
              flex min-w-0 items-center gap-0.5 text-xs text-muted-foreground
            "
          >
            <li
              v-for="(node, index) in ancestors" :key="node.id" class="
                flex min-w-0 items-center gap-0.5
              "
            >
              <ChevronRight
                v-if="index"
                aria-hidden="true"
                class="size-3 shrink-0"
              />
              <button
                type="button"
                class="
                  max-w-32 truncate rounded-sm
                  hover:text-foreground
                  focus-visible:ring-2 focus-visible:ring-ring/50
                  focus-visible:outline-none
                "
                @click="folders.openFolder(node.id)"
              >
                {{ node.name }}
              </button>
            </li>
          </ol>
        </nav>

        <h2 class="truncate font-medium">
          {{ isUncategorized ? $t('links.folders.uncategorized') : current?.name }}
        </h2>
        <p class="truncate text-xs text-muted-foreground tabular-nums">
          {{ summary }}
        </p>
      </div>

      <DropdownMenu v-if="current">
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon" aria-label="Folder actions">
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-48" @close-auto-focus="handleMenuCloseAutoFocus">
          <DropdownMenuItem @select="folders.openCreateDialog(current!.id)">
            <FolderPlus class="size-4" aria-hidden="true" />
            {{ $t('links.folders.new_subfolder') }}
          </DropdownMenuItem>
          <DropdownMenuItem @select="folders.openRenameDialog(current!)">
            <PencilLine class="size-4" aria-hidden="true" />
            {{ $t('common.edit') }}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" @select="folders.openDeleteDialog(current!)">
            <Trash2 class="size-4" aria-hidden="true" />
            {{ $t('common.delete') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </CardContent>
  </Card>
</template>
