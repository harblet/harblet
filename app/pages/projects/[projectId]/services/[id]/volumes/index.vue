<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { volumeSchema } from '#shared/schemas/volume'
import { LazyVolumesDeletionModal } from '#components'

const router = useRouter()
const id = computed(() => router.currentRoute.value.params.id as string)
const toast = useToast()
const overlay = useOverlay()
const deletionModal = overlay.create(LazyVolumesDeletionModal)
const { data: volumes, error, refresh } = await useFetch(`/api/services/${id.value}/volumes`, { key: `volumes-${id.value}` })

if (error.value) {
  throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.data?.message, fatal: true })
}

type Volume = NonNullable<typeof volumes.value>[number]

const form = useTemplateRef('form')
const state = reactive({ mountPath: '' })
const { loading, withLoading } = useLoading()

async function onSubmit(event: FormSubmitEvent<z.output<typeof volumeSchema>>) {
  try {
    await withLoading(async () => {
      await $fetch(`/api/services/${id.value}/volumes`, { method: 'POST', body: event.data })
      await refresh()
    })
    state.mountPath = ''
    toast.add({ title: 'Volume added', description: 'Deploy the service to apply it.', color: 'success' })
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      form.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Adding the volume failed. Try again.', color: 'error' })
    }
  }
}

async function removeVolume(volume: Volume) {
  if (await deletionModal.open({ volume }).result) {
    await refresh()
  }
}
</script>

<template>
  <div class="mx-auto flex w-full flex-col gap-4 lg:max-w-3xl">
    <UPageCard
      title="Volumes"
      description="Files a service writes are lost with every deployment and restart, unless their folder is a volume. A service with volumes stays on one server and stops briefly during a deployment. Changes apply on the next deployment."
      variant="naked"
    />

    <UPageCard variant="subtle">
      <UForm
        ref="form"
        :schema="volumeSchema"
        :state="state"
        class="flex items-start gap-2"
        @submit="onSubmit"
      >
        <UFormField
          name="mountPath"
          class="flex-1"
        >
          <UInput
            v-model="state.mountPath"
            placeholder="/data"
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </UFormField>
        <UButton
          type="submit"
          label="Add volume"
          icon="i-lucide-plus"
          :loading="loading"
        />
      </UForm>

      <ul
        v-if="volumes?.length"
        class="divide-y divide-default"
      >
        <li
          v-for="volume in volumes"
          :key="volume.id"
          class="flex items-center gap-3 py-2"
        >
          <span class="flex-1 truncate font-mono text-sm text-highlighted">
            {{ volume.mountPath }}
          </span>
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            aria-label="Remove volume"
            @click="removeVolume(volume)"
          />
        </li>
      </ul>

      <p
        v-else
        class="text-sm text-muted"
      >
        No volumes yet.
      </p>
    </UPageCard>
  </div>
</template>
