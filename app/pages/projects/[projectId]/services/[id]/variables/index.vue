<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { variablesSchema } from '#shared/schemas/variable'

const router = useRouter()
const id = computed(() => router.currentRoute.value.params.id as string)
const toast = useToast()
const { data: variables, error, refresh } = await useFetch(`/api/services/${id.value}/variables`, { key: `variables-${id.value}` })

if (error.value) {
  throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.data?.message, fatal: true })
}

const form = useTemplateRef('form')
const state = reactive<{ variables: { key: string, value: string, shown: boolean }[] }>({ variables: [] })
const { loading, withLoading } = useLoading()

watch(variables, (value) => {
  state.variables = value?.map(variable => ({ ...variable, shown: false })) ?? []
}, { immediate: true })

watch(() => state.variables.map(({ key }) => key), async () => {
  const names = form.value?.getErrors().flatMap(({ name }) => name?.endsWith('.key') ? [name] : []) ?? []
  if (names.length) {
    await form.value?.validate({ name: names, silent: true })
  }
})

function onAdd() {
  state.variables.push({ key: '', value: '', shown: true })
}

async function onRemove(index: number) {
  state.variables.splice(index, 1)
  const names = form.value?.getErrors().flatMap(({ name }) => {
    const match = name?.match(/^variables\.(\d+)\.(.+)$/)
    if (!match || Number(match[1]) === index) {
      return []
    }
    const row = Number(match[1])
    return [`variables.${row > index ? row - 1 : row}.${match[2]}`]
  }) ?? []
  form.value?.clear()
  if (names.length) {
    await form.value?.validate({ name: names, silent: true })
  }
}

async function onSubmit(event: FormSubmitEvent<z.output<typeof variablesSchema>>) {
  try {
    await withLoading(async () => {
      await $fetch(`/api/services/${id.value}/variables`, { method: 'PUT', body: event.data })
      await refresh()
    })
    toast.add({ title: 'Variables saved', description: 'Deploy the service to apply them.', color: 'success' })
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      form.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Saving the variables failed. Try again.', color: 'error' })
    }
  }
}
</script>

<template>
  <UForm
    ref="form"
    :schema="variablesSchema"
    :state="state"
    class="mx-auto flex w-full flex-col gap-4 lg:max-w-3xl"
    @submit="onSubmit"
  >
    <UPageCard
      title="Environment variables"
      description="Your service reads them at runtime. Changes apply on the next deployment."
      variant="naked"
      orientation="horizontal"
    >
      <UButton
        type="submit"
        label="Save"
        :loading="loading"
        class="w-fit lg:ms-auto"
      />
    </UPageCard>

    <UPageCard
      v-if="state.variables.length"
      variant="subtle"
    >
      <div class="flex flex-col gap-2">
        <div
          v-for="(variable, index) in state.variables"
          :key="index"
          class="flex items-start gap-2"
        >
          <UFormField
            :name="`variables.${index}.key`"
            class="flex-1"
          >
            <UInput
              v-model="variable.key"
              placeholder="KEY"
              class="w-full"
              :ui="{ base: 'font-mono' }"
            />
          </UFormField>
          <UFormField
            :name="`variables.${index}.value`"
            class="flex-2"
          >
            <UTextarea
              v-if="variable.shown"
              v-model="variable.value"
              placeholder="value"
              :rows="1"
              autoresize
              class="w-full"
              :ui="{ base: 'font-mono' }"
            />
            <UInput
              v-else
              model-value="••••••••••••"
              readonly
              class="w-full"
              :ui="{ base: 'font-mono' }"
            />
          </UFormField>
          <UButton
            :icon="variable.shown ? 'i-lucide-eye-off' : 'i-lucide-eye'"
            color="neutral"
            variant="ghost"
            :aria-label="variable.shown ? 'Hide value' : 'Show value'"
            @click="variable.shown = !variable.shown"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            aria-label="Remove variable"
            @click="onRemove(index)"
          />
        </div>
      </div>

      <UButton
        label="Add variable"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        class="w-fit"
        @click="onAdd"
      />
    </UPageCard>

    <UEmpty
      v-else
      icon="i-lucide-braces"
      title="No environment variables"
      description="Add API keys, database URLs and other settings your service needs."
      :actions="[{ label: 'Add variable', icon: 'i-lucide-plus', onClick: onAdd }]"
    />
  </UForm>
</template>
