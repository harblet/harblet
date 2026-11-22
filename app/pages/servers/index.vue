<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { LazyServersCreationModal, LazyServersDeletionModal } from '#components'

useHead({ title: 'Servers' })

const toast = useToast()
const overlay = useOverlay()
const creationModal = overlay.create(LazyServersCreationModal)
const deletionModal = overlay.create(LazyServersDeletionModal)
const { loading, withLoading } = useLoading()
const { data, error, refresh } = await useFetch('/api/servers')

if (error.value) {
  throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.data?.message ?? 'Loading servers failed.', fatal: true })
}

const servers = ref(data.value)
watch(data, (value) => {
  if (value) {
    servers.value = value
  }
})

type Server = NonNullable<typeof servers.value>[number]

const upgradeErrors = computed(() => [...new Set(servers.value?.flatMap(server => server.upgrade?.error ?? []))])
const unreachableServers = computed(() => servers.value?.filter(server => server.unreachable) ?? [])

onMounted(() => {
  const timer = setInterval(() => refresh({ dedupe: 'defer' }), 5000)
  onBeforeUnmount(() => clearInterval(timer))
})

async function addServer() {
  try {
    const { token } = await withLoading(() => $fetch('/api/servers/join-tokens', { method: 'POST' }))
    creationModal.open({ token })
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Creating the join command failed. Try again.', color: 'error' })
  }
}

async function removeServer(server: Server) {
  if (await deletionModal.open({ server }).result) {
    await refresh()
  }
}

const columns: TableColumn<Server>[] = [
  { accessorKey: 'name', header: 'Server' },
  { accessorKey: 'ready', header: 'Status' },
  { accessorKey: 'address', header: 'Address' },
  { accessorKey: 'cpu', header: 'CPU' },
  { accessorKey: 'memory', header: 'Memory' },
  { accessorKey: 'version', header: 'k3s' },
  { id: 'actions', meta: { class: { th: 'w-px', td: 'w-px' } } }
]
</script>

<template>
  <UDashboardPanel id="servers">
    <template #header>
      <UDashboardNavbar title="Servers">
        <template #right>
          <UButton
            label="Add server"
            icon="i-lucide-plus"
            :loading="loading"
            @click="addServer"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-for="upgradeError in upgradeErrors"
        :key="upgradeError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="The k3s upgrade is stuck"
        :description="upgradeError"
      />

      <UAlert
        v-for="server in unreachableServers"
        :key="server.name"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="`Harblet can't reach ${server.name} on TCP 10250`"
        description="Its CPU and memory usage stays empty until that port is open. The servers must reach each other directly on TCP 6443 and 10250 and UDP 51820, so check this server's firewall."
      />

      <UTable
        :data="servers ?? []"
        :columns="columns"
      >
        <template #name-cell="{ row }">
          <div class="flex items-center gap-2 font-medium text-highlighted">
            {{ row.original.name }}
            <UBadge
              v-if="row.original.first"
              label="First server"
              color="neutral"
              variant="outline"
              size="sm"
            />
          </div>
          <div class="text-muted">
            {{ row.original.os }}
          </div>
        </template>

        <template #ready-cell="{ row }">
          <UBadge
            :label="row.original.ready ? 'Ready' : 'Not ready'"
            :color="row.original.ready ? 'success' : 'error'"
            variant="subtle"
          />
        </template>

        <template #address-cell="{ row }">
          <span class="font-mono">{{ row.original.address }}</span>
        </template>

        <template #cpu-cell="{ row }">
          <template v-if="row.original.cpu.used !== null">
            {{ formatCores(row.original.cpu.used) }} of {{ formatCores(row.original.cpu.total) }} cores
            <UProgress
              :model-value="row.original.cpu.used"
              :max="row.original.cpu.total"
              size="xs"
              class="mt-1 w-32"
            />
          </template>
          <template v-else>
            {{ formatCores(row.original.cpu.total) }} cores
          </template>
        </template>

        <template #memory-cell="{ row }">
          <template v-if="row.original.memory.used !== null">
            {{ formatGigabytes(row.original.memory.used) }} of {{ formatGigabytes(row.original.memory.total) }} GB
            <UProgress
              :model-value="row.original.memory.used"
              :max="row.original.memory.total"
              size="xs"
              class="mt-1 w-32"
            />
          </template>
          <template v-else>
            {{ formatGigabytes(row.original.memory.total) }} GB
          </template>
        </template>

        <template #version-cell="{ row }">
          {{ row.original.version }}
          <div
            v-if="row.original.upgrade"
            class="flex items-center gap-1 text-muted"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="animate-spin"
            />
            Upgrading to {{ row.original.upgrade.version }}
          </div>
        </template>

        <template #actions-cell="{ row }">
          <UButton
            v-if="!row.original.first"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            aria-label="Remove server"
            @click="removeServer(row.original)"
          />
        </template>
      </UTable>
    </template>
  </UDashboardPanel>
</template>
