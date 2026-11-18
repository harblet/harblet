<script setup lang="ts">
const props = defineProps<{
  connection: { id: string, name: string, owner: string, serviceCount: number } & ({ provider: 'github', appUrl: string } | { provider: 'gitlab' })
}>()

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const { loading, withLoading } = useLoading()

const description = computed(() => {
  const { provider, owner, serviceCount } = props.connection
  const services = serviceCount === 1 ? 'The service that uses it clones' : `The ${serviceCount} services that use it clone`
  return `${provider === 'gitlab' ? 'Harblet forgets the token.' : `Harblet uninstalls the app from ${owner} and forgets it.`}${serviceCount ? ` ${services} without credentials from then on, so builds of private repositories fail.` : ''}`
})

async function onDelete() {
  try {
    await withLoading(() => $fetch(`/api/git-connections/${props.connection.id}`, { method: 'DELETE' }))
    toast.add({ title: 'Connection removed', color: 'success' })
    emit('close', true)
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Removing the connection failed. Try again.', color: 'error' })
  }
}
</script>

<template>
  <UModal
    :title="`Remove ${connection.name}?`"
    :description="description"
    :close="{ onClick: () => emit('close', false) }"
  >
    <template #body>
      <p
        v-if="connection.provider === 'gitlab'"
        class="text-sm text-muted"
      >
        The token stays valid on GitLab. Revoke it there if nothing else uses it.
      </p>
      <p
        v-else
        class="text-sm text-muted"
      >
        The app itself stays on GitHub. Delete it there under
        <ULink
          :to="`${connection.appUrl}/advanced`"
          target="_blank"
          class="text-primary"
        >Advanced</ULink>.
      </p>
    </template>

    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        @click="emit('close', false)"
      />
      <UButton
        label="Remove connection"
        color="error"
        :loading="loading"
        @click="onDelete"
      />
    </template>
  </UModal>
</template>
