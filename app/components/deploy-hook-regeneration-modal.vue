<script setup lang="ts">
const props = defineProps<{
  service: { id: string }
}>()

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const { loading, withLoading } = useLoading()

async function onRegenerate() {
  try {
    await withLoading(() => $fetch(`/api/services/${props.service.id}/deploy-hook`, { method: 'POST' }))
    toast.add({ title: 'Deploy hook regenerated', color: 'success' })
    emit('close', true)
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Regenerating the deploy hook failed. Try again.', color: 'error' })
  }
}
</script>

<template>
  <UModal
    title="Regenerate deploy hook?"
    description="The current URL stops working right away. Pipelines that call it need the new URL."
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
        label="Regenerate"
        color="error"
        :loading="loading"
        @click="onRegenerate"
      />
    </template>
  </UModal>
</template>
