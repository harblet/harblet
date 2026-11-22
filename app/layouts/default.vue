<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

const router = useRouter()
const { user, signOut } = useUserSession()

const open = ref(false)
const { data: update } = useLazyFetch('/api/settings/update', { key: 'update', server: false, immediate: user.value?.role === 'admin' })

const items = computed<NavigationMenuItem[][]>(() => [
  [
    { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: '/', exact: true },
    { label: 'Projects', icon: 'i-lucide-boxes', to: '/projects', active: router.currentRoute.value.path.startsWith('/projects') }
  ],
  ...(user.value?.role === 'admin'
    ? [
        [
          { label: 'Infrastructure', type: 'label' },
          { label: 'Servers', icon: 'i-lucide-server', to: '/servers', active: router.currentRoute.value.path.startsWith('/servers') },
          { label: 'Metrics', icon: 'i-lucide-chart-line', to: '/metrics' },
          { label: 'SSL Certificates', icon: 'i-lucide-shield-check', to: '/certificates' },
          { label: 'Backup destinations', icon: 'i-lucide-database-backup', to: '/backup-destinations' },
        ],
        [
          { label: 'Team', type: 'label' },
          { label: 'Members', icon: 'i-lucide-users', to: '/members' },
          { label: 'Invitations', icon: 'i-lucide-user-round-plus', to: '/invitations' },
        ],
        [
          { label: 'Settings', type: 'label' },
          { label: 'General', icon: 'i-lucide-settings', to: '/settings', exact: true, badge: update.value?.available ? 'Update' : undefined },
          { label: 'Git', icon: 'i-lucide-git-branch', to: '/settings/git' },
          { label: 'Backups', icon: 'i-lucide-archive', to: '/settings/backups' },
        ]
      ] satisfies NavigationMenuItem[][]
    : [])
])

const links: NavigationMenuItem[] = [
  { label: 'Documentation', icon: 'i-lucide-book-open', to: 'https://harblet.com/docs', target: '_blank' }
]

const userMenuItems = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: user.value?.name, description: user.value?.email }],
  [
    { label: 'Account', icon: 'i-lucide-user-round', to: '/account' },
    { label: 'Log out', icon: 'i-lucide-log-out', onSelect: () => signOut() }
  ]
])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      :default-size="20"
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header>
        <NuxtLink to="/" class="flex items-center gap-2 px-2.5 font-semibold">
          <img src="/logo.svg" alt="" class="size-6 shrink-0 rounded-md">
          <span>Harblet</span>
        </NuxtLink>
      </template>

      <template #default>
        <UNavigationMenu
          :items="items"
          orientation="vertical"
        />

        <UNavigationMenu
          :items="links"
          orientation="vertical"
          class="mt-auto"
        />
      </template>

      <template #footer>
        <UDropdownMenu
          :items="userMenuItems"
          :content="{ align: 'center', collisionPadding: 12 }"
          :ui="{ content: 'w-(--reka-dropdown-menu-trigger-width)' }"
        >
          <UButton
            :avatar="{ src: user?.image ?? undefined, alt: user?.name }"
            :label="user?.name"
            trailing-icon="i-lucide-chevrons-up-down"
            color="neutral"
            variant="ghost"
            block
            class="data-[state=open]:bg-elevated"
            :ui="{ trailingIcon: 'text-dimmed' }"
          />
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
