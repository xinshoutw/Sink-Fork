<script setup lang="ts">
import { LoaderCircle } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { FolderNameSchema } from '#shared/schemas/folder'

const folders = useDashboardFoldersStore()
const { t } = useI18n()

const name = shallowRef('')
const parentId = shallowRef<string | null>(null)
const error = shallowRef('')
const saving = shallowRef(false)
const nameId = useId()
const parentId_ = useId()

const editing = computed(() => folders.renameTarget)
const open = computed({
  get: () => folders.showCreateDialog || Boolean(folders.renameTarget),
  set: (value: boolean) => {
    if (value)
      return
    folders.showCreateDialog = false
    folders.renameTarget = null
  },
})

// Seed the fields whenever a dialog opens, for either mode.
watch(open, (isOpen) => {
  if (!isOpen)
    return
  error.value = ''
  name.value = editing.value?.name ?? ''
  parentId.value = editing.value ? editing.value.parentId : folders.createParentId
})

async function submit() {
  if (saving.value)
    return

  const parsed = FolderNameSchema.safeParse(name.value)
  if (!parsed.success) {
    error.value = t('links.folders.name_invalid')
    return
  }

  saving.value = true
  error.value = ''
  try {
    if (editing.value) {
      await folders.updateFolder({ id: editing.value.id, name: parsed.data, parentId: parentId.value })
      toast(t('links.folders.update_success'))
    }
    else {
      const folder = await folders.createFolder({ name: parsed.data, parentId: parentId.value })
      // Make the new folder visible inside its parent straight away.
      if (folder.parentId)
        folders.setExpanded(folder.parentId, true)
      toast(t('links.folders.create_success'))
    }
    open.value = false
  }
  catch (cause) {
    console.error(cause)
    error.value = getFolderErrorMessage(cause, t)
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <ResponsiveModal
    v-model:open="open"
    :title="editing ? $t('links.folders.rename_title') : $t('links.folders.create_title')"
    :description="editing ? $t('links.folders.rename_description') : $t('links.folders.create_description')"
  >
    <form class="space-y-4 px-1 pb-1" @submit.prevent="submit">
      <Field>
        <FieldLabel :for="nameId">
          {{ $t('links.folders.name_label') }}
        </FieldLabel>
        <Input
          :id="nameId"
          v-model="name"
          autocomplete="off"
          maxlength="64"
          :placeholder="$t('links.folders.name_placeholder')"
          :aria-invalid="error ? 'true' : undefined"
        />
      </Field>

      <Field>
        <FieldLabel :for="parentId_">
          {{ $t('links.folders.parent_label') }}
        </FieldLabel>
        <DashboardFoldersFolderPicker
          :id="parentId_"
          v-model="parentId"
          :root-label="$t('links.folders.root_level')"
          :exclude-subtree-of="editing?.id"
        />
      </Field>

      <p v-if="error" class="text-sm text-destructive" role="alert">
        {{ error }}
      </p>
    </form>

    <template #footer>
      <Button type="button" variant="secondary" @click="open = false">
        {{ $t('common.cancel') }}
      </Button>
      <Button type="button" :disabled="saving" @click="submit">
        <LoaderCircle
          v-if="saving"
          class="motion-safe:animate-spin"
          aria-hidden="true"
        />
        {{ $t('common.save') }}
      </Button>
    </template>
  </ResponsiveModal>
</template>
