<script setup lang="ts">
const props = defineProps<{
  certificate: { id: string }
}>()

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const { loading, withLoading } = useLoading()

async function onDelete() {
  try {
    await withLoading(() => $fetch(`/api/certificates/${props.certificate.id}`, { method: 'DELETE' }))
    toast.add({ title: 'Certificate deleted', color: 'success' })
    emit('close', true)
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Deleting the certificate failed. Try again.', color: 'error' })
  }
}
</script>

<template>
  <UModal
    title="Delete certificate?"
    description="This can't be undone."
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
        label="Delete certificate"
        color="error"
        :loading="loading"
        @click="onDelete"
      />
    </template>
  </UModal>
</template>
