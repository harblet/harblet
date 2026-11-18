<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { isDatabase } from '#shared/schemas/service'
import { LazyDatabasesCreationModal, LazyRepositoriesCreationModal, LazyServicesCreationModal, LazyTemplatesInstallationModal } from '#components'

const router = useRouter()
const id = computed(() => router.currentRoute.value.params.id as string)
const overlay = useOverlay()
const creationModal = overlay.create(LazyServicesCreationModal)
const repositoryCreationModal = overlay.create(LazyRepositoriesCreationModal)
const databaseCreationModal = overlay.create(LazyDatabasesCreationModal)
const templateInstallationModal = overlay.create(LazyTemplatesInstallationModal)
const { data: services, refresh } = await useFetch(`/api/projects/${id.value}/services`, { key: `services-${id.value}` })

const deploying = computed(() => services.value?.some(service => ['queued', 'building', 'deploying'].includes(service.deployments[0]?.status ?? '')))

watch(deploying, (value, _, onCleanup) => {
  if (!value || import.meta.server) {
    return
  }
  const timer = setInterval(() => refresh({ dedupe: 'defer' }), 1000)
  onCleanup(() => clearInterval(timer))
}, { immediate: true })

async function createService() {
  if (await creationModal.open({ projectId: id.value }).result) {
    await refresh()
  }
}

async function createRepository() {
  if (await repositoryCreationModal.open({ projectId: id.value }).result) {
    await refresh()
  }
}

async function createDatabase() {
  if (await databaseCreationModal.open({ projectId: id.value }).result) {
    await refresh()
  }
}

async function installTemplate() {
  if (await templateInstallationModal.open({ projectId: id.value }).result) {
    await refresh()
  }
}

const items: DropdownMenuItem[] = [
  { label: 'Git repository', icon: 'i-lucide-git-branch', onSelect: createRepository },
  { label: 'Docker image', icon: 'i-lucide-container', onSelect: createService },
  { label: 'Database', icon: 'i-lucide-database', onSelect: createDatabase },
  { label: 'Template', icon: 'i-lucide-layout-template', onSelect: installTemplate }
]

function serviceIcon(type: string) {
  return isDatabase(type) ? 'i-lucide-database' : type === 'git' ? 'i-lucide-git-branch' : 'i-lucide-container'
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex justify-end">
      <UDropdownMenu
        :items="items"
        :content="{ align: 'end' }"
      >
        <UButton
          label="New service"
          icon="i-lucide-plus"
        />
      </UDropdownMenu>
    </div>

    <UPageGrid v-if="services?.length">
      <UPageCard
        v-for="service in services"
        :key="service.id"
        :title="service.name"
        :description="(service.repository?.replace('https://', '') ?? service.image) ?? undefined"
        :icon="serviceIcon(service.type)"
        :to="`/projects/${id}/services/${service.id}`"
      >
        <template #footer>
          <UBadge
            v-bind="deploymentStatusBadge(service.deployments[0]?.status)"
            variant="subtle"
          />
        </template>
      </UPageCard>
    </UPageGrid>

    <UEmpty
      v-else
      icon="i-lucide-layers"
      title="No services yet"
      description="Add a service to deploy a Git repository or a Docker image, create a database, or install a template."
    >
      <template #actions>
        <UDropdownMenu :items="items">
          <UButton
            label="New service"
            icon="i-lucide-plus"
          />
        </UDropdownMenu>
      </template>
    </UEmpty>
  </div>
</template>
