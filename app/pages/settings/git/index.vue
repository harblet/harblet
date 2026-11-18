<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { LazyGitConnectionsDeletionModal, LazyGithubConnectionsCreationModal, LazyGitlabConnectionsCreationModal, LazyGitlabConnectionsTokenModal } from '#components'

useHead({ title: 'Git' })

const router = useRouter()
const toast = useToast()
const overlay = useOverlay()
const githubCreationModal = overlay.create(LazyGithubConnectionsCreationModal)
const gitlabCreationModal = overlay.create(LazyGitlabConnectionsCreationModal)
const tokenModal = overlay.create(LazyGitlabConnectionsTokenModal)
const deletionModal = overlay.create(LazyGitConnectionsDeletionModal)
const { data: connections, error, refresh } = await useFetch('/api/git-connections')

if (error.value) {
  throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.data?.message ?? 'Loading Git connections failed.', fatal: true })
}

type Connection = NonNullable<typeof connections.value>[number]

onMounted(() => {
  const message = router.currentRoute.value.query.error
  if (typeof message === 'string') {
    toast.add({ title: message, color: 'error' })
    router.replace({ query: {} })
  }
})

function connectGitHub() {
  githubCreationModal.open()
}

async function connectGitLab() {
  if (await gitlabCreationModal.open().result) {
    await refresh()
  }
}

async function replaceToken(connection: Connection) {
  if (await tokenModal.open({ connection }).result) {
    await refresh()
  }
}

async function removeConnection(connection: Connection) {
  if (await deletionModal.open({ connection }).result) {
    await refresh()
  }
}

function serviceCount(count: number) {
  if (count === 0) {
    return 'No services'
  }
  return count === 1 ? '1 service' : `${count} services`
}

function expiresSoon(expiresAt: string) {
  return (new Date(expiresAt).getTime() - Date.now()) / 86_400_000 < 30
}

const items: DropdownMenuItem[] = [
  { label: 'GitHub', icon: 'i-lucide-github', onSelect: connectGitHub },
  { label: 'GitLab', icon: 'i-lucide-gitlab', onSelect: connectGitLab }
]

const columns: TableColumn<Connection>[] = [
  { accessorKey: 'name', header: 'Connection' },
  { accessorKey: 'owner', header: 'Account' },
  { id: 'access', header: 'Access' },
  { accessorKey: 'serviceCount', header: 'Used by' },
  { id: 'actions', meta: { class: { th: 'w-px', td: 'w-px' } } }
]
</script>

<template>
  <UDashboardPanel id="git">
    <template #header>
      <UDashboardNavbar title="Git">
        <template #right>
          <UDropdownMenu
            :items="items"
            :content="{ align: 'end' }"
          >
            <UButton
              label="Connect"
              icon="i-lucide-plus"
            />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTable
        v-if="connections?.length"
        :data="connections"
        :columns="columns"
      >
        <template #name-cell="{ row }">
          <div class="flex items-center gap-2">
            <UIcon
              :name="row.original.provider === 'gitlab' ? 'i-lucide-gitlab' : 'i-lucide-github'"
              class="size-4 shrink-0 text-muted"
            />
            <ULink
              :to="row.original.provider === 'gitlab' ? row.original.url : row.original.appUrl"
              target="_blank"
              class="font-mono"
            >
              {{ row.original.name }}
            </ULink>
          </div>
        </template>

        <template #access-cell="{ row }">
          <UTooltip
            v-if="row.original.error"
            :text="row.original.error"
          >
            <UBadge
              label="Unreachable"
              color="error"
              variant="subtle"
            />
          </UTooltip>
          <template v-else-if="row.original.provider === 'gitlab'">
            <UBadge
              v-if="!row.original.token"
              label="Expired or revoked"
              color="error"
              variant="subtle"
            />
            <div
              v-else-if="row.original.token.expiresAt"
              class="flex items-center gap-2"
            >
              <span>
                Expires
                <NuxtTime
                  :datetime="row.original.token.expiresAt"
                  locale="en-US"
                  date-style="medium"
                  time-zone="UTC"
                />
              </span>
              <UBadge
                v-if="expiresSoon(row.original.token.expiresAt)"
                label="Expires soon"
                color="warning"
                variant="subtle"
              />
            </div>
            <template v-else>
              Doesn't expire
            </template>
          </template>
          <UBadge
            v-else-if="!row.original.installation"
            label="Not installed"
            color="warning"
            variant="subtle"
          />
          <UBadge
            v-else-if="row.original.installation.suspended"
            label="Suspended"
            color="warning"
            variant="subtle"
          />
          <template v-else>
            {{ row.original.installation.repositorySelection === 'all' ? 'All repositories' : 'Selected repositories' }}
          </template>
        </template>

        <template #serviceCount-cell="{ row }">
          {{ serviceCount(row.original.serviceCount) }}
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center justify-end gap-1">
            <UButton
              v-if="row.original.provider === 'gitlab'"
              label="Replace token"
              color="neutral"
              :variant="row.original.token === null ? 'outline' : 'ghost'"
              @click="replaceToken(row.original)"
            />
            <UButton
              v-else-if="row.original.installation === null"
              label="Install"
              :to="row.original.installUrl"
              color="neutral"
              variant="outline"
            />
            <UButton
              v-else-if="row.original.installation"
              label="Choose repositories"
              :to="row.original.installation.url"
              color="neutral"
              variant="ghost"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              aria-label="Remove connection"
              @click="removeConnection(row.original)"
            />
          </div>
        </template>
      </UTable>

      <UEmpty
        v-else
        icon="i-lucide-git-branch"
        title="No Git connections yet"
        description="Connect GitHub or GitLab to deploy private repositories. Public repositories work without a connection."
      >
        <template #actions>
          <UDropdownMenu :items="items">
            <UButton
              label="Connect"
              icon="i-lucide-plus"
            />
          </UDropdownMenu>
        </template>
      </UEmpty>
    </template>
  </UDashboardPanel>
</template>
