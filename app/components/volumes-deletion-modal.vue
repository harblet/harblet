<script setup lang="ts">
const props = defineProps<{
  volume: { id: string, mountPath: string }
}>()

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const { loading, withLoading } = useLoading()

async function onRemove() {
  try {
    await withLoading(() => $fetch(`/api/volumes/${props.volume.id}`, { method: 'DELETE' }))
    toast.add({ title: 'Volume removed', description: 'Deploy the service to apply it.', color: 'success' })
    emit('close', true)
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Removing the volume failed. Try again.', color: 'error' })
  }
}
</script>

<template>
  <UModal
    :title="`Remove the volume at ${volume.mountPath}?`"
    description="Its files are deleted once the next deployment has succeeded. This can't be undone."
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
        label="Remove volume"
        color="error"
        :loading="loading"
        @click="onRemove"
      />
    </template>
  </UModal>
</template>
