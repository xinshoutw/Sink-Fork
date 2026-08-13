<script setup lang="ts">
import { LoaderCircle } from '@lucide/vue'
import { toast } from 'vue-sonner'

const folders = useDashboardFoldersStore()
const { t } = useI18n()

const target = shallowRef<string | null>(null)
const moving = shallowRef(false)
const pickerId = useId()

const open = computed({
  get: () => folders.showMoveLinkDialog,
  set: (value: boolean) => {
    folders.showMoveLinkDialog = value
  },
})

watch(open, (isOpen) => {
  if (isOpen)
    target.value = null
})

async function submit() {
  if (moving.value || !folders.moveLinkSlugs.length)
    return

  moving.value = true
  try {
    await folders.moveLinks(folders.moveLinkSlugs, target.value)
    toast(t('links.folders.move_link_success'))
    open.value = false
  }
  catch (cause) {
    console.error(cause)
    toast.error(getFolderErrorMessage(cause, t))
  }
  finally {
    moving.value = false
  }
}
</script>

<template>
  <ResponsiveModal
    v-model:open="open"
    :title="$t('links.folders.move_link_title')"
    :description="$t('links.folders.move_link_description')"
  >
    <div class="space-y-4 px-1 pb-1">
      <Field>
        <FieldLabel :for="pickerId">
          {{ $t('links.folders.field_label') }}
        </FieldLabel>
        <DashboardFoldersFolderPicker :id="pickerId" v-model="target" />
      </Field>
    </div>

    <template #footer>
      <Button type="button" variant="secondary" @click="open = false">
        {{ $t('common.cancel') }}
      </Button>
      <Button type="button" :disabled="moving" @click="submit">
        <LoaderCircle
          v-if="moving"
          class="motion-safe:animate-spin"
          aria-hidden="true"
        />
        {{ $t('common.save') }}
      </Button>
    </template>
  </ResponsiveModal>
</template>
