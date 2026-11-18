<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { projectSchema } from '#shared/schemas/project'

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const form = useTemplateRef('form')
const state = reactive({ name: '' })
const { loading, withLoading } = useLoading()

async function onSubmit(event: FormSubmitEvent<z.output<typeof projectSchema>>) {
  try {
    await withLoading(async () => {
      const project = await $fetch('/api/projects', { method: 'POST', body: event.data })
      await navigateTo(`/projects/${project.id}`)
    })
    emit('close', true)
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      form.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Creating the project failed. Try again.', color: 'error' })
    }
  }
}
</script>

<template>
  <UModal
    title="New project"
    description="A project groups the services of one app, such as its web server, workers and database."
    :close="{ onClick: () => emit('close', false) }"
  >
    <template #body>
      <UForm
        id="new-project"
        ref="form"
        :schema="projectSchema"
        :state="state"
        @submit="onSubmit"
      >
        <UFormField
          label="Name"
          name="name"
        >
          <UInput
            v-model="state.name"
            placeholder="My App"
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
        form="new-project"
        label="Create project"
        :loading="loading"
      />
    </template>
  </UModal>
</template>
