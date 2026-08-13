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

// Loading is owned by the dashboard layout: below 768px this tree lives inside
// a Sheet that stays unmounted until the user opens it, so a fetch started here
// never ran on mobile and every folder surface came up empty.
const migration = useLinkMigration()
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
        <!--
          All links is a scope rather than a container, so it carries a heavier
          label and a rule below it. Uncategorized holds links like any folder,
          so it renders as a folder row pinned to the top of the list.
        -->
        <SidebarMenuItem>
          <SidebarMenuButton
            :is-active="isAllActive"
            :tooltip="$t('links.folders.all_links')"
            class="
              pr-14 pl-10 transition-colors
              hover:rounded-4xl
              data-active:rounded-4xl
            "
            @click="folders.openFolder(undefined)"
          >
            <Layers aria-hidden="true" />
            <span class="truncate font-medium">{{ $t('links.folders.all_links') }}</span>
          </SidebarMenuButton>
          <SidebarMenuBadge class="right-8">
            {{ folders.totalCount }}
          </SidebarMenuBadge>
        </SidebarMenuItem>

        <SidebarSeparator class="mx-2 my-1" />

        <SidebarMenuItem>
          <SidebarMenuButton
            :is-active="isUncategorizedActive"
            :tooltip="$t('links.folders.uncategorized')"
            class="
              pr-14 pl-10 transition-colors
              hover:rounded-4xl
              data-[drop=true]:bg-sidebar-accent data-[drop=true]:ring-2
              data-[drop=true]:ring-sidebar-ring
              data-active:rounded-4xl
            "
            :data-drop="isRootDropTarget || undefined"
            @click="folders.openFolder(UNCATEGORIZED_FOLDER)"
            @dragenter="activeDrag && (dragDepth += 1)"
            @dragleave="dragDepth = Math.max(0, dragDepth - 1)"
            @dragover="handleRootDragOver"
            @drop="handleRootDrop"
          >
            <Inbox aria-hidden="true" />
            <span class="truncate">{{ $t('links.folders.uncategorized') }}</span>
          </SidebarMenuButton>
          <SidebarMenuBadge class="right-8">
            {{ folders.uncategorizedCount }}
          </SidebarMenuBadge>
        </SidebarMenuItem>

        <DashboardFoldersFolderTreeItem
          v-for="node in folders.visibleNodes"
          :key="node.id"
          :node="node"
        />

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

        <SidebarMenuItem
          v-else-if="!folders.visibleNodes.length" class="px-2 py-1"
        >
          <p class="text-xs text-sidebar-foreground/60">
            {{ $t('links.folders.empty') }}
          </p>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
</template>
