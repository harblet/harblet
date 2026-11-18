<script setup lang="ts">
const props = defineProps<{
  destination: { id: string, name: string, databaseCount: number }
}>()

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const { loading, withLoading } = useLoading()

const description = computed(() => {
  const { databaseCount } = props.destination
  const databases = databaseCount === 1 ? 'The database that backs up to it stops' : `The ${databaseCount} databases that back up to it stop`
  return `Harblet forgets the destination, its access key and the backups stored there. The files stay in the bucket.${databaseCount ? ` ${databases} backing up.` : ''}`
})

async function onDelete() {
  try {
    await withLoading(() => $fetch(`/api/backup-destinations/${props.destination.id}`, { method: 'DELETE' }))
    toast.add({ title: 'Destination removed', color: 'success' })
    emit('close', true)
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Removing the destination failed. Try again.', color: 'error' })
  }
}
</script>

<template>
  <UModal
    :title="`Remove ${destination.name}?`"
    :description="description"
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
        label="Remove destination"
        color="error"
        :loading="loading"
        @click="onDelete"
      />
    </template>
  </UModal>
</template>
