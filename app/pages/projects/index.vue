<script setup lang="ts">
import { LazyProjectsCreationModal } from '#components'

useHead({ title: 'Projects' })

const overlay = useOverlay()
const creationModal = overlay.create(LazyProjectsCreationModal)
const { data: projects, error } = await useFetch('/api/projects')

if (error.value) {
  throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.data?.message ?? 'Loading projects failed.', fatal: true })
}

function serviceCount(count: number) {
  if (count === 0) {
    return 'No services'
  }
  return count === 1 ? '1 service' : `${count} services`
}
</script>

<template>
  <UDashboardPanel id="projects">
    <template #header>
      <UDashboardNavbar title="Projects">
        <template #right>
          <UButton
            label="New project"
            icon="i-lucide-plus"
            @click="creationModal.open()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UPageGrid v-if="projects?.length">
        <UPageCard
          v-for="project in projects"
          :key="project.id"
          :title="project.name"
          :description="serviceCount(project.services.length)"
          icon="i-lucide-box"
          :to="`/projects/${project.id}`"
        />
      </UPageGrid>

      <UEmpty
        v-else
        icon="i-lucide-boxes"
        title="No projects yet"
        description="Create a project to start deploying services."
        :actions="[{ label: 'New project', icon: 'i-lucide-plus', onClick: () => creationModal.open() }]"
      />
    </template>
  </UDashboardPanel>
</template>
