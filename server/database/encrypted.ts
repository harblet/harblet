import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { customType } from 'drizzle-orm/pg-core'

function encryptionKey() {
  return Buffer.from(hkdfSync('sha256', useRuntimeConfig().appSecret, 'nuxt', 'harblet:encrypted-columns', 32))
}

export const encrypted = customType<{ data: string, driverData: string }>({
  dataType: () => 'text',
  toDriver(value) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')
  },
  fromDriver(value) {
    const data = Buffer.from(value, 'base64')
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), data.subarray(0, 12))
    decipher.setAuthTag(data.subarray(12, 28))
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8')
  }
})
