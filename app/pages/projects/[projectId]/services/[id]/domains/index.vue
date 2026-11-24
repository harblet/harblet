<script setup lang="ts">
import type { BadgeProps, FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { domainSchema } from '#shared/schemas/domain'
import { LazyDomainsDeletionModal } from '#components'

const router = useRouter()
const id = computed(() => router.currentRoute.value.params.id as string)
const toast = useToast()
const overlay = useOverlay()
const deletionModal = overlay.create(LazyDomainsDeletionModal)
const { data: service } = await useFetch(`/api/services/${id.value}`, { key: `service-${id.value}` })
const { data: domains, error, refresh } = await useFetch(`/api/services/${id.value}/domains`, { key: `domains-${id.value}` })

if (error.value) {
  throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.data?.message, fatal: true })
}

type Domain = NonNullable<typeof domains.value>[number]

const form = useTemplateRef('form')
const state = reactive({ hostname: '' })
const { loading, withLoading } = useLoading()

async function onSubmit(event: FormSubmitEvent<z.output<typeof domainSchema>>) {
  try {
    await withLoading(async () => {
      await $fetch(`/api/services/${id.value}/domains`, { method: 'POST', body: event.data })
      await refresh()
    })
    state.hostname = ''
    toast.add({ title: 'Domain added', color: 'success' })
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      form.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Adding the domain failed. Try again.', color: 'error' })
    }
  }
}

async function removeDomain(domain: Domain) {
  if (await deletionModal.open({ domain }).result) {
    await refresh()
  }
}

function certificateBadge(certificate: Domain['certificate']): BadgeProps {
  return certificate
    ? { label: `${certificate.issuer} certificate`, icon: 'i-lucide-shield-check', color: 'neutral' }
    : { label: 'No certificate', icon: 'i-lucide-shield-alert', color: 'error' }
}
</script>

<template>
  <div class="mx-auto flex w-full flex-col gap-4 lg:max-w-3xl">
    <UPageCard
      title="Domains"
      description="Point your domain at your server with a DNS A record, then add it here. A domain needs an uploaded SSL certificate that covers it."
      variant="naked"
    />

    <UAlert
      v-if="service?.worker"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="This service is a worker"
      description="Workers don't take requests, so they can't have domains. To add one, make the service a web service in its settings."
    />

    <UPageCard
      v-else
      variant="subtle"
    >
      <UForm
        ref="form"
        :schema="domainSchema"
        :state="state"
        class="flex items-start gap-2"
        @submit="onSubmit"
      >
        <UFormField
          name="hostname"
          class="flex-1"
        >
          <UInput
            v-model="state.hostname"
            placeholder="app.example.com"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          label="Add domain"
          icon="i-lucide-plus"
          :loading="loading"
        />
      </UForm>

      <ul
        v-if="domains?.length"
        class="divide-y divide-default"
      >
        <li
          v-for="domain in domains"
          :key="domain.id"
          class="flex items-center gap-3 py-2"
        >
          <ULink
            :to="`https://${domain.hostname}`"
            target="_blank"
            class="flex-1 truncate font-medium text-highlighted"
          >
            {{ domain.hostname }}
          </ULink>
          <UBadge
            v-bind="certificateBadge(domain.certificate)"
            variant="subtle"
          />
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            aria-label="Remove domain"
            @click="removeDomain(domain)"
          />
        </li>
      </ul>

      <p
        v-else
        class="text-sm text-muted"
      >
        No domains yet.
      </p>
    </UPageCard>
  </div>
</template>
