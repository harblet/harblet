<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { gitlabConnectionSchema } from '#shared/schemas/git-connection'

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const form = useTemplateRef('form')
const state = reactive({ url: 'https://gitlab.com', token: '' })
const { loading, withLoading } = useLoading()

async function onSubmit(event: FormSubmitEvent<z.output<typeof gitlabConnectionSchema>>) {
  try {
    await withLoading(() => $fetch('/api/git-connections', { method: 'POST', body: event.data }))
    toast.add({ title: 'GitLab connected', color: 'success' })
    emit('close', true)
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      form.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Connecting GitLab failed. Try again.', color: 'error' })
    }
  }
}
</script>

<template>
  <UModal
    title="Connect GitLab"
    description="Harblet reads your repositories with an access token that you create on GitLab. A group or project access token limits it to that group or project."
    :close="{ onClick: () => emit('close', false) }"
  >
    <template #body>
      <UForm
        id="new-gitlab-connection"
        ref="form"
        :schema="gitlabConnectionSchema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField
          label="GitLab URL"
          name="url"
          help="Change it if you host GitLab yourself."
        >
          <UInput
            v-model="state.url"
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </UFormField>

        <UFormField
          label="Access token"
          name="token"
          help="With the scopes read_api and read_repository. A group or project access token also needs the Reporter role."
        >
          <UInput
            v-model="state.token"
            type="password"
            autocomplete="off"
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
        form="new-gitlab-connection"
        label="Connect"
        :loading="loading"
      />
    </template>
  </UModal>
</template>
