<script setup lang="ts">
const props = defineProps<{
  domain: { id: string }
}>()

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const { loading, withLoading } = useLoading()

async function onRemove() {
  try {
    await withLoading(() => $fetch(`/api/domains/${props.domain.id}`, { method: 'DELETE' }))
    toast.add({ title: 'Domain removed', color: 'success' })
    emit('close', true)
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Removing the domain failed. Try again.', color: 'error' })
  }
}
</script>

<template>
  <UModal
    title="Remove domain?"
    description="The domain stops pointing at this service right away."
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
        label="Remove domain"
        color="error"
        :loading="loading"
        @click="onRemove"
      />
    </template>
  </UModal>
</template>
