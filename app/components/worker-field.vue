<script setup lang="ts">
const worker = defineModel<boolean | undefined>({ required: true })

const items = [
  { label: 'Web service', description: 'Takes requests and can have domains.', value: 'web' },
  { label: 'Worker', description: 'Runs in the background without taking requests.', value: 'worker' }
]
</script>

<template>
  <UFormField
    label="Type"
    name="worker"
  >
    <URadioGroup
      :model-value="worker ? 'worker' : 'web'"
      :items="items"
      variant="card"
      orientation="horizontal"
      :ui="{ item: 'flex-1' }"
      @update:model-value="worker = $event === 'worker'"
    />
  </UFormField>
</template>
