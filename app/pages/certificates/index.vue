<script setup lang="ts">
import type { BadgeProps, TableColumn } from '@nuxt/ui'
import { LazyCertificatesDeletionModal, LazyCertificatesUploadModal } from '#components'

useHead({ title: 'Certificates' })

const overlay = useOverlay()
const uploadModal = overlay.create(LazyCertificatesUploadModal)
const deletionModal = overlay.create(LazyCertificatesDeletionModal)
const { data: certificates, error, refresh } = await useFetch('/api/certificates')

if (error.value) {
  throw createError({ statusCode: error.value.statusCode, statusMessage: error.value.data?.message ?? 'Loading certificates failed.', fatal: true })
}

type Certificate = NonNullable<typeof certificates.value>[number]

async function uploadCertificate() {
  if (await uploadModal.open().result) {
    await refresh()
  }
}

async function deleteCertificate(certificate: Certificate) {
  if (await deletionModal.open({ certificate }).result) {
    await refresh()
  }
}

function expiryBadge(expiresAt: string): BadgeProps | undefined {
  const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000
  if (days < 0) {
    return { label: 'Expired', color: 'error' }
  }
  if (days < 30) {
    return { label: 'Expires soon', color: 'warning' }
  }
}

function domainCount(count: number) {
  if (count === 0) {
    return 'No domains'
  }
  return count === 1 ? '1 domain' : `${count} domains`
}

const columns: TableColumn<Certificate>[] = [
  { accessorKey: 'hostnames', header: 'Covers' },
  { accessorKey: 'domainCount', header: 'Used by' },
  { accessorKey: 'issuer', header: 'Issuer' },
  { accessorKey: 'expiresAt', header: 'Expires' },
  { accessorKey: 'createdAt', header: 'Uploaded' },
  { id: 'actions', meta: { class: { th: 'w-px', td: 'w-px' } } }
]
</script>

<template>
  <UDashboardPanel id="certificates">
    <template #header>
      <UDashboardNavbar title="Certificates">
        <template #right>
          <UButton
            label="Upload certificate"
            icon="i-lucide-upload"
            @click="uploadCertificate"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTable
        v-if="certificates?.length"
        :data="certificates"
        :columns="columns"
      >
        <template #hostnames-cell="{ row }">
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="hostname in row.original.hostnames"
              :key="hostname"
              :label="hostname"
              color="neutral"
              variant="outline"
              class="font-mono"
            />
          </div>
        </template>

        <template #domainCount-cell="{ row }">
          {{ domainCount(row.original.domainCount) }}
        </template>

        <template #expiresAt-cell="{ row }">
          <div class="flex items-center gap-2">
            <NuxtTime
              :datetime="row.original.expiresAt"
              locale="en-US"
              date-style="medium"
            />
            <UBadge
              v-if="expiryBadge(row.original.expiresAt)"
              v-bind="expiryBadge(row.original.expiresAt)"
              variant="subtle"
            />
          </div>
        </template>

        <template #createdAt-cell="{ row }">
          <NuxtTime
            :datetime="row.original.createdAt"
            locale="en-US"
            date-style="medium"
          />
        </template>

        <template #actions-cell="{ row }">
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            aria-label="Delete certificate"
            @click="deleteCertificate(row.original)"
          />
        </template>
      </UTable>

      <UEmpty
        v-else
        icon="i-lucide-shield-check"
        title="No certificates yet"
        description="A domain needs a certificate before a service can use it. Upload the certificate for your domain, or a wildcard certificate for several."
        :actions="[{ label: 'Upload certificate', icon: 'i-lucide-upload', onClick: uploadCertificate }]"
      />
    </template>
  </UDashboardPanel>
</template>
