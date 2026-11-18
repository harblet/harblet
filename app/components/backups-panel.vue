<script setup lang="ts">
import type { FormError, FormSubmitEvent, TableColumn } from '@nuxt/ui'
import type { z } from 'zod'
import { backupSchedules, backupSettingsSchema, type BackupSchedule } from '#shared/schemas/backup'
import { LazyBackupsDeletionModal, LazyBackupsRestoreModal } from '#components'

const props = defineProps<{
  api: `/api/services/${string}` | '/api/settings'
  description: string
  type?: string
}>()

const toast = useToast()
const overlay = useOverlay()
const deletionModal = overlay.create(LazyBackupsDeletionModal)
const restoreModal = overlay.create(LazyBackupsRestoreModal)
const { user } = useUserSession()
const { data: settings, error, refresh: refreshSettings } = await useFetch(`${props.api}/backup-settings`, { key: `backup-settings-${props.api}` })
const { data: backups, refresh: refreshBackups } = await useFetch(`${props.api}/backups`, { key: `backups-${props.api}` })
const { data: restores, refresh: refreshRestores } = await useFetch(`${props.api}/restores`, { key: `restores-${props.api}`, immediate: !!props.type })

if (error.value) {
  throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.data?.message, fatal: true })
}

type Backup = NonNullable<typeof backups.value>[number]

const destinations = computed(() => settings.value?.destinations.map(destination => ({ label: destination.name, value: destination.id })) ?? [])
const schedules = (Object.keys(backupSchedules) as BackupSchedule[]).map(schedule => ({ label: backupSchedules[schedule].label, value: schedule }))

const form = useTemplateRef('form')
const state = reactive<{ destinationId?: string, schedule: BackupSchedule, retention: number }>({ schedule: 'off', retention: 7 })
const { loading: saving, withLoading: withSaving } = useLoading()
const { loading: starting, withLoading: withStarting } = useLoading()

watch(settings, (value) => {
  Object.assign(state, {
    destinationId: value?.destinationId ?? (value?.destinations.length === 1 ? value.destinations[0]!.id : undefined),
    schedule: value?.schedule ?? 'off',
    retention: value?.retention ?? 7
  })
}, { immediate: true })

const restore = computed(() => restores.value?.[0])
const running = computed(() => !!backups.value?.some(backup => backup.status === 'running') || restore.value?.status === 'running')

function refresh() {
  return Promise.all([refreshBackups({ dedupe: 'defer' }), props.type && refreshRestores({ dedupe: 'defer' })])
}

watch(running, (value, _, onCleanup) => {
  if (!value || import.meta.server) {
    return
  }
  const timer = setInterval(refresh, 2000)
  onCleanup(() => clearInterval(timer))
}, { immediate: true })

async function onSubmit(event: FormSubmitEvent<z.output<typeof backupSettingsSchema>>) {
  try {
    await withSaving(async () => {
      await $fetch(`${props.api}/backup-settings`, { method: 'PUT', body: event.data })
      await refreshSettings()
    })
    toast.add({ title: 'Backup settings saved', color: 'success' })
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      form.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Saving the backup settings failed. Try again.', color: 'error' })
    }
  }
}

async function onBackup() {
  try {
    await withStarting(async () => {
      await $fetch(`${props.api}/backups`, { method: 'POST' })
      await refresh()
    })
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Starting the backup failed. Try again.', color: 'error' })
  }
}

async function deleteBackup(backup: Backup) {
  if (await deletionModal.open({ backup }).result) {
    await refresh()
  }
}

async function restoreBackup(backup: Backup) {
  if (props.type && await restoreModal.open({ backup, type: props.type }).result) {
    await refresh()
  }
}

const columns: TableColumn<Backup>[] = [
  { accessorKey: 'createdAt', header: 'Created' },
  { id: 'user', header: 'Started by' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'size', header: 'Size' },
  { id: 'duration', header: 'Duration' },
  { id: 'actions', meta: { class: { th: 'w-px', td: 'w-px' } } }
]
</script>

<template>
  <UEmpty
    v-if="!settings?.destinations.length"
    icon="i-lucide-database-backup"
    title="No backup destination yet"
    :description="user?.role === 'admin' ? 'Add a destination first, then choose it here.' : 'Ask an admin to add a backup destination, then choose it here.'"
    :actions="user?.role === 'admin' ? [{ label: 'Add destination', icon: 'i-lucide-plus', to: '/backup-destinations' }] : []"
  />

  <template v-else>
    <UForm
      ref="form"
      :schema="backupSettingsSchema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="onSubmit"
    >
      <UPageCard
        title="Backups"
        :description="description"
        variant="naked"
        orientation="horizontal"
      >
        <UButton
          type="submit"
          label="Save"
          :loading="saving"
          class="w-fit lg:ms-auto"
        />
      </UPageCard>

      <UPageCard variant="subtle">
        <UFormField
          label="Destination"
          name="destinationId"
        >
          <USelect
            v-model="state.destinationId"
            :items="destinations"
            placeholder="Choose a destination"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Schedule"
          name="schedule"
          :help="state.schedule === 'daily' ? 'Runs at 00:00 UTC.' : undefined"
        >
          <USelect
            v-model="state.schedule"
            :items="schedules"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Scheduled backups to keep"
          name="retention"
          help="Harblet deletes older scheduled backups. Backups you start yourself stay until you delete them."
        >
          <UInputNumber
            v-model="state.retention"
            :min="1"
            :max="100"
            class="w-full"
          />
        </UFormField>
      </UPageCard>
    </UForm>

    <UPageCard
      title="History"
      :description="settings.destinationId ? undefined : 'Save a destination to start backing up.'"
      variant="naked"
      orientation="horizontal"
    >
      <UButton
        label="Back up now"
        icon="i-lucide-database-backup"
        color="neutral"
        variant="outline"
        :loading="starting"
        :disabled="!settings.destinationId || running"
        class="w-fit lg:ms-auto"
        @click="onBackup"
      />
    </UPageCard>

    <UAlert
      v-if="restore"
      :color="restore.status === 'failed' ? 'error' : restore.status === 'running' ? 'info' : 'neutral'"
      variant="subtle"
      :icon="restore.status === 'running' ? 'i-lucide-loader-circle' : 'i-lucide-archive-restore'"
      :description="restore.error ?? undefined"
      :ui="{ icon: restore.status === 'running' ? 'animate-spin' : '', description: 'whitespace-pre-wrap break-words' }"
    >
      <template #title>
        {{ restore.status === 'running' ? 'Restoring' : restore.status === 'failed' ? 'Failed to restore' : 'Restored' }}
        <template v-if="restore.backup">
          the backup from
          <NuxtTime
            :datetime="restore.backup.createdAt"
            locale="en-US"
            date-style="medium"
            time-style="short"
          />
        </template>
        <template v-else>
          a backup that was deleted since
        </template>
        <template v-if="restore.finishedAt">
          on
          <NuxtTime
            :datetime="restore.finishedAt"
            locale="en-US"
            date-style="medium"
            time-style="short"
          />
        </template>
      </template>
    </UAlert>

    <UTable
      v-if="backups?.length"
      :data="backups"
      :columns="columns"
    >
      <template #createdAt-cell="{ row }">
        <NuxtTime
          :datetime="row.original.createdAt"
          locale="en-US"
          date-style="medium"
          time-style="short"
        />
      </template>

      <template #user-cell="{ row }">
        <UUser
          v-if="row.original.user"
          :name="row.original.user.name"
          :avatar="{ src: row.original.user.image ?? undefined, alt: row.original.user.name }"
          size="sm"
        />
        <UUser
          v-else-if="row.original.trigger === 'schedule'"
          name="Schedule"
          :avatar="{ icon: 'i-lucide-clock' }"
          size="sm"
        />
      </template>

      <template #status-cell="{ row }">
        <div class="flex flex-col items-start gap-1">
          <UBadge
            v-bind="backupStatusBadge(row.original.status)"
            variant="subtle"
          />
          <span
            v-if="row.original.error"
            class="max-w-xs text-xs whitespace-normal break-words"
          >{{ row.original.error }}</span>
        </div>
      </template>

      <template #size-cell="{ row }">
        <template v-if="row.original.size !== null">
          {{ formatBytes(row.original.size) }}
        </template>
      </template>

      <template #duration-cell="{ row }">
        <template v-if="row.original.finishedAt">
          {{ formatDuration(row.original.createdAt, row.original.finishedAt) }}
        </template>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex items-center justify-end gap-1">
          <UButton
            v-if="type && row.original.status === 'succeeded'"
            icon="i-lucide-archive-restore"
            color="neutral"
            variant="ghost"
            aria-label="Restore backup"
            :disabled="running"
            @click="restoreBackup(row.original)"
          />
          <UButton
            v-if="row.original.status === 'succeeded'"
            icon="i-lucide-download"
            color="neutral"
            variant="ghost"
            aria-label="Download backup"
            :to="`/api/backups/${row.original.id}/download`"
            external
          />
          <UButton
            v-if="row.original.status !== 'running'"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            aria-label="Delete backup"
            @click="deleteBackup(row.original)"
          />
        </div>
      </template>
    </UTable>

    <UEmpty
      v-else
      icon="i-lucide-history"
      title="No backups yet"
      description="Click Back up now, or set a schedule."
    />
  </template>
</template>
