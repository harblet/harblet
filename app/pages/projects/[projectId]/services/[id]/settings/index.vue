<script setup lang="ts">
import type { FormError, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { databaseSettingsSchema, gitSettingsSchema, instancesSchema, isDatabase, serviceSettingsSchema } from '#shared/schemas/service'
import { LazyDeployHookRegenerationModal, LazyServicesDeletionModal } from '#components'

const router = useRouter()
const id = computed(() => router.currentRoute.value.params.id as string)
const toast = useToast()
const overlay = useOverlay()
const deletionModal = overlay.create(LazyServicesDeletionModal)
const regenerationModal = overlay.create(LazyDeployHookRegenerationModal)
const { siteUrl } = useRuntimeConfig().public
const { data: service, refresh } = await useFetch(`/api/services/${id.value}`, { key: `service-${id.value}` })
const { data: volumes } = await useFetch(`/api/services/${id.value}/volumes`, { key: `volumes-${id.value}` })
const database = computed(() => !!service.value && isDatabase(service.value.type))
const git = computed(() => service.value?.type === 'git')
const schema = computed(() => database.value ? databaseSettingsSchema : git.value ? gitSettingsSchema : serviceSettingsSchema)
const deployHookFields = computed(() => {
  if (!service.value) {
    return []
  }
  const url = new URL(`/api/hooks/${service.value.deployHookToken}`, siteUrl).href
  return [{ label: 'URL', value: url }, { label: 'Command', value: `curl --fail -X POST ${url}` }]
})

async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.add({ title: 'Copied', color: 'success' })
  } catch {
    toast.add({ title: 'Copying failed. Copy it by hand.', color: 'error' })
  }
}

async function regenerateDeployHook() {
  if (service.value && await regenerationModal.open({ service: service.value }).result) {
    await refresh()
  }
}

const form = useTemplateRef('form')
const state = reactive<{
  name: string
  image: string
  repository: string
  gitConnectionId?: string | null
  branch: string
  rootDirectory: string
  dockerfilePath: string
  port?: number | null
  command: string
  healthCheckPath?: string | null
  startTimeout?: number
}>({ name: '', image: '', repository: '', branch: '', rootDirectory: '', dockerfilePath: '', command: '' })
const { loading, withLoading } = useLoading()
const instancesForm = useTemplateRef('instancesForm')
const instancesState = reactive<{ instances?: number }>({})
const { loading: scaling, withLoading: withScaling } = useLoading()

watch(service, (value) => {
  instancesState.instances = value?.instances
  Object.assign(state, {
    name: value?.name ?? '',
    image: value?.image ?? '',
    repository: value?.repository ?? '',
    gitConnectionId: value?.gitConnectionId ?? null,
    branch: value?.branch ?? '',
    rootDirectory: value?.rootDirectory ?? '',
    dockerfilePath: value?.dockerfilePath ?? '',
    port: value?.port,
    command: value?.command ?? '',
    healthCheckPath: value?.healthCheckPath ?? '',
    startTimeout: value?.startTimeout
  })
}, { immediate: true })

async function onSubmit(event: FormSubmitEvent<z.output<typeof serviceSettingsSchema> | z.output<typeof gitSettingsSchema> | z.output<typeof databaseSettingsSchema>>) {
  try {
    await withLoading(async () => {
      await $fetch(`/api/services/${id.value}`, { method: 'PATCH', body: event.data })
      await refresh()
    })
    toast.add({ title: 'Settings saved', description: database.value ? undefined : 'Deploy the service to apply them.', color: 'success' })
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      form.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Saving the settings failed. Try again.', color: 'error' })
    }
  }
}

async function onInstancesSubmit(event: FormSubmitEvent<z.output<typeof instancesSchema>>) {
  try {
    await withScaling(() => $fetch(`/api/services/${id.value}/instances`, { method: 'PUT', body: event.data }))
    toast.add({ title: 'Instances saved', color: 'success' })
  } catch (e) {
    const data = (e as { data?: { message?: string, data?: { errors?: FormError[] } } }).data
    if (data?.data?.errors) {
      instancesForm.value?.setErrors(data.data.errors)
    } else {
      toast.add({ title: data?.message ?? 'Saving the instances failed. Try again.', color: 'error' })
    }
  }
}
</script>

<template>
  <div class="mx-auto flex w-full flex-col gap-4 lg:max-w-3xl">
    <UForm
      ref="form"
      :schema="schema"
      :state="state"
      class="flex flex-col gap-4"
      @submit="onSubmit"
    >
      <UPageCard
        title="Settings"
        :description="database ? undefined : git ? 'Changes to the repository, port, health check and start timeout apply on the next deployment.' : 'Changes to the image, start command, port, health check and start timeout apply on the next deployment.'"
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

      <UPageCard variant="subtle">
        <UFormField
          label="Name"
          name="name"
        >
          <UInput
            v-model="state.name"
            placeholder="Web"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="database"
          label="Version"
          help="Deploying restarts the database briefly and updates it to the newest patch release of this version."
        >
          <UInput
            :model-value="service?.image ?? ''"
            disabled
            class="w-full"
            :ui="{ base: 'font-mono' }"
          />
        </UFormField>

        <template v-else>
          <template v-if="git">
            <RepositoryField
              v-model:repository="state.repository"
              v-model:git-connection-id="state.gitConnectionId"
              v-model:branch="state.branch"
            />

            <UFormField
              label="Branch"
              name="branch"
            >
              <UInput
                v-model="state.branch"
                placeholder="main"
                class="w-full"
                :ui="{ base: 'font-mono' }"
              />
            </UFormField>

            <UFormField
              label="Root directory"
              name="rootDirectory"
              help="Where your app lives in the repository. Leave it empty for the top level."
            >
              <UInput
                v-model="state.rootDirectory"
                placeholder="apps/web"
                class="w-full"
                :ui="{ base: 'font-mono' }"
              />
            </UFormField>

            <UFormField
              label="Dockerfile path"
              name="dockerfilePath"
              help="Relative to the root directory. Leave it empty to use a Dockerfile in the root directory if there is one, or Railpack if there isn't."
            >
              <UInput
                v-model="state.dockerfilePath"
                placeholder="Dockerfile"
                class="w-full"
                :ui="{ base: 'font-mono' }"
              />
            </UFormField>
          </template>

          <UFormField
            v-else
            label="Image"
            name="image"
            help="The Docker image to run, with its tag."
          >
            <UInput
              v-model="state.image"
              placeholder="nginx:latest"
              class="w-full"
              :ui="{ base: 'font-mono' }"
            />
          </UFormField>

          <UFormField
            v-if="!git"
            label="Start command"
            name="command"
            help="Runs instead of the image's default command, after its entrypoint. Leave it empty to use the image's own."
          >
            <UInput
              v-model="state.command"
              placeholder="npm run worker"
              class="w-full"
              :ui="{ base: 'font-mono' }"
            />
          </UFormField>

          <UFormField
            label="Port"
            name="port"
            :help="git ? 'The port your app listens on. Harblet passes it as PORT. Leave it empty if it doesn\'t take requests.' : 'The port your app listens on. Leave it empty if it doesn\'t take requests.'"
          >
            <UInputNumber
              v-model="state.port"
              :min="1"
              :max="65535"
              :increment="false"
              :decrement="false"
              :format-options="{ useGrouping: false }"
              placeholder="80"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Health check path"
            name="healthCheckPath"
            help="A new deployment gets traffic once this path answers with a 2xx or 3xx status. Leave it empty to only check that the port accepts connections."
          >
            <UInput
              v-model="state.healthCheckPath"
              placeholder="/health"
              class="w-full"
              :ui="{ base: 'font-mono' }"
            />
          </UFormField>

          <UFormField
            label="Start timeout"
            name="startTimeout"
            help="How many minutes a deployment may take to become ready before it fails."
          >
            <UInputNumber
              v-model="state.startTimeout"
              :min="1"
              :max="60"
              :increment="false"
              :decrement="false"
              class="w-full"
            />
          </UFormField>
        </template>
      </UPageCard>
    </UForm>

    <template v-if="service && !database">
      <UForm
        ref="instancesForm"
        :schema="instancesSchema"
        :state="instancesState"
        class="flex flex-col gap-4"
        @submit="onInstancesSubmit"
      >
        <UPageCard
          title="Instances"
          description="How many copies of the service run at the same time. Harblet spreads them across your servers where it can and shares requests between them. A change applies right away, without a deployment."
          variant="naked"
          orientation="horizontal"
        >
          <UButton
            type="submit"
            label="Save"
            :loading="scaling"
            :disabled="!!volumes?.length"
            class="w-fit lg:ms-auto"
          />
        </UPageCard>

        <UPageCard variant="subtle">
          <UFormField
            label="Instances"
            name="instances"
            :help="volumes?.length ? 'A service with volumes runs as one instance, because its files live on one server.' : undefined"
          >
            <UInputNumber
              v-model="instancesState.instances"
              :min="1"
              :max="10"
              :disabled="!!volumes?.length"
              class="w-full"
            />
          </UFormField>
        </UPageCard>
      </UForm>

      <UPageCard
        title="Deploy hook"
        description="Send a POST request to this URL to deploy the service, for example at the end of your CI pipeline. Anyone with the URL can deploy, so store it as a secret."
        variant="naked"
        orientation="horizontal"
      >
        <UButton
          label="Regenerate"
          color="neutral"
          variant="outline"
          class="w-fit lg:ms-auto"
          @click="regenerateDeployHook"
        />
      </UPageCard>

      <UPageCard variant="subtle">
        <UFormField
          v-for="field in deployHookFields"
          :key="field.label"
          :label="field.label"
        >
          <UInput
            :model-value="field.value"
            readonly
            class="w-full"
            :ui="{ base: 'font-mono', trailing: 'pe-1' }"
          >
            <template #trailing>
              <UButton
                icon="i-lucide-copy"
                color="neutral"
                variant="link"
                size="sm"
                :aria-label="`Copy ${field.label}`"
                @click="copy(field.value)"
              />
            </template>
          </UInput>
        </UFormField>
      </UPageCard>
    </template>

    <UPageCard
      title="Delete service"
      :description="database ? 'Deletes the database with all its data and its deployments. This can\'t be undone.' : 'Deletes the service, its domains, environment variables and deployments. This can\'t be undone.'"
      class="bg-linear-to-tl from-error/10 from-5% to-default"
    >
      <template #footer>
        <UButton
          label="Delete service"
          color="error"
          @click="service && deletionModal.open({ service })"
        />
      </template>
    </UPageCard>
  </div>
</template>
