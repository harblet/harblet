<script setup lang="ts">
const props = defineProps<{
  token: string
}>()

const emit = defineEmits<{ close: [] }>()

const { copy } = useCopy()
const { siteUrl } = useRuntimeConfig().public
const command = `curl -fsSL ${new URL(`/api/join-scripts/${props.token}`, siteUrl).href} | sudo sh`
</script>

<template>
  <UModal
    title="Add server"
    description="Run this command on a fresh Ubuntu server. The server joins within seconds and Harblet starts placing services on it."
    :close="{ onClick: () => emit('close') }"
  >
    <template #body>
      <UInput
        :model-value="command"
        readonly
        aria-label="Join command"
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
            @click="copy(command)"
          />
        </template>
      </UInput>
      <p class="mt-3 text-sm text-muted">
        The command works for 24 hours. The servers must reach each other directly on TCP 6443 and UDP 51820.
      </p>
    </template>

    <template #footer>
      <UButton
        label="Done"
        @click="emit('close')"
      />
    </template>
  </UModal>
</template>
