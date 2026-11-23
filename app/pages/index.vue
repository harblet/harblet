<script setup lang="ts">
import type { TableColumn, TableRow } from '@nuxt/ui'
import { LazyProjectsCreationModal } from '#components'

useHead({ title: 'Overview' })

const { user } = useUserSession()
const isAdmin = user.value?.role === 'admin'
const overlay = useOverlay()
const creationModal = overlay.create(LazyProjectsCreationModal)
const { data: overview, error, refresh } = await useFetch('/api/overview')

if (error.value) {
  throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.data?.message ?? 'Loading the overview failed.', fatal: true })
}

const { data: servers, error: serversError, refresh: refreshServers } = useLazyFetch('/api/servers', { key: 'overview-servers', server: false, immediate: isAdmin })

type Deployment = NonNullable<typeof overview.value>['deployments'][number]
type Server = NonNullable<typeof servers.value>[number]

onMounted(() => {
  const timer = setInterval(() => {
    refresh({ dedupe: 'defer' })
    if (isAdmin) {
      refreshServers({ dedupe: 'defer' })
    }
  }, 5000)
  onBeforeUnmount(() => clearInterval(timer))
})

function deploymentsPath(service: { id: string, project: { id: string } }) {
  return `/projects/${service.project.id}/services/${service.id}/deployments`
}

function onSelect(_: Event, row: TableRow<Deployment>) {
  return navigateTo(deploymentsPath(row.original.service))
}

function usage(server: Server) {
  const cpu = `${formatCores(server.cpu.total)} cores`
  const memory = `${formatGigabytes(server.memory.total)} GB`
  return [
    { label: 'CPU', ...server.cpu, text: server.cpu.used !== null ? `${formatCores(server.cpu.used)} of ${cpu}` : cpu },
    { label: 'Memory', ...server.memory, text: server.memory.used !== null ? `${formatGigabytes(server.memory.used)} of ${memory}` : memory }
  ]
}

const columns: TableColumn<Deployment>[] = [
  { id: 'service', header: 'Service' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'image', header: 'Source' },
  { id: 'user', header: 'Started by' },
  { accessorKey: 'createdAt', header: 'Created' }
]
</script>

<template>
  <UDashboardPanel id="overview">
    <template #header>
      <UDashboardNavbar title="Overview" />
    </template>

    <template #body>
      <UEmpty
        v-if="!overview?.hasProjects"
        icon="i-lucide-boxes"
        title="No projects yet"
        description="Create a project to start deploying services."
        :actions="[{ label: 'New project', icon: 'i-lucide-plus', onClick: () => creationModal.open() }]"
      />

      <template v-else>
        <UAlert
          v-for="service in overview.failed"
          :key="service.id"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="`${service.name} in ${service.project.name} failed to deploy`"
          :actions="[{ label: 'Show deployment', to: deploymentsPath(service) }]"
        >
          <template #description>
            <NuxtTime
              v-if="service.deployment.finishedAt"
              :datetime="service.deployment.finishedAt"
              locale="en-US"
              date-style="medium"
              time-style="short"
            />: {{ service.deployment.error }}
          </template>
        </UAlert>

        <UPageCard
          title="Recent deployments"
          variant="naked"
        />

        <UTable
          v-if="overview.deployments.length"
          :data="overview.deployments"
          :columns="columns"
          @select="onSelect"
        >
          <template #service-cell="{ row }">
            <div class="font-medium text-highlighted">
              {{ row.original.service.name }}
            </div>
            <div class="text-muted">
              {{ row.original.service.project.name }}
            </div>
          </template>

          <template #status-cell="{ row }">
            <UBadge
              v-bind="deploymentStatusBadge(row.original.status)"
              variant="subtle"
            />
          </template>

          <template #image-cell="{ row }">
            <div
              v-if="row.original.commitSha"
              class="flex max-w-md flex-col"
            >
              <span class="truncate text-highlighted">{{ row.original.commitMessage }}</span>
              <span class="font-mono text-xs">{{ row.original.commitSha.slice(0, 7) }}</span>
            </div>
            <span
              v-else
              class="text-highlighted"
            >
              {{ row.original.image }}
            </span>
          </template>

          <template #user-cell="{ row }">
            <UUser
              v-if="row.original.user"
              :name="row.original.user.name"
              :avatar="{ src: row.original.user.image ?? undefined, alt: row.original.user.name }"
              size="sm"
            />
            <UUser
              v-else-if="row.original.trigger !== 'user'"
              v-bind="deploymentTriggerUser(row.original.trigger)"
              size="sm"
            />
          </template>

          <template #createdAt-cell="{ row }">
            <NuxtTime
              :datetime="row.original.createdAt"
              locale="en-US"
              date-style="medium"
              time-style="short"
            />
          </template>
        </UTable>

        <p
          v-else
          class="text-sm text-muted"
        >
          No deployments yet.
        </p>
      </template>

      <template v-if="servers || serversError">
        <UPageCard
          title="Servers"
          variant="naked"
        />

        <UAlert
          v-if="serversError"
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          title="Loading the servers failed"
          :description="serversError.data?.message"
        />

        <UPageGrid v-else>
          <UPageCard
            v-for="server in servers"
            :key="server.name"
            variant="subtle"
            to="/servers"
            :ui="{ footer: 'flex w-full flex-col gap-3 text-sm' }"
          >
            <template #title>
              <div class="flex items-center gap-2">
                {{ server.name }}
                <UBadge
                  :label="server.ready ? 'Ready' : 'Not ready'"
                  :color="server.ready ? 'success' : 'error'"
                  variant="subtle"
                />
              </div>
            </template>

            <template #footer>
              <div
                v-for="metric in usage(server)"
                :key="metric.label"
              >
                <div class="flex justify-between gap-2">
                  <span class="text-muted">{{ metric.label }}</span>
                  <span>{{ metric.text }}</span>
                </div>
                <UProgress
                  v-if="metric.used !== null"
                  :model-value="metric.used"
                  :max="metric.total"
                  size="xs"
                  class="mt-1"
                />
              </div>
            </template>
          </UPageCard>
        </UPageGrid>
      </template>
    </template>
  </UDashboardPanel>
</template>
