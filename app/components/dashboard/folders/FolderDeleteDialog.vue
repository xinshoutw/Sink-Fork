<script setup lang="ts">
import { LoaderCircle } from '@lucide/vue'
import { toast } from 'vue-sonner'

const folders = useDashboardFoldersStore()
const linksStore = useDashboardLinksStore()
const { t } = useI18n()

const deleting = shallowRef(false)

const target = computed(() => folders.deleteTarget)
const open = computed({
  get: () => Boolean(folders.deleteTarget),
  set: (value: boolean) => {
    if (!value)
      folders.deleteTarget = null
  },
})

async function confirmDelete() {
  const folder = target.value
  if (!folder || deleting.value)
    return

  deleting.value = true
  try {
    await folders.deleteFolder(folder.id)
    // Nothing to show if the user was browsing the folder that just disappeared.
    if (linksStore.folder === folder.id)
      linksStore.folder = folder.parentId ?? undefined
    toast(t('links.folders.delete_success'))
    open.value = false
  }
  catch (cause) {
    console.error(cause)
    toast.error(getFolderErrorMessage(cause, t))
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {{ $t('links.folders.delete_title', { name: target?.name ?? '' }) }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {{ $t('links.folders.delete_description', {
            links: $t('links.folders.links_count', target?.linkCount ?? 0),
            folders: $t('links.folders.subfolders_count', target?.children.length ?? 0),
          }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="deleting">
          {{ $t('common.cancel') }}
        </AlertDialogCancel>
        <!--
          A plain Button, not AlertDialogAction: the latter closes the dialog from
          its own click handler, tearing this component down before the request
          finishes and losing the pending state. Same reason as links/Delete.vue.
        -->
        <Button
          variant="destructive"
          :disabled="deleting"
          :aria-busy="deleting"
          @click.prevent="confirmDelete"
        >
          <LoaderCircle
            v-if="deleting"
            class="motion-safe:animate-spin"
            aria-hidden="true"
          />
          {{ $t('common.delete') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
