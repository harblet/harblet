<script setup lang="ts">
const props = defineProps<{
  backup: { id: string, status: string }
}>()

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const { loading, withLoading } = useLoading()

async function onDelete() {
  try {
    await withLoading(() => $fetch(`/api/backups/${props.backup.id}`, { method: 'DELETE' }))
    toast.add({ title: 'Backup deleted', color: 'success' })
    emit('close', true)
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Deleting the backup failed. Try again.', color: 'error' })
  }
}
</script>

<template>
  <UModal
    title="Delete this backup?"
    :description="backup.status === 'succeeded' ? 'Harblet deletes the file from the destination. This can\'t be undone.' : 'Harblet removes the failed backup from the list.'"
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
        label="Delete backup"
        color="error"
        :loading="loading"
        @click="onDelete"
      />
    </template>
  </UModal>
</template>
