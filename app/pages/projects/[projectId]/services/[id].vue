<script setup lang="ts">
import type { BreadcrumbItem, NavigationMenuItem } from '@nuxt/ui'
import { isDatabase } from '#shared/schemas/service'

const router = useRouter()
const projectId = computed(() => router.currentRoute.value.params.projectId as string)
const id = computed(() => router.currentRoute.value.params.id as string)
const { data: service, error } = await useFetch(`/api/services/${id.value}`, { key: `service-${id.value}` })

if (error.value) {
  throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.data?.message, fatal: true })
}
if (service.value?.projectId !== projectId.value) {
  throw createError({ statusCode: 404, statusMessage: 'Service not found.', fatal: true })
}

useHead({ title: () => service.value?.name })

const base = computed(() => `/projects/${projectId.value}/services/${id.value}`)

const breadcrumb = computed<BreadcrumbItem[]>(() => [
  { label: service.value?.project.name, to: `/projects/${projectId.value}` },
  { label: service.value?.name }
])

const links = computed<NavigationMenuItem[]>(() => [
  { label: 'Overview', icon: 'i-lucide-layout-dashboard', to: base.value, exact: true },
  { label: 'Deployments', icon: 'i-lucide-history', to: `${base.value}/deployments` },
  { label: 'Logs', icon: 'i-lucide-logs', to: `${base.value}/logs` },
  ...(service.value && isDatabase(service.value.type)
    ? [{ label: 'Backups', icon: 'i-lucide-database-backup', to: `${base.value}/backups` }]
    : [
        { label: 'Environment variables', icon: 'i-lucide-braces', to: `${base.value}/variables` },
        { label: 'Domains', icon: 'i-lucide-globe', to: `${base.value}/domains` },
        { label: 'Volumes', icon: 'i-lucide-hard-drive', to: `${base.value}/volumes` }
      ]),
  { label: 'Settings', icon: 'i-lucide-settings', to: `${base.value}/settings` }
])

const toast = useToast()
const { loading, withLoading } = useLoading()

async function onDeploy() {
  try {
    await withLoading(async () => {
      await $fetch(`/api/services/${id.value}/deployments`, { method: 'POST' })
      await refreshNuxtData(`deployments-${id.value}`)
      await navigateTo(`${base.value}/deployments`)
    })
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Deploying failed. Try again.', color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="service">
    <template #header>
      <UDashboardNavbar>
        <template #left>
          <UBreadcrumb :items="breadcrumb" />
        </template>

        <template #right>
          <UButton
            label="Deploy"
            icon="i-lucide-cloud-upload"
            :loading="loading"
            @click="onDeploy"
          />
        </template>
      </UDashboardNavbar>

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
