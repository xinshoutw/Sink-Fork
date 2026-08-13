<script setup lang="ts">
import type { FolderNode } from '@/composables/useDashboardFolders'
import { ChevronRight, Folder, FolderOpen, FolderPlus, MoreHorizontal, PencilLine, Trash2 } from '@lucide/vue'

const props = defineProps<{ node: FolderNode }>()

const folders = useDashboardFoldersStore()
const linksStore = useDashboardLinksStore()
const { activeDrag, startDrag, endDrag, canDropOn, applyDropWithFeedback } = useFolderDragDrop()

const hasChildren = computed(() => props.node.children.length > 0)
const expanded = computed(() => folders.isExpanded(props.node.id))
const isCurrent = computed(() => linksStore.folder === props.node.id)

// Depth is expressed as content indentation instead of nested lists, so every
// row keeps the same right edge and the count and action column stay aligned.
const indent = computed(() => `${props.node.depth * 0.875}rem`)

// Rows are siblings rather than nested, so a drop target never overlaps another.
// The counter is still needed because dragenter and dragleave also fire for the
// row's own icon and label elements.
const dragDepth = shallowRef(0)
const isDropTarget = computed(() => dragDepth.value > 0 && canDropOn(props.node.id))
const isSelfDragging = computed(() => activeDrag.value?.kind === 'folder' && activeDrag.value.id === props.node.id)

function open() {
  void folders.openFolder(props.node.id)
}

/**
 * A menu returns focus to its trigger when it closes, which fights the dialog
 * that the selected item just opened. Same guard as links/Link.vue.
 */
function handleMenuCloseAutoFocus(event: Event) {
  if (folders.deleteTarget || folders.renameTarget || folders.showCreateDialog)
    event.preventDefault()
}

function toggle() {
  folders.setExpanded(props.node.id, !expanded.value)
}

function handleDragEnter() {
  if (activeDrag.value)
    dragDepth.value += 1
}

function handleDragLeave() {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

function handleDragOver(event: DragEvent) {
  if (!canDropOn(props.node.id))
    return
  event.preventDefault()
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = 'move'
}

async function handleDrop(event: DragEvent) {
  dragDepth.value = 0
  if (!canDropOn(props.node.id))
    return
  event.preventDefault()
  // Reveal what just landed here.
  folders.setExpanded(props.node.id, true)
  await applyDropWithFeedback(event, props.node.id)
}
</script>

<template>
  <SidebarMenuItem>
    <ContextMenu>
      <ContextMenuTrigger as-child>
        <SidebarMenuButton
          :is-active="isCurrent"
          :tooltip="node.name"
          draggable="true"
          :style="{ paddingInlineStart: indent }"
          class="
            pr-14 transition-colors
            hover:rounded-4xl
            data-dragging:opacity-50
            data-[drop=true]:bg-sidebar-accent data-[drop=true]:ring-2
            data-[drop=true]:ring-sidebar-ring
            data-active:rounded-4xl
          "
          :data-drop="isDropTarget || undefined"
          :data-dragging="isSelfDragging || undefined"
          @click="open"
          @dragstart="startDrag($event, { kind: 'folder', id: node.id })"
          @dragend="endDrag"
          @dragenter="handleDragEnter"
          @dragleave="handleDragLeave"
          @dragover="handleDragOver"
          @drop="handleDrop"
        >
          <!--
            Both branches are exactly size-5 with no margin, so a folder with
            children lines up with one without.
          -->
          <span
            v-if="hasChildren"
            role="button"
            tabindex="-1"
            :aria-label="expanded ? `Collapse ${node.name}` : `Expand ${node.name}`"
            :aria-expanded="expanded"
            class="
              flex size-5 shrink-0 items-center justify-center rounded-md
              transition-colors
              hover:bg-sidebar-border
            "
            @click.stop="toggle"
          >
            <ChevronRight
              class="size-3.5 transition-transform duration-200"
              :class="expanded && 'rotate-90'"
              aria-hidden="true"
            />
          </span>
          <span v-else class="size-5 shrink-0" aria-hidden="true" />
          <component :is="expanded && hasChildren ? FolderOpen : Folder" aria-hidden="true" />
          <span class="truncate">{{ node.name }}</span>
        </SidebarMenuButton>
      </ContextMenuTrigger>
      <ContextMenuContent class="w-48" @close-auto-focus="handleMenuCloseAutoFocus">
        <ContextMenuItem @select="folders.openCreateDialog(node.id)">
          <FolderPlus class="size-4" aria-hidden="true" />
          {{ $t('links.folders.new_subfolder') }}
        </ContextMenuItem>
        <ContextMenuItem @select="folders.openRenameDialog(node)">
          <PencilLine class="size-4" aria-hidden="true" />
          {{ $t('common.edit') }}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" @select="folders.openDeleteDialog(node)">
          <Trash2 class="size-4" aria-hidden="true" />
          {{ $t('common.delete') }}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

    <!-- Sits left of the action button so the two never overlap. -->
    <SidebarMenuBadge class="right-8">
      {{ node.totalCount }}
    </SidebarMenuBadge>

    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <SidebarMenuAction
          class="transition-colors"
          :aria-label="`Folder actions for ${node.name}`"
        >
          <MoreHorizontal aria-hidden="true" />
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        class="w-48"
        @close-auto-focus="handleMenuCloseAutoFocus"
      >
        <DropdownMenuItem @select="folders.openCreateDialog(node.id)">
          <FolderPlus class="size-4" aria-hidden="true" />
          {{ $t('links.folders.new_subfolder') }}
        </DropdownMenuItem>
        <DropdownMenuItem @select="folders.openRenameDialog(node)">
          <PencilLine class="size-4" aria-hidden="true" />
          {{ $t('common.edit') }}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" @select="folders.openDeleteDialog(node)">
          <Trash2 class="size-4" aria-hidden="true" />
          {{ $t('common.delete') }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </SidebarMenuItem>
</template>
