<script setup lang="ts">
import { databaseEngines, databaseUrl, isDatabase } from '#shared/schemas/service'

const router = useRouter()
const id = computed(() => router.currentRoute.value.params.id as string)
const { copy } = useCopy()
const { data: service } = await useFetch(`/api/services/${id.value}`, { key: `service-${id.value}` })

const shown = ref<Record<string, boolean>>({})

const fields = computed<{ label: string, value: string, masked?: string }[] | undefined>(() => {
  const value = service.value
  if (!value) {
    return
  }
  if (!isDatabase(value.type)) {
    return value.deployedPort ? [{ label: 'Internal address', value: `${value.hostname}:${value.deployedPort}` }] : undefined
  }
  const type = value.type
  const { port } = databaseEngines[type]
  const url = (password: string) => databaseUrl(type, value, password)
  const masked = '••••••••••••'
  return [
    { label: 'Host', value: value.hostname },
    { label: 'Port', value: String(port) },
    { label: 'Database', value: value.databaseName! },
    { label: 'Username', value: value.databaseUser! },
    { label: 'Password', value: value.databasePassword!, masked },
    { label: 'Connection URL', value: url(value.databasePassword!), masked: url(masked) }
  ]
})
</script>

<template>
  <div
    v-if="fields"
    class="mx-auto flex w-full flex-col gap-4 lg:max-w-3xl"
  >
    <UPageCard
      title="Connection"
      :description="service && isDatabase(service.type) ? 'Services in this project connect with these details. Other projects and the internet can\'t reach the database.' : 'Services in this project connect to this address. Other projects can\'t reach it, and the internet only through the service\'s domains.'"
      variant="naked"
    />

    <UPageCard variant="subtle">
      <UFormField
        v-for="field in fields"
        :key="field.label"
        :label="field.label"
      >
        <UInput
          :model-value="shown[field.label] || !field.masked ? field.value : field.masked"
          readonly
          class="w-full"
          :ui="{ base: 'font-mono', trailing: 'pe-1' }"
        >
          <template #trailing>
            <UButton
              v-if="field.masked"
              :icon="shown[field.label] ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              color="neutral"
              variant="link"
              size="sm"
              :aria-label="shown[field.label] ? `Hide ${field.label}` : `Show ${field.label}`"
              @click="shown[field.label] = !shown[field.label]"
            />
            <UButton
              icon="i-lucide-copy"
              color="neutral"
              variant="link"
              size="sm"
              :aria-label="`Copy ${field.label}`"
              @click="copy(field.value)"
            />
          </template>
        </UInput>
      </UFormField>
    </UPageCard>
  </div>
  <div v-else />
</template>
