<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { certificateSchema } from '#shared/schemas/certificate'

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const form = useTemplateRef('form')
const state = reactive({ certificate: '', privateKey: '' })
const { loading, withLoading } = useLoading()

async function onSubmit(event: FormSubmitEvent<z.output<typeof certificateSchema>>) {
  try {
    await withLoading(() => $fetch('/api/certificates', { method: 'POST', body: event.data }))
    toast.add({ title: 'Certificate uploaded', color: 'success' })
    emit('close', true)
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      form.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Uploading the certificate failed. Try again.', color: 'error' })
    }
  }
}
</script>

<template>
  <UModal
    title="Upload certificate"
    description="Use your own certificate, such as a wildcard or one from your company's CA. Services can then use the domains it covers."
    :ui="{ content: 'sm:max-w-2xl' }"
    :close="{ onClick: () => emit('close', false) }"
  >
    <template #body>
      <UForm
        id="upload-certificate"
        ref="form"
        :schema="certificateSchema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField
          label="Certificate"
          description="PEM format. Include the intermediate certificates after your certificate."
          name="certificate"
        >
          <UTextarea
            v-model="state.certificate"
            placeholder="-----BEGIN CERTIFICATE-----"
            :rows="6"
            class="w-full"
            :ui="{ base: 'font-mono text-xs' }"
          />
        </UFormField>

        <UFormField
          label="Private key"
          description="PEM format, without a passphrase."
          name="privateKey"
        >
          <UTextarea
            v-model="state.privateKey"
            placeholder="-----BEGIN PRIVATE KEY-----"
            :rows="6"
            class="w-full"
            :ui="{ base: 'font-mono text-xs' }"
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
        form="upload-certificate"
        label="Upload certificate"
        :loading="loading"
      />
    </template>
  </UModal>
</template>
