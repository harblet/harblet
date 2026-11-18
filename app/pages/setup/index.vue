<script setup lang="ts">
import type { AuthFormField, FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { setupSchema } from '#shared/schemas/setup'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Set up' })

type Schema = z.output<typeof setupSchema>

const fields: AuthFormField[] = [
  { name: 'name', type: 'text', label: 'Your name', placeholder: 'Jane Doe', autocomplete: 'name', size: 'lg', eagerValidation: true },
  { name: 'email', type: 'email', label: 'Email', placeholder: 'you@example.com', autocomplete: 'email', size: 'lg', eagerValidation: true },
  { name: 'password', type: 'password', label: 'Password', placeholder: 'At least 8 characters', autocomplete: 'new-password', size: 'lg', eagerValidation: true }
]

const setupRequired = useState<boolean | null>('setup-required')
const { fetchSession } = useUserSession()

const authForm = useTemplateRef('authForm')
const { loading, withLoading } = useLoading()
const error = ref<string>()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  error.value = undefined
  try {
    await withLoading(async () => {
      await $fetch('/api/setup', { method: 'POST', body: event.data })
      setupRequired.value = false
      await fetchSession({ force: true })
      await navigateTo('/')
    })
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      authForm.value?.formRef?.setErrors(data.data.errors)
    } else {
      error.value = data?.message ?? 'Setup failed. Try again.'
    }
  }
}
</script>

<template>
  <UAuthForm
    ref="authForm"
    :fields="fields"
    :schema="setupSchema"
    :validate-on="['input']"
    title="Set up Harblet"
    description="Create the admin account."
    :submit="{ label: 'Create account', size: 'lg' }"
    :loading="loading"
    :ui="{ header: 'text-left', title: 'text-2xl tracking-tight', description: 'text-sm' }"
    @submit="onSubmit"
  >
    <template v-if="error" #validation>
      <UAlert
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="error"
      />
    </template>
  </UAuthForm>
</template>
