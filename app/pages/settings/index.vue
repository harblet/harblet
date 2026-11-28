<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { domainSchema } from '#shared/schemas/domain'

useHead({ title: 'Settings' })

const toast = useToast()
const { siteUrl } = useRuntimeConfig().public
const { protocol, hostname } = new URL(siteUrl)

const form = useTemplateRef('form')
const state = reactive({ hostname: protocol === 'https:' ? hostname : '' })
const movedTo = ref<string>()
const { loading, withLoading } = useLoading()

const { data: update } = useLazyFetch('/api/settings/update', { key: 'update', server: false })
const updatingTo = ref<string>()
const restarting = ref(false)
const { loading: startingUpdate, withLoading: withStartingUpdate } = useLoading()

watch(update, (value) => {
  if (value?.update && !value.update.error) {
    updatingTo.value = value.update.version
  }
}, { immediate: true })

onMounted(() => {
  const timer = setInterval(async () => {
    if (!updatingTo.value || update.value?.update?.error) {
      return
    }
    const status = await $fetch('/api/settings/update', { timeout: 2000 }).catch(() => undefined)
    restarting.value = !status
    if (status?.version === updatingTo.value) {
      reloadNuxtApp()
    } else if (status && (!status.update || status.update.error)) {
      if (!status.update) {
        updatingTo.value = undefined
      }
      update.value = status
    }
  }, 2000)
  onBeforeUnmount(() => clearInterval(timer))
})

async function startUpdate() {
  try {
    await withStartingUpdate(() => $fetch('/api/settings/update', { method: 'POST' }))
    updatingTo.value = update.value?.latest?.version
    update.value = update.value && { ...update.value, update: undefined }
  } catch (e) {
    toast.add({ title: (e as { data?: { message?: string } }).data?.message ?? 'Starting the update failed. Try again.', color: 'error' })
  }
}

async function onSubmit(event: FormSubmitEvent<z.output<typeof domainSchema>>) {
  try {
    await withLoading(() => $fetch('/api/settings/domain', { method: 'PUT', body: event.data }))
    movedTo.value = `https://${event.data.hostname}`
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      form.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Changing the domain failed. Try again.', color: 'error' })
    }
  }
}
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Settings" />
    </template>

    <template #body>
      <div class="mx-auto flex w-full flex-col gap-4 lg:max-w-3xl">
        <UForm
          ref="form"
          :schema="domainSchema"
          :state="state"
          class="flex flex-col gap-4"
          @submit="onSubmit"
        >
          <UPageCard
            title="Domain"
            :description="`Harblet is reached at ${siteUrl}. To use your own domain, point it at this server with a DNS A record and upload its certificate under SSL Certificates. Saving restarts Harblet, and everyone logs in again at the new address.`"
            variant="naked"
            orientation="horizontal"
          >
            <UButton
              type="submit"
              label="Save"
              :loading="loading"
              :disabled="!!movedTo"
              class="w-fit lg:ms-auto"
            />
          </UPageCard>

          <UAlert
            v-if="movedTo"
            color="success"
            variant="subtle"
            icon="i-lucide-circle-check"
            :title="`Harblet is moving to ${movedTo}`"
            description="It restarts now and is ready in a few seconds."
            :actions="[{ label: `Open ${movedTo}`, to: movedTo }]"
          />

          <UPageCard
            v-else
            variant="subtle"
          >
            <UFormField
              label="Domain"
              name="hostname"
            >
              <UInput
                v-model="state.hostname"
                placeholder="harblet.example.com"
                class="w-full"
              />
            </UFormField>
          </UPageCard>
        </UForm>

        <UPageCard
          title="Updates"
          description="Updating restarts Harblet for a few seconds. Your services keep running."
          variant="naked"
          orientation="horizontal"
        >
          <UButton
            v-if="update?.available"
            :label="`Update to ${update.latest?.version}`"
            :loading="startingUpdate || !!updatingTo"
            class="w-fit lg:ms-auto"
            @click="startUpdate"
          />
        </UPageCard>

        <UAlert
          v-if="update?.update?.error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="`Updating to ${update.update.version} failed`"
          :description="update.update.error"
        />

        <UPageCard
          v-if="update"
          :title="`Harblet ${update.version}`"
          :description="!update.latest ? 'Checking for a newer version failed. Harblet asks api.github.com for it.' : update.available ? `Version ${update.latest.version} is available.` : 'This is the newest version.'"
          variant="subtle"
          orientation="horizontal"
        >
          <UButton
            v-if="update.available"
            label="Release notes"
            :to="update.latest?.url"
            target="_blank"
            color="neutral"
            variant="outline"
            trailing-icon="i-lucide-arrow-up-right"
            class="w-fit lg:ms-auto"
          />
        </UPageCard>
      </div>

      <UModal
        :open="!!updatingTo"
        :title="update?.update?.error ? `Updating to ${updatingTo} failed` : `Updating Harblet to ${updatingTo}`"
        :description="update?.update?.error ?? 'Your services keep running. This page reloads when it\'s ready.'"
        :dismissible="false"
        :close="false"
      >
        <template
          v-if="!update?.update?.error"
          #body
        >
          <div class="flex flex-col gap-3 text-sm">
            <div class="flex items-center gap-2">
              <UIcon
                :name="restarting ? 'i-lucide-circle-check' : 'i-lucide-loader-circle'"
                class="size-5 shrink-0"
                :class="restarting ? 'text-success' : 'animate-spin text-primary'"
              />
              Downloading version {{ updatingTo }}
            </div>
            <div
              class="flex items-center gap-2"
              :class="{ 'text-dimmed': !restarting }"
            >
              <UIcon
                :name="restarting ? 'i-lucide-loader-circle' : 'i-lucide-circle'"
                class="size-5 shrink-0"
                :class="{ 'animate-spin text-primary': restarting }"
              />
              Restarting Harblet
            </div>
          </div>
        </template>

        <template
          v-else
          #footer
        >
          <UButton
            label="Close"
            color="neutral"
            variant="outline"
            @click="updatingTo = undefined"
          />
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
