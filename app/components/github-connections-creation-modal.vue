<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { githubConnectionSchema } from '#shared/schemas/git-connection'

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const form = useTemplateRef('form')
const state = reactive<{ organization: string }>({ organization: '' })
const { loading, withLoading } = useLoading()

async function onSubmit(event: FormSubmitEvent<z.output<typeof githubConnectionSchema>>) {
  try {
    const { url, manifest } = await withLoading(() => $fetch('/api/github/manifest', { method: 'POST', body: event.data }))
    const target = document.createElement('form')
    target.method = 'post'
    target.action = url
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = 'manifest'
    input.value = manifest
    target.append(input)
    document.body.append(target)
    target.submit()
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      form.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Connecting GitHub failed. Try again.', color: 'error' })
    }
  }
}
</script>

<template>
  <UModal
    title="Connect GitHub"
    description="Harblet creates a private GitHub App for your account or organization. You then choose which repositories it can read."
    :close="{ onClick: () => emit('close', false) }"
  >
    <template #body>
      <UForm
        id="new-git-connection"
        ref="form"
        :schema="githubConnectionSchema"
        :state="state"
        @submit="onSubmit"
      >
        <UFormField
          label="Organization"
          name="organization"
          help="Leave it empty to connect your personal account."
        >
          <UInput
            v-model="state.organization"
            placeholder="acme"
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
        form="new-git-connection"
        label="Continue on GitHub"
        trailing-icon="i-lucide-arrow-right"
        :loading="loading"
      />
    </template>
  </UModal>
</template>
