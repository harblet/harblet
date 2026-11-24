<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { gitSchema } from '#shared/schemas/service'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const form = useTemplateRef('form')
const state = reactive<{ name: string, repository: string, gitConnectionId?: string | null, branch: string, rootDirectory: string, dockerfilePath: string, worker: boolean, port?: number | null }>({
  name: '',
  repository: '',
  gitConnectionId: null,
  branch: 'main',
  rootDirectory: '',
  dockerfilePath: '',
  worker: false,
  port: undefined
})
const { loading, withLoading } = useLoading()

async function onSubmit(event: FormSubmitEvent<z.output<typeof gitSchema>>) {
  try {
    await withLoading(() => $fetch(`/api/projects/${props.projectId}/services`, { method: 'POST', body: { ...event.data, type: 'git' } }))
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
    title="New service from Git"
    description="Builds the repository and deploys it right away."
    :close="{ onClick: () => emit('close', false) }"
  >
    <template #body>
      <UForm
        id="new-repository"
        ref="form"
        :schema="gitSchema"
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

        <RepositoryField
          v-model:repository="state.repository"
          v-model:git-connection-id="state.gitConnectionId"
          v-model:branch="state.branch"
        />

        <UFormField
          label="Branch"
          name="branch"
        >
          <UInput
            v-model="state.branch"
            placeholder="main"
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </UFormField>

        <UFormField
          label="Root directory"
          name="rootDirectory"
          help="Where your app lives in the repository. Leave it empty for the top level."
        >
          <UInput
            v-model="state.rootDirectory"
            placeholder="apps/web"
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </UFormField>

        <UFormField
          label="Dockerfile path"
          name="dockerfilePath"
          help="Relative to the root directory. Leave it empty to use a Dockerfile in the root directory if there is one, or Railpack if there isn't."
        >
          <UInput
            v-model="state.dockerfilePath"
            placeholder="Dockerfile"
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </UFormField>

        <WorkerField v-model="state.worker" />

        <UFormField
          v-if="!state.worker"
          label="Port"
          name="port"
          help="The port your app listens on. Leave it empty to use your PORT variable, the port the image exposes, or 8080. Harblet passes it to your app as PORT."
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
        form="new-repository"
        label="Create service"
        :loading="loading"
      />
    </template>
  </UModal>
</template>
