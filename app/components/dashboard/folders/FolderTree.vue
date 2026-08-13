<script setup lang="ts">
import { FolderPlus, Inbox, Layers, LoaderCircle } from '@lucide/vue'
import { UNCATEGORIZED_FOLDER } from '#shared/schemas/folder'

const folders = useDashboardFoldersStore()
const linksStore = useDashboardLinksStore()
const { activeDrag, canDropOn, applyDropWithFeedback } = useFolderDragDrop()

const dragDepth = shallowRef(0)
const isRootDropTarget = computed(() => dragDepth.value > 0 && canDropOn(null))

const isAllActive = computed(() => !linksStore.folder)
const isUncategorizedActive = computed(() => linksStore.folder === UNCATEGORIZED_FOLDER)

function handleRootDragOver(event: DragEvent) {
  if (!canDropOn(null))
    return
  event.preventDefault()
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = 'move'
}

async function handleRootDrop(event: DragEvent) {
  dragDepth.value = 0
  if (!canDropOn(null))
    return
  event.preventDefault()
  await applyDropWithFeedback(event, null)
}

// The folder endpoints sit behind the same migration gate as links, so waiting
// avoids a 423 error state in the sidebar on a store that has not migrated yet.
const migration = useLinkMigration()

watch(migration.completed, (completed) => {
  if (completed)
    void folders.fetchFolders()
}, { immediate: true })

// Folder counts shift whenever a link is created, edited or deleted.
linksStore.onLinkUpdate(() => void folders.fetchFolders())
</script>

<template>
  <SidebarGroup
    v-if="migration.completed.value" class="
      group-data-[collapsible=icon]:hidden
    "
  >
    <SidebarGroupLabel>{{ $t('links.folders.group_label') }}</SidebarGroupLabel>
    <SidebarGroupAction
      class="transition-colors"
      aria-label="Create a new folder"
      :title="$t('links.folders.new')"
      @click="folders.openCreateDialog(null)"
    >
      <FolderPlus aria-hidden="true" />
    </SidebarGroupAction>

    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            :is-active="isAllActive"
            :tooltip="$t('links.folders.all_links')"
            class="
              pr-14 transition-colors
              hover:rounded-4xl
              data-active:rounded-4xl
            "
            @click="linksStore.folder = undefined"
          >
            <!-- Matches the chevron slot on folder rows so every icon lines up. -->
            <span class="size-5 shrink-0" aria-hidden="true" />
            <Layers aria-hidden="true" />
            <span class="truncate">{{ $t('links.folders.all_links') }}</span>
          </SidebarMenuButton>
          <SidebarMenuBadge class="right-8">
            {{ folders.totalCount }}
          </SidebarMenuBadge>
        </SidebarMenuItem>

        <DashboardFoldersFolderTreeItem
          v-for="node in folders.visibleNodes"
          :key="node.id"
          :node="node"
        />

        <SidebarMenuItem>
          <SidebarMenuButton
            :is-active="isUncategorizedActive"
            :tooltip="$t('links.folders.uncategorized')"
            class="
              pr-14 transition-colors
              hover:rounded-4xl
              data-[drop=true]:bg-sidebar-accent data-[drop=true]:ring-2
              data-[drop=true]:ring-sidebar-ring
              data-active:rounded-4xl
            "
            :data-drop="isRootDropTarget || undefined"
            @click="linksStore.folder = UNCATEGORIZED_FOLDER"
            @dragenter="activeDrag && (dragDepth += 1)"
            @dragleave="dragDepth = Math.max(0, dragDepth - 1)"
            @dragover="handleRootDragOver"
            @drop="handleRootDrop"
          >
            <span class="size-5 shrink-0" aria-hidden="true" />
            <Inbox aria-hidden="true" />
            <span class="truncate">{{ $t('links.folders.uncategorized') }}</span>
          </SidebarMenuButton>
          <SidebarMenuBadge class="right-8">
            {{ folders.uncategorizedCount }}
          </SidebarMenuBadge>
        </SidebarMenuItem>

        <SidebarMenuItem v-if="folders.loading && !folders.flat.length">
          <SidebarMenuButton disabled>
            <LoaderCircle
              class="motion-safe:animate-spin"
              aria-hidden="true"
            />
            <span class="truncate">{{ $t('links.folders.loading') }}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarMenuItem v-else-if="folders.error">
          <SidebarMenuButton class="text-destructive" @click="folders.fetchFolders()">
            <span class="truncate">{{ $t('common.try_again') }}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
</template>
