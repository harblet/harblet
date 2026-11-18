<script setup lang="ts">
import { LazyProjectsDeletionModal } from '#components'

const router = useRouter()
const id = computed(() => router.currentRoute.value.params.id as string)
const overlay = useOverlay()
const deletionModal = overlay.create(LazyProjectsDeletionModal)
const { data: project } = await useFetch(`/api/projects/${id.value}`, { key: `project-${id.value}` })
</script>

<template>
  <div class="mx-auto flex w-full flex-col gap-6 lg:max-w-2xl">
    <UPageCard
      title="Delete project"
      description="Deletes the project and all of its services, including their data. This can't be undone."
      class="bg-linear-to-tl from-error/10 from-5% to-default"
    >
      <template #footer>
        <UButton
          label="Delete project"
          color="error"
          @click="project && deletionModal.open({ project })"
        />
      </template>
    </UPageCard>
  </div>
</template>
