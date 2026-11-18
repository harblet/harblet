<script setup lang="ts">
useHead({
  titleTemplate: title => title ? `${title} · Harblet` : 'Harblet'
})
</script>

<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
