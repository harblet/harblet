<script setup lang="ts">
useHead({ title: 'Metrics' })

const range = ref('1h')
const { data: servers, error, refresh } = useLazyFetch('/api/metrics', { key: 'metrics', query: { range }, server: false })

onMounted(() => {
  const timer = setInterval(() => refresh({ dedupe: 'defer' }), 5000)
  onBeforeUnmount(() => clearInterval(timer))
})
</script>

<template>
  <UDashboardPanel id="metrics">
    <template #header>
      <UDashboardNavbar title="Metrics">
        <template #right>
          <UTabs
            v-model="range"
            :items="metricRangeItems"
            :content="false"
            size="xs"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Loading the metrics failed"
        :description="error.data?.message"
      />

      <template
        v-for="server in servers"
        :key="server.name"
      >
        <UPageCard variant="naked">
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
        </UPageCard>

        <div class="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          <MetricsChart
            title="CPU"
            unit="percent"
            :max="100"
            :samples="server.samples"
            :series="[{ key: 'cpu', label: 'CPU', text: server.current ? `${formatPercent(server.current.cpu)} of ${formatCores(server.cores)} cores` : undefined }]"
          />
          <MetricsChart
            title="Memory"
            unit="bytes"
            :max="server.memory"
            :samples="server.samples"
            :series="[{ key: 'memory', label: 'Memory', text: server.current ? `${formatGigabytes(server.current.memory)} of ${formatGigabytes(server.memory)} GB` : undefined }]"
          />
          <MetricsChart
            title="Disk"
            unit="bytes"
            :max="server.current?.diskTotal"
            :samples="server.samples"
            :series="[{ key: 'disk', label: 'Disk', text: server.current ? `${formatGigabytes(server.current.disk)} of ${formatGigabytes(server.current.diskTotal)} GB` : undefined }]"
          />
          <MetricsChart
            title="Network"
            unit="bytes/s"
            :samples="server.samples"
            :series="[
              { key: 'networkIn', label: 'In', text: formatRate(server.current?.networkIn) },
              { key: 'networkOut', label: 'Out', text: formatRate(server.current?.networkOut) }
            ]"
          />
        </div>
      </template>
    </template>
  </UDashboardPanel>
</template>
