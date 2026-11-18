<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { LazyBackupDestinationsCreationModal, LazyBackupDestinationsDeletionModal } from '#components'

useHead({ title: 'Backup destinations' })

const overlay = useOverlay()
const creationModal = overlay.create(LazyBackupDestinationsCreationModal)
const deletionModal = overlay.create(LazyBackupDestinationsDeletionModal)
const { data: destinations, error, refresh } = await useFetch('/api/backup-destinations')

if (error.value) {
  throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.data?.message ?? 'Loading backup destinations failed.', fatal: true })
}

type Destination = NonNullable<typeof destinations.value>[number]

async function addDestination() {
  if (await creationModal.open().result) {
    await refresh()
  }
}

async function deleteDestination(destination: Destination) {
  if (await deletionModal.open({ destination }).result) {
    await refresh()
  }
}

function databaseCount(count: number) {
  if (count === 0) {
    return 'No databases'
  }
  return count === 1 ? '1 database' : `${count} databases`
}

const columns: TableColumn<Destination>[] = [
  { accessorKey: 'name', header: 'Name' },
  { id: 'bucket', header: 'Bucket' },
  { id: 'storage', header: 'Storage' },
  { accessorKey: 'databaseCount', header: 'Used by' },
  { accessorKey: 'createdAt', header: 'Added' },
  { id: 'actions', meta: { class: { th: 'w-px', td: 'w-px' } } }
]
</script>

<template>
  <UDashboardPanel id="backup-destinations">
    <template #header>
      <UDashboardNavbar title="Backup destinations">
        <template #right>
          <UButton
            label="Add destination"
            icon="i-lucide-plus"
            @click="addDestination"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTable
        v-if="destinations?.length"
        :data="destinations"
        :columns="columns"
      >
        <template #bucket-cell="{ row }">
          <span class="font-mono">{{ row.original.config.bucket }}{{ row.original.config.prefix ? `/${row.original.config.prefix}` : '' }}</span>
        </template>

        <template #storage-cell="{ row }">
          <span
            v-if="row.original.config.endpoint"
            class="font-mono"
          >{{ row.original.config.endpoint }}</span>
          <template v-else>
            Amazon S3 ({{ row.original.config.region }})
          </template>
        </template>

        <template #databaseCount-cell="{ row }">
          {{ databaseCount(row.original.databaseCount) }}
        </template>

        <template #createdAt-cell="{ row }">
          <NuxtTime
            :datetime="row.original.createdAt"
            locale="en-US"
            date-style="medium"
          />
        </template>

        <template #actions-cell="{ row }">
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            aria-label="Remove destination"
            @click="deleteDestination(row.original)"
          />
        </template>
      </UTable>

      <UEmpty
        v-else
        icon="i-lucide-database-backup"
        title="No backup destinations yet"
        description="Databases back up to a destination. Add a bucket from Amazon S3 or any S3-compatible storage."
        :actions="[{ label: 'Add destination', icon: 'i-lucide-plus', onClick: addDestination }]"
      />
    </template>
  </UDashboardPanel>
</template>
