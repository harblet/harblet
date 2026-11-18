<script setup lang="ts">
import type { SelectMenuItem } from '@nuxt/ui'

const repository = defineModel<string>('repository', { required: true })
const gitConnectionId = defineModel<string | null | undefined>('gitConnectionId', { required: true })
const branch = defineModel<string>('branch', { required: true })

type Repository = { label: string, icon: string, url: string, defaultBranch?: string, connectionId: string }

const { data: connections, status } = useFetch('/api/repositories', { key: 'repositories', lazy: true, server: false })
const manual = ref(!!repository.value && !gitConnectionId.value)

const loading = computed(() => status.value === 'idle' || status.value === 'pending')
const connected = computed(() => !!connections.value?.length)
const picking = computed(() => !manual.value && (loading.value || connected.value))

const items = computed<SelectMenuItem[][]>(() => connections.value?.map(connection => [
  { type: 'label', label: `${connection.provider === 'gitlab' ? 'GitLab' : 'GitHub'} · ${connection.owner}` },
  ...connection.error ? [{ label: connection.error, icon: 'i-lucide-triangle-alert', disabled: true }] : [],
  ...connection.repositories.map((item): Repository => ({
    label: item.fullName,
    icon: item.private ? 'i-lucide-lock' : 'i-lucide-book-marked',
    url: item.url,
    defaultBranch: item.defaultBranch,
    connectionId: connection.id
  }))
]) ?? [])

const selected = computed(() => items.value.flat().find(item => typeof item === 'object' && item.connectionId === gitConnectionId.value && item.url === repository.value))

const help = computed(() => {
  if (picking.value) {
    return 'Private and public repositories that the Git connections can read.'
  }
  return connected.value
    ? 'The repository\'s https:// URL. Harblet clones it without credentials, so it has to be public.'
    : 'The repository\'s https:// URL. To deploy private repositories, an admin connects GitHub or GitLab in Settings → Git.'
})

function select(item: Repository) {
  repository.value = item.url
  gitConnectionId.value = item.connectionId
  branch.value = item.defaultBranch ?? branch.value
}

function toggle() {
  manual.value = !manual.value
  gitConnectionId.value = null
  if (!manual.value) {
    repository.value = ''
  }
}
</script>

<template>
  <UFormField
    label="Repository"
    name="repository"
    :help="help"
  >
    <template
      v-if="connected"
      #hint
    >
      <UButton
        :label="picking ? 'Use a public URL' : 'Choose a repository'"
        color="neutral"
        variant="link"
        size="xs"
        class="p-0"
        @click="toggle"
      />
    </template>

    <USelectMenu
      v-if="picking"
      :model-value="selected"
      :items="items"
      :loading="loading"
      :placeholder="repository ? repository.replace('https://', '') : 'Choose a repository'"
      class="w-full"
      @update:model-value="select($event as Repository)"
    />
    <UInput
      v-else
      v-model="repository"
      placeholder="https://github.com/owner/repository"
      class="w-full"
      :ui="{ base: 'font-mono' }"
    />
  </UFormField>
</template>
