<script setup lang="ts">
import type { DropdownMenuItem, TableColumn, TableRow } from '@nuxt/ui'

const router = useRouter()
const id = computed(() => router.currentRoute.value.params.id as string)
const toast = useToast()
const { data: deployments, error, refresh } = await useFetch(`/api/services/${id.value}/deployments`, { key: `deployments-${id.value}` })

if (error.value) {
  throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.data?.message, fatal: true })
}

type Deployment = NonNullable<typeof deployments.value>[number]

function isActive(status: string) {
  return ['queued', 'building', 'deploying'].includes(status)
}

const expanded = ref<Record<string, boolean>>({})

watch(() => deployments.value?.[0]?.id, () => {
  const newest = deployments.value?.[0]
  if (newest && (isActive(newest.status) || newest.status === 'failed')) {
    expanded.value = { [newest.id]: true }
  }
}, { immediate: true })

const openId = computed(() => Object.keys(expanded.value)[0])
const requestFetch = useRequestFetch()
const { data: details, refresh: refreshDetails } = useAsyncData(
  () => `deployment-${openId.value}`,
  () => openId.value ? requestFetch(`/api/deployments/${openId.value}`) : Promise.resolve(null)
)

function poll(condition: () => boolean, callback: () => unknown) {
  watch(condition, (value, _, onCleanup) => {
    if (!value || import.meta.server) {
      return
    }
    const timer = setInterval(callback, 1000)
    onCleanup(() => clearInterval(timer))
  }, { immediate: true })
}

poll(() => !!deployments.value?.some(deployment => isActive(deployment.status)), () => refresh({ dedupe: 'defer' }))
poll(() => !!details.value && isActive(details.value.status), () => refreshDetails({ dedupe: 'defer' }))

useAutoScroll(useTemplateRef('buildLogs'))
useAutoScroll(useTemplateRef('deployLogs'))

const currentId = computed(() => deployments.value?.find(deployment => deployment.status === 'succeeded')?.id)

function toggle(deploymentId: string) {
  expanded.value = expanded.value[deploymentId] ? {} : { [deploymentId]: true }
}

function getRowId(deployment: Deployment) {
  return deployment.id
}

function onSelect(_: Event, row: TableRow<Deployment>) {
  toggle(row.original.id)
}

async function runAction(deploymentId: string, action: 'redeploy' | 'cancel', failure: string) {
  try {
    await $fetch(`/api/deployments/${deploymentId}/${action}`, { method: 'POST' })
    await refresh()
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? failure, color: 'error' })
  }
}

function actions(deployment: Deployment) {
  const items: DropdownMenuItem[] = []
  if (deployment.imageDigest && !isActive(deployment.status)) {
    items.push({ label: 'Redeploy', icon: 'i-lucide-rotate-ccw', onSelect: () => runAction(deployment.id, 'redeploy', 'Redeploying failed. Try again.') })
  }
  if (['queued', 'building'].includes(deployment.status)) {
    items.push({ label: 'Cancel', icon: 'i-lucide-circle-x', color: 'error', onSelect: () => runAction(deployment.id, 'cancel', 'Cancelling failed. Try again.') })
  }
  return items
}

const columns: TableColumn<Deployment>[] = [
  { id: 'expand', meta: { class: { th: 'w-px', td: 'w-px' } } },
  { id: 'user', header: 'Started by' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'image', header: 'Source' },
  { accessorKey: 'createdAt', header: 'Created' },
  { id: 'duration', header: 'Duration' },
  { id: 'actions', meta: { class: { th: 'w-px', td: 'w-px' } } }
]
</script>

<template>
  <div>
    <UTable
    v-if="deployments?.length"
    v-model:expanded="expanded"
    :data="deployments"
    :columns="columns"
    :get-row-id="getRowId"
    @select="onSelect"
  >
    <template #expand-cell="{ row }">
      <UButton
        icon="i-lucide-chevron-down"
        color="neutral"
        variant="ghost"
        :aria-label="row.getIsExpanded() ? 'Hide details' : 'Show details'"
        :ui="{ leadingIcon: row.getIsExpanded() ? 'rotate-180 transition-transform' : 'transition-transform' }"
        @click="toggle(row.original.id)"
      />
    </template>

    <template #status-cell="{ row }">
      <div class="flex items-center gap-2">
        <UBadge
          v-bind="deploymentStatusBadge(row.original.status)"
          variant="subtle"
        />
        <UBadge
          v-if="row.original.id === currentId"
          label="Current"
          variant="outline"
        />
      </div>
    </template>

    <template #image-cell="{ row }">
      <div
        v-if="row.original.commitSha"
        class="flex max-w-md flex-col"
      >
        <span class="truncate text-highlighted">{{ row.original.commitMessage }}</span>
        <span class="font-mono text-xs">{{ row.original.commitSha.slice(0, 7) }}</span>
      </div>
      <div
        v-else
        class="flex flex-col"
      >
        <span class="text-highlighted">{{ row.original.image }}</span>
        <span
          v-if="row.original.imageDigest"
          class="font-mono text-xs"
        >
          {{ row.original.imageDigest.replace('sha256:', '').slice(0, 12) }}
        </span>
      </div>
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

    <template #duration-cell="{ row }">
      <template v-if="row.original.startedAt && row.original.finishedAt">
        {{ formatDuration(row.original.startedAt, row.original.finishedAt) }}
      </template>
    </template>

    <template #actions-cell="{ row }">
      <div class="flex justify-end">
        <UDropdownMenu
          v-if="actions(row.original).length"
          :items="actions(row.original)"
          :content="{ align: 'end' }"
        >
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            aria-label="Actions"
          />
        </UDropdownMenu>
      </div>
    </template>

    <template #expanded="{ row }">
      <div class="flex flex-col gap-3 whitespace-normal">
        <UAlert
          v-if="row.original.error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-x"
          title="Deployment failed"
          :description="row.original.error"
        />
        <p v-if="details?.id !== row.original.id">
          Loading…
        </p>
        <template v-else>
          <template v-if="details?.buildLogs">
            <p class="font-medium text-highlighted">
              Build
            </p>
            <pre
              ref="buildLogs"
              class="max-h-96 overflow-auto rounded-md bg-elevated p-3 font-mono text-xs text-default whitespace-pre-wrap break-words"
            >{{ details?.buildLogs }}</pre>
          </template>
          <template v-if="details?.logs">
            <p
              v-if="details?.buildLogs"
              class="font-medium text-highlighted"
            >
              Deploy
            </p>
            <pre
              ref="deployLogs"
              class="max-h-96 overflow-auto rounded-md bg-elevated p-3 font-mono text-xs text-default whitespace-pre-wrap break-words"
            >{{ details?.logs }}</pre>
          </template>
          <p v-else-if="!details?.buildLogs">
            No events yet.
          </p>
        </template>
      </div>
    </template>
  </UTable>

  <UEmpty
    v-else
    icon="i-lucide-history"
    title="No deployments yet"
    description="Click Deploy to start the first deployment."
  />
  </div>
</template>
