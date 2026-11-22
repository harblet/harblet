<script setup lang="ts">
const router = useRouter()
const id = computed(() => router.currentRoute.value.params.id as string)
const range = ref('1h')
const { data: metrics, error, refresh } = useLazyFetch(`/api/services/${id.value}/metrics`, { key: `metrics-${id.value}`, query: { range }, server: false })

onMounted(() => {
  const timer = setInterval(() => refresh({ dedupe: 'defer' }), 60_000)
  onBeforeUnmount(() => clearInterval(timer))
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <UTabs
      v-model="range"
      :items="metricRangeItems"
      :content="false"
      size="xs"
      class="self-end"
    />

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Loading the metrics failed"
      :description="error.data?.message"
    />

    <div
      v-else-if="metrics"
      class="grid gap-4 lg:grid-cols-3"
    >
      <MetricsChart
        title="CPU"
        unit="percent"
        :samples="metrics.samples"
        :series="[{ key: 'cpu', label: 'CPU', text: metrics.current ? `${formatPercent(metrics.current.cpu)} of ${formatCores(metrics.current.cores)} cores` : undefined }]"
      />
      <MetricsChart
        title="Memory"
        unit="bytes"
        :samples="metrics.samples"
        :series="[{ key: 'memory', label: 'Memory', text: metrics.current ? formatBytes(metrics.current.memory) : undefined }]"
      />
      <MetricsChart
        title="Network"
        unit="bytes/s"
        :samples="metrics.samples"
        :series="[
          { key: 'networkIn', label: 'In', text: formatRate(metrics.current?.networkIn) },
          { key: 'networkOut', label: 'Out', text: formatRate(metrics.current?.networkOut) }
        ]"
      />
    </div>
  </div>
</template>
