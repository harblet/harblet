<script setup lang="ts">
import type { AuthFormField, FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { joinSchema } from '#shared/schemas/invitation'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Join Harblet' })

type Schema = z.output<typeof joinSchema>

const router = useRouter()
const token = computed(() => router.currentRoute.value.params.token as string)
const { data: invitation } = await useFetch(`/api/join/${token.value}`)
const { fetchSession } = useUserSession()

const fields: AuthFormField[] = [
  { name: 'email', type: 'email', label: 'Email', defaultValue: invitation.value?.email, disabled: true, autocomplete: 'username', size: 'lg' },
  { name: 'name', type: 'text', label: 'Your name', placeholder: 'Jane Doe', autocomplete: 'name', size: 'lg', eagerValidation: true },
  { name: 'password', type: 'password', label: 'Password', placeholder: 'At least 8 characters', autocomplete: 'new-password', size: 'lg', eagerValidation: true }
]

const authForm = useTemplateRef('authForm')
const { loading, withLoading } = useLoading()
const error = ref<string>()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  error.value = undefined
  try {
    await withLoading(async () => {
      await $fetch(`/api/join/${token.value}`, { method: 'POST', body: event.data })
      await fetchSession({ force: true })
      await navigateTo('/')
    })
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      authForm.value?.formRef?.setErrors(data.data.errors)
    } else {
      error.value = data?.message ?? 'Creating your account failed. Try again.'
    }
  }
}
</script>

<template>
  <div>
    <UAuthForm
    v-if="invitation"
    ref="authForm"
    :fields="fields"
    :schema="joinSchema"
    :validate-on="['input']"
    title="Join your team on Harblet"
    :description="`${invitation.inviter.name} invited you as ${invitation.role === 'admin' ? 'an admin' : 'a member'}. Create your account to get started.`"
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

  <div
    v-else
    class="flex flex-col gap-6"
  >
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-pretty text-highlighted">
        This invitation isn't valid
      </h1>
      <p class="mt-1 text-sm text-pretty text-muted">
        The link was already used, was revoked or has expired. Ask an admin of your team for a new one.
      </p>
    </div>

    <UButton
      label="Go to login"
      to="/login"
      size="lg"
      block
    />
  </div>
  </div>
</template>
