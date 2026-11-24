<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { serviceSchema } from '#shared/schemas/service'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const form = useTemplateRef('form')
const state = reactive<{ name: string, image: string, worker: boolean, port?: number | null }>({ name: '', image: '', worker: false, port: undefined })
const { loading, withLoading } = useLoading()

async function onSubmit(event: FormSubmitEvent<z.output<typeof serviceSchema>>) {
  try {
    await withLoading(() => $fetch(`/api/projects/${props.projectId}/services`, { method: 'POST', body: { ...event.data, type: 'image' } }))
    emit('close', true)
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      form.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Creating the service failed. Try again.', color: 'error' })
    }
  }
}
</script>

<template>
  <UModal
    title="New service"
    description="Runs a Docker image and deploys it right away."
    :close="{ onClick: () => emit('close', false) }"
  >
    <template #body>
      <UForm
        id="new-service"
        ref="form"
        :schema="serviceSchema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField
          label="Name"
          name="name"
        >
          <UInput
            v-model="state.name"
            placeholder="Web"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Image"
          name="image"
        >
          <UInput
            v-model="state.image"
            placeholder="nginx:latest"
            class="w-full"
          />
        </UFormField>

        <WorkerField v-model="state.worker" />

        <UFormField
          v-if="!state.worker"
          label="Port"
          name="port"
          help="The port your app listens on. Leave it empty to use the port the image exposes."
        >
          <UInputNumber
            v-model="state.port"
            :min="1"
            :max="65535"
            :increment="false"
            :decrement="false"
            :format-options="{ useGrouping: false }"
            placeholder="Automatic"
            class="w-full"
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
        form="new-service"
        label="Create service"
        :loading="loading"
      />
    </template>
  </UModal>
</template>
