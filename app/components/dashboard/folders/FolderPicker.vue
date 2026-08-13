<script setup lang="ts">
import { Folder, Inbox } from '@lucide/vue'

const props = withDefaults(defineProps<{
  /** Folder ids to hide, along with their subtrees. Used to keep a folder out of its own move list. */
  excludeSubtreeOf?: string
  rootLabel?: string
  disabled?: boolean
}>(), {
  disabled: false,
})

const model = defineModel<string | null>({ default: null })

const folders = useDashboardFoldersStore()
const ROOT_VALUE = '__sink_root__'

const options = computed(() => folders.ordered.filter((node) => {
  if (!props.excludeSubtreeOf)
    return true
  return node.id !== props.excludeSubtreeOf && !folders.isDescendant(node.id, props.excludeSubtreeOf)
}))

// ponytail: plain Select with indentation. Swap to Combobox when the tree stops
// fitting on one screen.
function select(value: unknown) {
  model.value = typeof value === 'string' && value !== ROOT_VALUE ? value : null
}
</script>

<template>
  <Select :model-value="model ?? ROOT_VALUE" :disabled="disabled" @update:model-value="select">
    <SelectTrigger class="w-full">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem :value="ROOT_VALUE">
        <span class="flex items-center gap-2">
          <Inbox aria-hidden="true" class="size-4 text-muted-foreground" />
          {{ rootLabel ?? $t('links.folders.uncategorized') }}
        </span>
      </SelectItem>
      <SelectItem v-for="node in options" :key="node.id" :value="node.id">
        <span
          class="flex min-w-0 items-center gap-2"
          :style="{ paddingInlineStart: `${node.depth * 0.75}rem` }"
        >
          <Folder
            aria-hidden="true" class="size-4 shrink-0 text-muted-foreground"
          />
          <span class="truncate">{{ node.name }}</span>
        </span>
      </SelectItem>
    </SelectContent>
  </Select>
</template>
