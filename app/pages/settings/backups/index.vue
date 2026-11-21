<script setup lang="ts">
useHead({ title: 'Backups' })

const toast = useToast()
const { copy } = useCopy()

const appSecret = ref<string>()
const appSecretShown = ref(false)
const restoreCommand = 'sudo HARBLET_APP_SECRET=YOUR_APP_SECRET HARBLET_BACKUP=backup.dump sh install.sh'

async function loadAppSecret() {
  try {
    appSecret.value ??= (await $fetch('/api/settings/app-secret')).appSecret
  } catch {
    toast.add({ title: 'Loading the app secret failed. Try again.', color: 'error' })
  }
  return appSecret.value
}

async function toggleAppSecret() {
  appSecretShown.value = !appSecretShown.value && !!await loadAppSecret()
}

async function copyAppSecret() {
  const secret = await loadAppSecret()
  if (secret) {
    await copy(secret)
  }
}
</script>

<template>
  <UDashboardPanel id="settings-backups">
    <template #header>
      <UDashboardNavbar title="Backups" />
    </template>

    <template #body>
      <div class="mx-auto flex w-full flex-col gap-4 lg:max-w-3xl">
        <BackupsPanel
          api="/api/settings"
          description="Harblet dumps its own database, which holds the accounts, projects, services and their settings, and stores the file at the destination."
        />

        <UPageCard
          title="App secret"
          description="Harblet encrypts environment variables, database passwords, private keys and access keys with the app secret of this install. The secret isn't in the backup, and a backup restored on a new server can't read these values without it. Keep a copy somewhere safe."
          variant="naked"
        />

        <UPageCard variant="subtle">
          <UInput
            :model-value="appSecretShown ? appSecret : '•'.repeat(32)"
            readonly
            aria-label="App secret"
            class="w-full"
            :ui="{ base: 'font-mono', trailing: 'pe-1' }"
          >
            <template #trailing>
              <UButton
                :icon="appSecretShown ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                color="neutral"
                variant="link"
                size="sm"
                :aria-label="appSecretShown ? 'Hide app secret' : 'Show app secret'"
                @click="toggleAppSecret"
              />
              <UButton
                icon="i-lucide-copy"
                color="neutral"
                variant="link"
                size="sm"
                aria-label="Copy app secret"
                @click="copyAppSecret"
              />
            </template>
          </UInput>
        </UPageCard>

        <UPageCard
          title="Restore"
          description="A backup is restored while Harblet is installed on a fresh server. Take the newest file from the folder harblet-system/postgres at the destination, copy it to the new server as backup.dump and run the install script there with the app secret and the file. Services and databases aren't started again by the restore."
          variant="naked"
        />

        <UPageCard variant="subtle">
          <UInput
            :model-value="restoreCommand"
            readonly
            aria-label="Install command that restores the backup"
            class="w-full"
            :ui="{ base: 'font-mono text-xs', trailing: 'pe-1' }"
          >
            <template #trailing>
              <UButton
                icon="i-lucide-copy"
                color="neutral"
                variant="link"
                size="sm"
                aria-label="Copy command"
                @click="copy(restoreCommand)"
              />
            </template>
          </UInput>
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
