<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { gitlabTokenSchema } from '#shared/schemas/git-connection'

const props = defineProps<{
  connection: { id: string, name: string }
}>()

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const form = useTemplateRef('form')
const state = reactive({ token: '' })
const { loading, withLoading } = useLoading()

async function onSubmit(event: FormSubmitEvent<z.output<typeof gitlabTokenSchema>>) {
  try {
    await withLoading(() => $fetch(`/api/git-connections/${props.connection.id}`, { method: 'PATCH', body: event.data }))
    toast.add({ title: 'Token replaced', color: 'success' })
    emit('close', true)
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    const errors = data?.data?.errors
    if (errors?.every(error => error.name === 'token')) {
      form.value?.setErrors(errors)
    } else {
      toast.add({ title: data?.message ?? 'Replacing the token failed. Try again.', color: 'error' })
    }
  }
}
</script>

<template>
  <UModal
    :title="`Replace the token of ${connection.name}`"
    description="Create a new access token on GitLab and enter it here. The services that use this connection keep it."
    :close="{ onClick: () => emit('close', false) }"
  >
    <template #body>
      <UForm
        id="replace-gitlab-token"
        ref="form"
        :schema="gitlabTokenSchema"
        :state="state"
        @submit="onSubmit"
      >
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
        form="replace-gitlab-token"
        label="Replace token"
        :loading="loading"
      />
    </template>
  </UModal>
</template>
