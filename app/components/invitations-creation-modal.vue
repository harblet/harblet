<script setup lang="ts">
import type { FormError, FormSubmitEvent, SelectItem } from '@nuxt/ui'
import type { z } from 'zod'
import { invitationSchema } from '#shared/schemas/invitation'

const emit = defineEmits<{ close: [boolean] }>()

const roles: SelectItem[] = [
  { label: 'Member', value: 'user', description: 'Deploys and manages projects.' },
  { label: 'Admin', value: 'admin', description: 'Also manages servers, members and settings.' }
]

const toast = useToast()
const { copy } = useCopy()
const origin = useRequestURL().origin
const form = useTemplateRef('form')
const state = reactive<{ email: string, role: 'admin' | 'user' }>({ email: '', role: 'user' })
const link = ref<string>()
const { loading, withLoading } = useLoading()

async function onSubmit(event: FormSubmitEvent<z.output<typeof invitationSchema>>) {
  try {
    const invitation = await withLoading(() => $fetch('/api/invitations', { method: 'POST', body: event.data }))
    link.value = `${origin}/join/${invitation.token}`
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      form.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Creating the invitation failed. Try again.', color: 'error' })
    }
  }
}

async function copyLink() {
  await copy(link.value!, 'Link copied')
}
</script>

<template>
  <UModal
    :title="link ? 'Invitation created' : 'Invite member'"
    :description="link ? `Send this link to ${state.email}. It works once and expires in 7 days.` : 'You get a link to send them. They use it to create their account.'"
    :close="{ onClick: () => emit('close', !!link) }"
  >
    <template #body>
      <UInput
        v-if="link"
        :model-value="link"
        readonly
        aria-label="Invitation link"
        class="w-full"
        :ui="{ base: 'font-mono text-xs', trailing: 'pe-1' }"
      >
        <template #trailing>
          <UButton
            icon="i-lucide-copy"
            color="neutral"
            variant="link"
            size="sm"
            aria-label="Copy link"
            @click="copyLink"
          />
        </template>
      </UInput>

      <UForm
        v-else
        id="invite-member"
        ref="form"
        :schema="invitationSchema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField
          label="Email"
          name="email"
        >
          <UInput
            v-model="state.email"
            type="email"
            placeholder="colleague@example.com"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Role"
          name="role"
        >
          <USelect
            v-model="state.role"
            :items="roles"
            class="w-full"
          />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <UButton
        v-if="link"
        label="Done"
        @click="emit('close', true)"
      />
      <template v-else>
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="emit('close', false)"
        />
        <UButton
          type="submit"
          form="invite-member"
          label="Create invitation"
          :loading="loading"
        />
      </template>
    </template>
  </UModal>
</template>
