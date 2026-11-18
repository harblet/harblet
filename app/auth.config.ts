import { defineClientAuth } from '@nuxtjs/better-auth/config'
import { adminClient, deviceAuthorizationClient } from 'better-auth/client/plugins'

export default defineClientAuth({
  plugins: [adminClient(), deviceAuthorizationClient()]
})
