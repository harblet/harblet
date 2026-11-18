<script setup lang="ts">
import { isDatabase } from '#shared/schemas/service'

const props = defineProps<{
  service: { id: string, projectId: string, name: string, type: string }
}>()

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const { loading, withLoading } = useLoading()

async function onDelete() {
  try {
    await withLoading(async () => {
      await $fetch(`/api/services/${props.service.id}`, { method: 'DELETE' })
      toast.add({ title: 'Service deleted', color: 'success' })
      await navigateTo(`/projects/${props.service.projectId}`)
    })
    emit('close', true)
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Deleting the service failed. Try again.', color: 'error' })
  }
}
</script>

<template>
  <UModal
    :title="`Delete ${service.name}?`"
    :description="isDatabase(service.type) ? 'The database with all its data and its deployments is deleted. This can\'t be undone. Backups stay at their destination, but Harblet no longer lists them.' : 'The service, its domains, environment variables and deployments are deleted. This can\'t be undone.'"
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
        label="Delete service"
        color="error"
        :loading="loading"
        @click="onDelete"
      />
    </template>
  </UModal>
</template>
