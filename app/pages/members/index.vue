<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { LazyMembersDeletionModal } from '#components'

useHead({ title: 'Members' })

const toast = useToast()
const overlay = useOverlay()
const deletionModal = overlay.create(LazyMembersDeletionModal)
const { user } = useUserSession()
const { data: members, error, refresh } = await useFetch('/api/members')

if (error.value) {
  throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.data?.message ?? 'Loading members failed.', fatal: true })
}

type Member = NonNullable<typeof members.value>[number]

async function setRole(member: Member, role: 'admin' | 'user') {
  try {
    await $fetch(`/api/members/${member.id}`, { method: 'PATCH', body: { role } })
    await refresh()
    toast.add({ title: role === 'admin' ? `${member.name} is now an admin` : `${member.name} is now a member`, color: 'success' })
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Changing the role failed. Try again.', color: 'error' })
  }
}

async function removeMember(member: Member) {
  if (await deletionModal.open({ member }).result) {
    await refresh()
  }
}

function actions(member: Member): DropdownMenuItem[][] {
  return [
    [
      member.role === 'admin'
        ? { label: 'Make member', icon: 'i-lucide-user', onSelect: () => setRole(member, 'user') }
        : { label: 'Make admin', icon: 'i-lucide-shield', onSelect: () => setRole(member, 'admin') }
    ],
    [
      { label: 'Remove from team', icon: 'i-lucide-user-minus', color: 'error', onSelect: () => removeMember(member) }
    ]
  ]
}

const columns: TableColumn<Member>[] = [
  { accessorKey: 'name', header: 'Member' },
  { accessorKey: 'role', header: 'Role' },
  { accessorKey: 'createdAt', header: 'Joined' },
  { id: 'actions', meta: { class: { th: 'w-px', td: 'w-px' } } }
]
</script>

<template>
  <UDashboardPanel id="members">
    <template #header>
      <UDashboardNavbar title="Members" />
    </template>

    <template #body>
      <UTable
        :data="members ?? []"
        :columns="columns"
      >
        <template #name-cell="{ row }">
          <UUser
            :description="row.original.email"
            :avatar="{ src: row.original.image ?? undefined, alt: row.original.name }"
          >
            <template #name>
              {{ row.original.name }}
              <UBadge
                v-if="row.original.id === user?.id"
                label="You"
                color="neutral"
                variant="outline"
                size="sm"
                class="ms-1"
              />
            </template>
          </UUser>
        </template>

        <template #role-cell="{ row }">
          <UBadge
            :label="row.original.role === 'admin' ? 'Admin' : 'Member'"
            :color="row.original.role === 'admin' ? 'primary' : 'neutral'"
            variant="subtle"
          />
        </template>

        <template #createdAt-cell="{ row }">
          <NuxtTime
            :datetime="row.original.createdAt"
            locale="en-US"
            date-style="medium"
          />
        </template>

        <template #actions-cell="{ row }">
          <UDropdownMenu
            v-if="row.original.id !== user?.id"
            :items="actions(row.original)"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              aria-label="Member actions"
            />
          </UDropdownMenu>
        </template>
      </UTable>
    </template>
  </UDashboardPanel>
</template>
