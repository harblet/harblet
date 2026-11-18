<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { s3DestinationSchema } from '#shared/schemas/backup-destination'

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const form = useTemplateRef('form')
const state = reactive({ name: '', endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretAccessKey: '' })
const { loading, withLoading } = useLoading()

async function onSubmit(event: FormSubmitEvent<z.output<typeof s3DestinationSchema>>) {
  try {
    await withLoading(() => $fetch('/api/backup-destinations', { method: 'POST', body: event.data }))
    toast.add({ title: 'Destination added', color: 'success' })
    emit('close', true)
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      form.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Adding the destination failed. Try again.', color: 'error' })
    }
  }
}
</script>

<template>
  <UModal
    title="Add S3 destination"
    description="Works with Amazon S3 and S3-compatible storage such as Cloudflare R2, Hetzner, Backblaze B2 and MinIO. Harblet writes a test file to check the connection."
    :close="{ onClick: () => emit('close', false) }"
  >
    <template #body>
      <UForm
        id="add-destination"
        ref="form"
        :schema="s3DestinationSchema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField
          label="Name"
          name="name"
        >
          <UInput
            v-model="state.name"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Endpoint"
          name="endpoint"
          help="Leave it empty for Amazon S3."
        >
          <UInput
            v-model="state.endpoint"
            placeholder="https://s3.example.com"
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </UFormField>

        <UFormField
          label="Region"
          name="region"
        >
          <UInput
            v-model="state.region"
            placeholder="eu-central-1"
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </UFormField>

        <UFormField
          label="Bucket"
          name="bucket"
        >
          <UInput
            v-model="state.bucket"
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </UFormField>

        <UFormField
          label="Folder"
          name="prefix"
          help="Leave it empty to store backups at the top level of the bucket."
        >
          <UInput
            v-model="state.prefix"
            placeholder="harblet/backups"
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </UFormField>

        <UFormField
          label="Access key ID"
          name="accessKeyId"
        >
          <UInput
            v-model="state.accessKeyId"
            autocomplete="off"
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </UFormField>

        <UFormField
          label="Secret access key"
          name="secretAccessKey"
        >
          <UInput
            v-model="state.secretAccessKey"
            type="password"
            autocomplete="off"
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        @click="emit('close', false)"
      />
      <UButton
        type="submit"
        form="add-destination"
        label="Add destination"
        :loading="loading"
      />
    </template>
  </UModal>
</template>
