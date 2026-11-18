<script setup lang="ts">
const router = useRouter()
const id = computed(() => router.currentRoute.value.params.id as string)
const { data: service } = await useFetch(`/api/services/${id.value}`, { key: `service-${id.value}` })
</script>

<template>
  <div class="mx-auto flex w-full flex-col gap-4 lg:max-w-3xl">
    <BackupsPanel
      :api="`/api/services/${id}`"
      description="Harblet dumps the database and stores the file at the destination."
      :type="service?.type"
    />
  </div>
</template>
