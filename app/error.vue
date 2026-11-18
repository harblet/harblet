<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

useHead({ title: () => `${props.error.statusMessage || 'Error'} · Harblet` })
</script>

<template>
  <UApp>
    <UError :error="error" />
  </UApp>
</template>
