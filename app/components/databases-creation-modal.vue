<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { databaseEngines, databaseSchema, type DatabaseType } from '#shared/schemas/service'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const form = useTemplateRef('form')
const state = reactive<{ type: DatabaseType, name: string, version?: string, databaseUser: string, databaseName: string }>({
  type: 'postgres',
  name: databaseEngines.postgres.label,
  version: databaseEngines.postgres.versions[0],
  databaseUser: databaseEngines.postgres.defaultUser,
  databaseName: 'app'
})
const { loading, withLoading } = useLoading()

const types = (Object.keys(databaseEngines) as DatabaseType[]).map(type => ({ label: databaseEngines[type].label, icon: databaseEngines[type].icon, value: type }))
const engine = computed(() => databaseEngines[state.type])

watch(() => state.type, (type, previous) => {
  const next = databaseEngines[type]
  if (state.name === databaseEngines[previous].label) {
    state.name = next.label
  }
  if (state.databaseUser === databaseEngines[previous].defaultUser) {
    state.databaseUser = next.defaultUser
  }
  state.version = next.versions[0]
})

async function onSubmit(event: FormSubmitEvent<z.output<typeof databaseSchema>>) {
  try {
    await withLoading(() => $fetch(`/api/projects/${props.projectId}/services`, { method: 'POST', body: event.data }))
    emit('close', true)
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      form.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Creating the database failed. Try again.', color: 'error' })
    }
  }
}
</script>

<template>
  <UModal
    title="New database"
    description="Only services in this project can connect to it."
    :close="{ onClick: () => emit('close', false) }"
  >
    <template #body>
      <UForm
        id="new-database"
        ref="form"
        :schema="databaseSchema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField
          label="Type"
          name="type"
        >
          <URadioGroup
            v-model="state.type"
            :items="types"
            variant="card"
            orientation="horizontal"
            :ui="{ item: 'flex-1' }"
          >
            <template #label="{ item }">
              <span class="flex items-center gap-2">
                <UIcon
                  :name="item.icon"
                  class="size-5"
                />
                {{ item.label }}
              </span>
            </template>
          </URadioGroup>
        </UFormField>

        <UFormField
          label="Name"
          name="name"
        >
          <UInput
            v-model="state.name"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Version"
          name="version"
        >
          <USelect
            v-model="state.version"
            :items="engine.versions"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Username"
          name="databaseUser"
          help="Can't be changed later."
        >
          <UInput
            v-model="state.databaseUser"
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </UFormField>

        <UFormField
          label="Database name"
          name="databaseName"
          help="Can't be changed later."
        >
          <UInput
            v-model="state.databaseName"
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        @click="emit('close', false)"
      />
      <UButton
        type="submit"
        form="new-database"
        label="Create database"
        :loading="loading"
      />
    </template>
  </UModal>
</template>
