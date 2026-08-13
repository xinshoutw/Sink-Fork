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

// Drag handlers live on the row rather than the list item, so hovering a nested
// folder does not also light up every ancestor. The counter is still needed
// because dragenter/dragleave fire for the row's own icons and labels.
const dragDepth = shallowRef(0)
const isDropTarget = computed(() => dragDepth.value > 0 && canDropOn(props.node.id))
const isSelfDragging = computed(() => activeDrag.value?.kind === 'folder' && activeDrag.value.id === props.node.id)

function open() {
  linksStore.folder = props.node.id
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
    <Collapsible :open="expanded" @update:open="folders.setExpanded(node.id, $event)">
      <ContextMenu>
        <ContextMenuTrigger as-child>
          <SidebarMenuButton
            :is-active="isCurrent"
            :tooltip="node.name"
            draggable="true"
            class="
              pr-8
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
            <CollapsibleTrigger
              v-if="hasChildren"
              as="span"
              role="button"
              tabindex="-1"
              :aria-label="expanded ? `Collapse ${node.name}` : `Expand ${node.name}`"
              class="
                -m-1 flex size-5 shrink-0 items-center justify-center rounded-md
                p-1
                hover:bg-sidebar-border
              "
              @click.stop
            >
              <ChevronRight
                class="size-3.5 transition-transform duration-200"
                :class="expanded && 'rotate-90'"
                aria-hidden="true"
              />
            </CollapsibleTrigger>
            <span v-else class="size-5 shrink-0" aria-hidden="true" />
            <component :is="expanded && hasChildren ? FolderOpen : Folder" aria-hidden="true" />
            <span class="truncate">{{ node.name }}</span>
          </SidebarMenuButton>
        </ContextMenuTrigger>
        <ContextMenuContent class="w-48">
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

      <SidebarMenuBadge
        class="
          transition-opacity
          md:group-focus-within/menu-item:opacity-0
          md:group-hover/menu-item:opacity-0
        "
      >
        {{ node.totalCount }}
      </SidebarMenuBadge>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <SidebarMenuAction show-on-hover :aria-label="`Folder actions for ${node.name}`">
            <MoreHorizontal aria-hidden="true" />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" class="w-48">
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

      <CollapsibleContent v-if="hasChildren">
        <SidebarMenuSub>
          <DashboardFoldersFolderTreeItem
            v-for="child in node.children"
            :key="child.id"
            :node="child"
          />
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  </SidebarMenuItem>
</template>
