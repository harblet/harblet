<script setup lang="ts">
const props = defineProps<{
  server: { name: string }
}>()

const emit = defineEmits<{ close: [boolean] }>()

const command = 'sudo /usr/local/bin/k3s-agent-uninstall.sh'
const toast = useToast()
const removed = ref(false)
const { loading, withLoading } = useLoading()

async function onRemove() {
  try {
    await withLoading(() => $fetch(`/api/servers/${props.server.name}`, { method: 'DELETE' }))
    removed.value = true
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Removing the server failed. Try again.', color: 'error' })
  }
}

async function copyCommand() {
  try {
    await navigator.clipboard.writeText(command)
    toast.add({ title: 'Copied', color: 'success' })
  } catch {
    toast.add({ title: 'Copying failed. Copy it by hand.', color: 'error' })
  }
}
</script>

<template>
  <UModal
    :title="removed ? 'Server removed' : `Remove ${server.name}?`"
    :description="removed ? 'Run this command on the server to uninstall what Harblet installed.' : 'Its services restart on the other servers. Join commands that are still valid stop working.'"
    :close="{ onClick: () => emit('close', removed) }"
  >
    <template
      v-if="removed"
      #body
    >
      <UInput
        :model-value="command"
        readonly
        aria-label="Uninstall command"
        class="w-full"
        :ui="{ base: 'font-mono text-xs', trailing: 'pe-1' }"
      >
        <template #trailing>
          <UButton
            icon="i-lucide-copy"
            color="neutral"
            variant="link"
            size="sm"
            aria-label="Copy command"
            @click="copyCommand"
          />
        </template>
      </UInput>
    </template>

    <template #footer>
      <UButton
        v-if="removed"
        label="Done"
        @click="emit('close', true)"
      />
      <template v-else>
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="emit('close', false)"
        />
        <UButton
          label="Remove server"
          color="error"
          :loading="loading"
          @click="onRemove"
        />
      </template>
    </template>
  </UModal>
</template>
