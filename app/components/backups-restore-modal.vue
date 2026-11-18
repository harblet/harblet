<script setup lang="ts">
const props = defineProps<{
  backup: { id: string, createdAt: string }
  type: string
}>()

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const { loading, withLoading } = useLoading()

const created = computed(() => new Date(props.backup.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }))

async function onRestore() {
  try {
    await withLoading(() => $fetch(`/api/backups/${props.backup.id}/restore`, { method: 'POST' }))
    emit('close', true)
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Starting the restore failed. Try again.', color: 'error' })
  }
}
</script>

<template>
  <UModal
    :title="`Restore the backup from ${created}?`"
    :description="type === 'postgres' ? 'Harblet loads the backup into a new database and swaps it in, which closes open connections once. Everything written since the backup is lost.' : 'Harblet empties the database and loads the backup. Services that use it see errors until it finishes. Everything written since the backup is lost.'"
    :close="{ onClick: () => emit('close', false) }"
  >
    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        @click="emit('close', false)"
      />
      <UButton
        label="Restore backup"
        color="error"
        :loading="loading"
        @click="onRestore"
      />
    </template>
  </UModal>
</template>
