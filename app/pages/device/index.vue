<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useHead({ title: 'Log in to the CLI' })

const route = useRoute()
const userCode = computed(() => route.query.user_code as string | undefined)
const { user } = useUserSession()
const { data: device } = await useFetch<{ status: 'pending' | 'approved' | 'denied' }>('/api/auth/device', { query: { user_code: userCode } })

const decision = ref<'approve' | 'deny'>()
const decided = ref<'approve' | 'deny'>()
const error = ref<string>()

const outcome = computed(() => {
  if (decided.value === 'approve') {
    return { title: 'The CLI is logged in', description: 'Go back to your terminal. You can close this page.' }
  }
  if (decided.value === 'deny') {
    return { title: 'Login denied', description: 'The CLI wasn\'t logged in. You can close this page.' }
  }
  if (device.value?.status !== 'pending') {
    return { title: 'This login link isn\'t valid', description: 'The code was already used, was denied or has expired. Run harblet login again for a new one.' }
  }
  return undefined
})

async function decide(choice: 'approve' | 'deny') {
  error.value = undefined
  decision.value = choice
  const client = useAuthClient()!
  const { error: failure } = choice === 'approve'
    ? await client.device.approve({ userCode: userCode.value! })
    : await client.device.deny({ userCode: userCode.value! })
  decision.value = undefined
  if (failure) {
    error.value = 'This didn\'t work. The code may have expired. Run harblet login again for a new one.'
  } else {
    decided.value = choice
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight text-pretty text-highlighted">
        {{ outcome?.title ?? 'Log in to the Harblet CLI' }}
      </h1>
      <p class="mt-1 text-sm text-pretty text-muted">
        {{ outcome?.description ?? `The CLI asks to log in as ${user?.name}. Approve only if your terminal shows this code.` }}
      </p>
    </div>

    <template v-if="!outcome">
      <p class="rounded-lg border border-default bg-elevated/50 py-4 text-center font-mono text-2xl font-semibold tracking-[0.3em] text-highlighted">
        {{ userCode }}
      </p>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="error"
      />

      <div class="flex flex-col gap-3">
        <UButton
          label="Approve"
          size="lg"
          block
          :loading="decision === 'approve'"
          :disabled="decision !== undefined"
          @click="decide('approve')"
        />
        <UButton
          label="Deny"
          size="lg"
          color="neutral"
          variant="outline"
          block
          :loading="decision === 'deny'"
          :disabled="decision !== undefined"
          @click="decide('deny')"
        />
      </div>
    </template>
  </div>
</template>
