<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { LazyInvitationsCreationModal } from '#components'

useHead({ title: 'Invitations' })

const toast = useToast()
const origin = useRequestURL().origin
const overlay = useOverlay()
const creationModal = overlay.create(LazyInvitationsCreationModal)
const { data: invitations, error, refresh } = await useFetch('/api/invitations')

if (error.value) {
  throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.data?.message ?? 'Loading invitations failed.', fatal: true })
}

type Invitation = NonNullable<typeof invitations.value>[number]

async function invite() {
  if (await creationModal.open().result) {
    await refresh()
  }
}

async function copyLink(invitation: Invitation) {
  await navigator.clipboard.writeText(`${origin}/join/${invitation.token}`)
  toast.add({ title: 'Link copied', color: 'success' })
}

async function revoke(invitation: Invitation) {
  try {
    await $fetch(`/api/invitations/${invitation.id}`, { method: 'DELETE' })
    await refresh()
    toast.add({ title: 'Invitation revoked', color: 'success' })
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Revoking the invitation failed. Try again.', color: 'error' })
  }
}

function isExpired(invitation: Invitation) {
  return new Date(invitation.expiresAt).getTime() < Date.now()
}

function actions(invitation: Invitation): DropdownMenuItem[][] {
  return [
    [
      { label: 'Copy link', icon: 'i-lucide-copy', disabled: isExpired(invitation), onSelect: () => copyLink(invitation) }
    ],
    [
      { label: 'Revoke invitation', icon: 'i-lucide-x', color: 'error', onSelect: () => revoke(invitation) }
    ]
  ]
}

const columns: TableColumn<Invitation>[] = [
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'role', header: 'Role' },
  { id: 'inviter', header: 'Invited by' },
  { accessorKey: 'expiresAt', header: 'Expires' },
  { id: 'actions', meta: { class: { th: 'w-px', td: 'w-px' } } }
]
</script>

<template>
  <UDashboardPanel id="invitations">
    <template #header>
      <UDashboardNavbar title="Invitations">
        <template #right>
          <UButton
            label="Invite member"
            icon="i-lucide-user-round-plus"
            @click="invite"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTable
        v-if="invitations?.length"
        :data="invitations"
        :columns="columns"
      >
        <template #role-cell="{ row }">
          <UBadge
            :label="row.original.role === 'admin' ? 'Admin' : 'Member'"
            :color="row.original.role === 'admin' ? 'primary' : 'neutral'"
            variant="subtle"
          />
        </template>

        <template #inviter-cell="{ row }">
          {{ row.original.inviter.name }}
        </template>

        <template #expiresAt-cell="{ row }">
          <div class="flex items-center gap-2">
            <NuxtTime
              :datetime="row.original.expiresAt"
              locale="en-US"
              date-style="medium"
            />
            <UBadge
              v-if="isExpired(row.original)"
              label="Expired"
              color="error"
              variant="subtle"
            />
          </div>
        </template>

        <template #actions-cell="{ row }">
          <UDropdownMenu
            :items="actions(row.original)"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              aria-label="Invitation actions"
            />
          </UDropdownMenu>
        </template>
      </UTable>

      <UEmpty
        v-else
        icon="i-lucide-user-round-plus"
        title="No open invitations"
        description="Invite colleagues to deploy and manage projects with you. They get a link to create their account."
        :actions="[{ label: 'Invite member', icon: 'i-lucide-user-round-plus', onClick: invite }]"
      />
    </template>
  </UDashboardPanel>
</template>
