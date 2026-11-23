<script setup lang="ts">
import { areaY, defineChart, dot, lineY } from '@tanstack/charts'
import type { ChartPoint } from '@tanstack/charts'
import { crosshair } from '@tanstack/charts/crosshair'
import { decorative } from '@tanstack/charts/mark/decorative'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { scaleOrdinal } from '@tanstack/charts/scales/ordinal'
import { scalePoint } from '@tanstack/charts/scales/point'

type Row = { x: string, category: string, raw?: number }

const props = defineProps<{
  title: string
  samples: ({ time: string } & Record<string, unknown>)[]
  series: { key: string, label: string, text?: string }[]
  unit: 'percent' | 'bytes' | 'bytes/s'
  max?: number
}>()

const minute = 60_000
const hour = 60 * minute
const day = 24 * hour
const tickSteps = [5 * minute, 10 * minute, 15 * minute, 30 * minute, hour, 2 * hour, 3 * hour, 6 * hour, 12 * hour, day, 2 * day, 5 * day, 10 * day]
const colors = ['var(--ui-chart-1)', 'var(--ui-chart-4)']
const units = ['B', 'KB', 'MB', 'GB', 'TB']
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const tooltipFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const secondsFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })

const rows = computed(() => props.samples.flatMap(sample => props.series.map(({ key }): Row => {
  const raw = sample[key]
  return { x: sample.time, category: key, raw: typeof raw === 'number' ? raw : undefined }
})))
const top = computed(() => props.max ?? Math.max(0, ...rows.value.map(row => row.raw ?? 0)))
const hasData = computed(() => rows.value.some(row => row.raw !== undefined))
const exponent = computed(() => props.unit === 'percent' ? 0 : Math.min(Math.floor(Math.log(Math.max(top.value, 1)) / Math.log(1024)), units.length - 1))
const step = computed(() => Date.parse(props.samples[1]!.time) - Date.parse(props.samples[0]!.time))
const span = computed(() => props.samples.length * step.value)

function ticks(width: number) {
  const step = tickSteps.find(step => span.value / step <= (width - 50) / 56) ?? 10 * day
  const period = (time: string) => {
    const date = new Date(time)
    return Math.floor((date.getTime() - date.getTimezoneOffset() * minute) / step)
  }
  return props.samples
    .filter((sample, index, samples) => index > 0 && period(sample.time) !== period(samples[index - 1]!.time))
    .map(sample => sample.time)
}

function format(value: number) {
  return props.unit === 'percent' ? formatPercent(value) : `${formatBytes(value)}${props.unit === 'bytes/s' ? '/s' : ''}`
}

function formatTick(value: number) {
  const number = Number(value.toPrecision(3))
  return props.unit === 'percent' ? `${number}%` : `${number} ${units[exponent.value]}${props.unit === 'bytes/s' ? '/s' : ''}`
}

function sortPoints(points: ChartPoint<Row>[]) {
  return points.toSorted((a, b) => props.series.findIndex(({ key }) => key === a.datum.category) - props.series.findIndex(({ key }) => key === b.datum.category))
}

const definition = computed(() => {
  const divisor = 1024 ** exponent.value
  const keys = props.series.map(({ key }) => key)
  const data = rows.value.map(row => ({ ...row, value: row.raw === undefined ? undefined : row.raw / divisor }))
  const isolated = data.filter((row, i) => row.value !== undefined && data[i - keys.length]?.value === undefined && data[i + keys.length]?.value === undefined)
  const marks = [
    ...keys.map((key, index) => decorative(areaY(data.filter(row => row.category === key), { x: 'x', y1: 0, y2: 'value', z: 'category', color: 'category', fill: `url(#area-${index + 1})`, fillOpacity: 1 }))),
    lineY(data, { x: 'x', y: 'value', z: 'category', color: 'category', strokeWidth: 2 }),
    decorative(dot(isolated, { x: 'x', y: 'value', color: 'category', r: 2 })),
    crosshair({ x: true, y: false })
  ]
  return defineChart(({ width }) => ({
    marks,
    scales: {
      x: {
        scale: () => scalePoint().padding(0),
        axis: { ticks: { values: ticks(width), format: (value: string) => (span.value > day ? dayFormat : timeFormat).format(new Date(value)) } }
      },
      y: {
        scale: scaleLinear().domain([0, top.value / divisor || 1]),
        nice: true,
        grid: true,
        axis: { ticks: { count: 4, format: formatTick } }
      }
    },
    color: {
      scale: scaleOrdinal().domain(keys).range(keys.map((_, index) => `var(--ts-chart-${index + 1})`))
    },
    gradients: keys.map((_, index) => ({
      id: `area-${index + 1}`,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 1,
      stops: [
        { offset: 0, color: `var(--ts-chart-${index + 1})`, opacity: 0.4 },
        { offset: 1, color: `var(--ts-chart-${index + 1})`, opacity: 0.05 }
      ]
    }))
  }), { focus: 'group-x', maxFocusDistance: Number.POSITIVE_INFINITY })
})
</script>

<template>
  <UPageCard
    variant="subtle"
    :title="title"
    :ui="{ footer: 'w-full' }"
  >
    <template #description>
      <div class="flex flex-wrap gap-x-4 gap-y-1">
        <span
          v-for="(item, index) in series"
          :key="item.key"
          class="flex items-center gap-1.5"
        >
          <template v-if="series.length > 1">
            <span
              class="size-2 shrink-0 rounded-full"
              :style="{ backgroundColor: colors[index] }"
            />
            {{ item.label }}
          </template>
          <span class="text-highlighted">{{ item.text ?? '–' }}</span>
        </span>
      </div>
    </template>

    <template #footer>
      <UChart
        v-if="hasData"
        :definition="definition"
        :colors="colors"
        :height="160"
        :aria-label="title"
      >
        <template #tooltip="{ points }">
          <p class="font-medium text-highlighted">
            {{ (step < minute ? secondsFormat : tooltipFormat).format(new Date(points[0]!.datum.x)) }}
          </p>
          <div
            v-for="point in sortPoints(points)"
            :key="point.datum.category"
            class="flex items-center gap-1.5 text-muted"
          >
            <span
              class="size-2 shrink-0 rounded-full"
              :style="{ backgroundColor: point.color }"
            />
            <span>{{ series.find(({ key }) => key === point.datum.category)?.label }}</span>
            <span class="ms-auto ps-4 font-medium text-highlighted tabular-nums">{{ format(point.datum.raw!) }}</span>
          </div>
        </template>
      </UChart>

      <p
        v-else
        class="flex h-40 items-center justify-center text-sm text-muted"
      >
        No data in this range.
      </p>
    </template>
  </UPageCard>
</template>
