<script setup lang="ts">
import type { BadgeProps } from '@nuxt/ui'
import type { LogInstance } from '#shared/types/logs'

interface Segment {
  key: number
  instance: LogInstance
  lines: { key: number, time: string, text: string }[]
  lastTimestamp?: string
}

const maxLines = 5000
const startingReasons = ['ContainerCreating', 'PodInitializing']
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })

const router = useRouter()
const id = computed(() => router.currentRoute.value.params.id as string)

const instance = ref<LogInstance | null>()
const instances = ref<LogInstance[]>([])
const selected = ref<string>()
const connectionError = ref<'reconnecting' | 'failed' | 'unavailable'>()
const segments = ref<Segment[]>([])
const filter = ref('')
const viewer = useTemplateRef('viewer')
const { pinned, scrollToBottom } = useAutoScroll(viewer)
let nextKey = 0

watch(id, () => {
  instances.value = []
  selected.value = undefined
})

watch([id, selected], ([serviceId, pod], _, onCleanup) => {
  if (import.meta.server) {
    return
  }
  instance.value = undefined
  connectionError.value = undefined
  segments.value = []

  const source = new EventSource(`/api/services/${serviceId}/logs${pod ? `?${new URLSearchParams({ instance: pod })}` : ''}`)
  source.addEventListener('error', () => {
    if (source.readyState === EventSource.CLOSED) {
      connectionError.value = 'failed'
    } else if (!connectionError.value && instance.value?.state === 'running') {
      connectionError.value = 'reconnecting'
    }
  })
  source.addEventListener('failure', () => {
    connectionError.value = 'unavailable'
  })
  source.addEventListener('instances', (event) => {
    instances.value = JSON.parse(event.data)
  })
  source.addEventListener('instance', (event) => {
    connectionError.value = undefined
    const next = JSON.parse(event.data) as LogInstance | null
    instance.value = next
    if (!next) {
      return
    }
    const last = segments.value.at(-1)
    if (last && (last.instance.id === next.id || !last.lines.length)) {
      last.instance = next
    } else {
      segments.value.push({ key: nextKey++, instance: next, lines: [] })
    }
  })
  source.addEventListener('message', (event) => {
    const segment = segments.value.at(-1)
    const line = JSON.parse(event.data) as string
    const space = line.indexOf(' ')
    const timestamp = line.slice(0, space)
    if (!segment || (segment.lastTimestamp && timestamp <= segment.lastTimestamp)) {
      return
    }
    segment.lines.push({
      key: nextKey++,
      time: timeFormat.format(new Date(timestamp)),
      text: line.slice(space + 1)
    })
    segment.lastTimestamp = timestamp
    trim()
  })
  onCleanup(() => source.close())
}, { immediate: true })

function trim() {
  let excess = segments.value.reduce((sum, segment) => sum + segment.lines.length, 0) - maxLines
  while (excess > 0) {
    const first = segments.value[0]!
    excess -= first.lines.splice(0, excess).length
    if (!first.lines.length) {
      segments.value.shift()
    }
  }
}

const visible = computed(() => {
  const query = filter.value.trim().toLowerCase()
  return segments.value.map((segment, index) => ({
    ...segment,
    divider: index ? (segment.instance.pod === segments.value[index - 1]!.instance.pod ? 'Restarted' : 'New instance') : undefined,
    lines: query ? segment.lines.filter(line => line.text.toLowerCase().includes(query)) : segment.lines
  }))
})

const lineCount = computed(() => segments.value.reduce((sum, segment) => sum + segment.lines.length, 0))
const visibleCount = computed(() => visible.value.reduce((sum, segment) => sum + segment.lines.length, 0))

const badge = computed<BadgeProps | undefined>(() => {
  if (connectionError.value === 'failed') {
    return { label: 'Disconnected', color: 'error' }
  }
  if (connectionError.value === 'unavailable') {
    return { label: 'Logs unavailable', color: 'error' }
  }
  if (connectionError.value === 'reconnecting') {
    return { label: 'Reconnecting', color: 'warning', icon: 'i-lucide-loader-circle', ui: { leadingIcon: 'animate-spin' } }
  }
  return instance.value ? instanceBadge(instance.value) : undefined
})

function instanceBadge({ state, reason, previous }: LogInstance): BadgeProps {
  if (state === 'running') {
    return { label: 'Running', color: 'success' }
  }
  if (state === 'terminated' || previous) {
    return { label: 'Crashed', color: 'error' }
  }
  if (reason && !startingReasons.includes(reason)) {
    return { label: reason, color: 'error' }
  }
  return { label: 'Starting', color: 'info', icon: 'i-lucide-loader-circle', ui: { leadingIcon: 'animate-spin' } }
}

const instanceItems = computed(() => instances.value.map(item => ({
  label: `${item.server ?? 'Waiting for a server'} · ${item.pod.slice(item.pod.lastIndexOf('-') + 1)}`,
  value: item.pod,
  chip: { color: instanceBadge(item).color }
})))
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <div class="flex items-center gap-3">
      <UInput
        v-model="filter"
        icon="i-lucide-search"
        placeholder="Filter logs"
        class="w-full max-w-xs"
      />
      <USelect
        v-if="instances.length > 1"
        :model-value="instance?.pod ?? selected"
        :items="instanceItems"
        aria-label="Instance"
        class="w-64"
        @update:model-value="selected = $event"
      />
      <UBadge
        v-if="badge"
        v-bind="badge"
        variant="subtle"
      />
      <span
        v-if="instance?.restarts"
        class="text-sm text-muted"
      >
        {{ instance.restarts }} {{ instance.restarts === 1 ? 'restart' : 'restarts' }}
      </span>
    </div>

    <UEmpty
      v-if="instance === null"
      icon="i-lucide-logs"
      title="No running instance"
      description="Deploy the service to see its logs."
    />

    <div
      v-else
      class="relative min-h-64 flex-1"
    >
      <div
        ref="viewer"
        class="absolute inset-0 overflow-auto rounded-md bg-elevated p-3 font-mono text-xs"
      >
        <p
          v-if="!instance && connectionError === 'failed'"
          class="text-error"
        >
          Could not connect to the log stream. Reload the page to try again.
        </p>
        <p
          v-else-if="!lineCount && connectionError === 'unavailable'"
          class="text-error"
        >
          Could not read the logs from the cluster. Retrying…
        </p>
        <p
          v-else-if="!instance"
          class="text-muted"
        >
          Connecting…
        </p>
        <p
          v-else-if="!lineCount"
          class="text-muted"
        >
          {{ instance.state === 'waiting' && !instance.previous ? 'Waiting for the container to start…' : 'No output yet.' }}
        </p>
        <p
          v-else-if="!visibleCount"
          class="text-muted"
        >
          No lines match.
        </p>

        <template
          v-for="segment in visible"
          :key="segment.key"
        >
          <USeparator
            v-if="segment.divider"
            :label="segment.divider"
            :ui="{ border: 'border-accented' }"
            class="my-3"
          />
          <p
            v-if="segment.instance.previous && segment.lines.length"
            class="mb-2 text-muted"
          >
            Output of the last crashed run
          </p>
          <div
            v-for="line in segment.lines"
            :key="line.key"
            class="flex gap-3"
          >
            <span class="shrink-0 text-muted">{{ line.time }}</span>
            <span class="min-w-0 whitespace-pre-wrap break-words text-default">{{ line.text }}</span>
          </div>
        </template>
      </div>

      <UButton
        v-if="!pinned"
        label="Jump to latest"
        icon="i-lucide-arrow-down"
        size="sm"
        class="absolute right-3 bottom-3"
        @click="scrollToBottom"
      />
    </div>
  </div>
</template>
