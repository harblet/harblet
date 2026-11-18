<script setup lang="ts">
const props = defineProps<{
  member: { id: string, name: string }
}>()

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const { loading, withLoading } = useLoading()

async function onRemove() {
  try {
    await withLoading(() => $fetch(`/api/members/${props.member.id}`, { method: 'DELETE' }))
    toast.add({ title: 'Member removed', color: 'success' })
    emit('close', true)
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Removing the member failed. Try again.', color: 'error' })
  }
}
</script>

<template>
  <UModal
    :title="`Remove ${member.name}?`"
    description="They're signed out and lose access right away. Invitations they sent are cancelled. Their deployments stay."
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
        label="Remove member"
        color="error"
        :loading="loading"
        @click="onRemove"
      />
    </template>
  </UModal>
</template>
