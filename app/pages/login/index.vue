<script setup lang="ts">
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Log in' })

const schema = z.object({
  email: z.email({ error: issue => issue.input ? 'Enter a valid email' : 'Enter your email' }),
  password: z.string({ error: 'Enter your password' }).min(1, 'Enter your password')
})

type Schema = z.output<typeof schema>

const fields: AuthFormField[] = [
  { name: 'email', type: 'email', label: 'Email', placeholder: 'you@example.com', autocomplete: 'email', size: 'lg', eagerValidation: true },
  { name: 'password', type: 'password', label: 'Password', placeholder: 'Your password', autocomplete: 'current-password', size: 'lg', eagerValidation: true }
]

const { execute, status, error } = useSignIn('email')

async function onSubmit(event: FormSubmitEvent<Schema>) {
  await execute(event.data)
}
</script>

<template>
  <UAuthForm
    :fields="fields"
    :schema="schema"
    :validate-on="['input']"
    title="Welcome back"
    description="Log in to your Harblet account."
    :submit="{ label: 'Log in', size: 'lg' }"
    :loading="status === 'pending'"
    :ui="{ header: 'text-left', title: 'text-2xl tracking-tight', description: 'text-sm' }"
    @submit="onSubmit"
  >
    <template v-if="error" #validation>
      <UAlert
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="error.message"
      />
    </template>
  </UAuthForm>
</template>
