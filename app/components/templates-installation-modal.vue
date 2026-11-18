<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'
import { domainSchema } from '#shared/schemas/domain'
import { databaseEngines } from '#shared/schemas/service'
import { templateNeedsDomain, templates } from '#shared/templates'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{ close: [boolean] }>()

const toast = useToast()
const form = useTemplateRef('form')
const state = reactive<{ template?: string, domain: string }>({ domain: '' })
const { loading, withLoading } = useLoading()

const items = templates.map(({ id, name, icon }) => ({ label: name, icon, value: id }))
const template = computed(() => templates.find(({ id }) => id === state.template))
const needsDomain = computed(() => !!template.value && templateNeedsDomain(template.value))
const schema = computed(() => z.object({
  template: z.string({ error: 'Choose a template' }),
  domain: needsDomain.value ? domainSchema.shape.hostname : z.literal('').or(domainSchema.shape.hostname)
}))
watch(() => state.template, () => form.value?.clear('domain'))

const services = computed(() => Object.values(template.value?.services ?? {}).map(service => ({
  name: service.name,
  source: service.type === 'image' ? service.image : `${databaseEngines[service.type].label} ${service.version}`
})))

async function onSubmit(event: FormSubmitEvent<{ template: string, domain: string }>) {
  try {
    await withLoading(() => $fetch(`/api/projects/${props.projectId}/templates`, { method: 'POST', body: event.data }))
    emit('close', true)
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      form.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Installing the template failed. Try again.', color: 'error' })
    }
  }
}
</script>

<template>
  <UModal
    title="New from template"
    description="Adds a ready-made app to this project and deploys it right away."
    :close="{ onClick: () => emit('close', false) }"
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <UForm
        id="new-template"
        ref="form"
        :schema="schema"
        :state="state"
        class="grid gap-4 sm:grid-cols-[14rem_1fr] sm:gap-6"
        @submit="onSubmit"
      >
        <UFormField name="template">
          <URadioGroup
            v-model="state.template"
            :items="items"
            variant="card"
            :ui="{ fieldset: 'grid grid-cols-2 gap-2 sm:grid-cols-1' }"
          >
            <template #label="{ item }">
              <span class="flex items-center gap-2">
                <UIcon
                  :name="item.icon"
                  class="size-5"
                />
                {{ item.label }}
              </span>
            </template>
          </URadioGroup>
        </UFormField>

        <div
          v-if="template"
          class="flex min-w-0 flex-col gap-4"
        >
          <p class="text-sm text-muted">
            {{ template.description }}
          </p>

          <UFormField label="Services">
            <ul class="divide-y divide-default rounded-md border border-default text-sm">
              <li
                v-for="service in services"
                :key="service.name"
                class="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span class="font-medium text-highlighted">{{ service.name }}</span>
                <span class="truncate font-mono text-muted">{{ service.source }}</span>
              </li>
            </ul>

            <template #help>
              Added to this project.
              <ULink
                :to="template.website"
                target="_blank"
                class="text-primary"
              >
                About {{ template.name }}
              </ULink>
            </template>
          </UFormField>

          <UFormField
            v-if="template.domain"
            label="Domain"
            name="domain"
            :hint="needsDomain ? undefined : 'Optional'"
            :help="needsDomain ? `${template.name} has to know its address. Point the domain at your server with a DNS A record. It needs an uploaded SSL certificate that covers it.` : 'You can also add it later under the service\'s Domains. A domain needs an uploaded SSL certificate that covers it.'"
          >
            <UInput
              v-model="state.domain"
              placeholder="app.example.com"
              class="w-full"
            />
          </UFormField>

          <UAlert
            v-if="template.note"
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            :description="template.note"
          />
        </div>

        <p
          v-else
          class="text-sm text-muted"
        >
          Choose a template to see what it installs.
        </p>
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
        form="new-template"
        label="Install"
        :disabled="!template"
        :loading="loading"
      />
    </template>
  </UModal>
</template>
