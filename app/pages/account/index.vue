<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { accountSchema, passwordSchema } from '#shared/schemas/account'

useHead({ title: 'Account' })

const toast = useToast()
const { user, fetchSession } = useUserSession()

const profileForm = useTemplateRef('profileForm')
const profile = reactive({ name: user.value?.name ?? '' })
const { loading: savingProfile, withLoading: withSavingProfile } = useLoading()

const passwordForm = useTemplateRef('passwordForm')
const password = reactive({ currentPassword: '', newPassword: '' })
const { loading: changingPassword, withLoading: withChangingPassword } = useLoading()

async function saveProfile(event: FormSubmitEvent<z.output<typeof accountSchema>>) {
  try {
    await withSavingProfile(async () => {
      await $fetch('/api/account', { method: 'PATCH', body: event.data })
      await fetchSession({ force: true })
    })
    profile.name = event.data.name
    toast.add({ title: 'Name saved', color: 'success' })
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      profileForm.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Saving your name failed. Try again.', color: 'error' })
    }
  }
}

async function changePassword(event: FormSubmitEvent<z.output<typeof passwordSchema>>) {
  const { error } = await withChangingPassword(() => useAuthClient()!.changePassword({ ...event.data, revokeOtherSessions: true }))
  if (error?.code === 'INVALID_PASSWORD') {
    passwordForm.value?.setErrors([{ name: 'currentPassword', message: 'This isn\'t your current password' }])
  } else if (error) {
    toast.add({ title: error.message ?? 'Changing your password failed. Try again.', color: 'error' })
  } else {
    password.currentPassword = ''
    password.newPassword = ''
    toast.add({ title: 'Password changed', color: 'success' })
  }
}
</script>

<template>
  <UDashboardPanel id="account">
    <template #header>
      <UDashboardNavbar title="Account" />
    </template>

    <template #body>
      <div class="mx-auto flex w-full flex-col gap-4 lg:max-w-3xl">
        <UForm
          ref="profileForm"
          :schema="accountSchema"
          :state="profile"
          class="flex flex-col gap-4"
          @submit="saveProfile"
        >
          <UPageCard
            title="Profile"
            description="Your team sees your name, for example next to your deployments."
            variant="naked"
            orientation="horizontal"
          >
            <UButton
              type="submit"
              label="Save"
              :loading="savingProfile"
              class="w-fit lg:ms-auto"
            />
          </UPageCard>

          <UPageCard variant="subtle">
            <UFormField
              label="Name"
              name="name"
            >
              <UInput
                v-model="profile.name"
                autocomplete="name"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Email">
              <UInput
                :model-value="user?.email"
                disabled
                class="w-full"
              />
            </UFormField>
          </UPageCard>
        </UForm>

        <UForm
          ref="passwordForm"
          :schema="passwordSchema"
          :state="password"
          class="flex flex-col gap-4"
          @submit="changePassword"
        >
          <UPageCard
            title="Password"
            description="Changing your password logs you out on your other devices."
            variant="naked"
            orientation="horizontal"
          >
            <UButton
              type="submit"
              label="Change password"
              :loading="changingPassword"
              class="w-fit lg:ms-auto"
            />
          </UPageCard>

          <UPageCard variant="subtle">
            <UFormField
              label="Current password"
              name="currentPassword"
            >
              <UInput
                v-model="password.currentPassword"
                type="password"
                autocomplete="current-password"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="New password"
              name="newPassword"
            >
              <UInput
                v-model="password.newPassword"
                type="password"
                placeholder="At least 8 characters"
                autocomplete="new-password"
                class="w-full"
              />
            </UFormField>
          </UPageCard>
        </UForm>
      </div>
    </template>
  </UDashboardPanel>
</template>
