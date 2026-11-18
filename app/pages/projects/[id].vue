<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const router = useRouter()
const id = computed(() => router.currentRoute.value.params.id as string)
const { data: project, error } = await useFetch(`/api/projects/${id.value}`, { key: `project-${id.value}` })

if (error.value) {
  throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.data?.message, fatal: true })
}

useHead({ title: () => project.value?.name })

const links = computed<NavigationMenuItem[]>(() => [
  { label: 'Services', icon: 'i-lucide-layers', to: `/projects/${id.value}`, exact: true },
  { label: 'Settings', icon: 'i-lucide-settings', to: `/projects/${id.value}/settings` }
])
</script>

<template>
  <UDashboardPanel id="project">
    <template #header>
      <UDashboardNavbar :title="project?.name" />

      <UDashboardToolbar>
        <UNavigationMenu
          :items="links"
          highlight
          class="-mx-1 flex-1"
        />
      </UDashboardToolbar>
    </template>

    <template #body>
      <NuxtPage />
    </template>
  </UDashboardPanel>
</template>
