<script setup lang="ts">
const props = defineProps<{
  project: { id: string, name: string }
}>()

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const { loading, withLoading } = useLoading()

async function onDelete() {
  try {
    await withLoading(async () => {
      await $fetch(`/api/projects/${props.project.id}`, { method: 'DELETE' })
      toast.add({ title: 'Project deleted', color: 'success' })
      await navigateTo('/projects')
    })
    emit('close', true)
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Deleting the project failed. Try again.', color: 'error' })
  }
}
</script>

<template>
  <UModal
    :title="`Delete ${project.name}?`"
    description="The project and all of its services, including their data, are deleted. This can't be undone."
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
        label="Delete project"
        color="error"
        :loading="loading"
        @click="onDelete"
      />
    </template>
  </UModal>
</template>
