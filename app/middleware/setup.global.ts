export default defineNuxtRouteMiddleware(async (to) => {
  const required = useState<boolean | null>('setup-required', () => null)

  if (required.value === null) {
    required.value = (await $fetch('/api/setup')).required
  }

  if (required.value && to.path !== '/setup') {
    return navigateTo('/setup')
  }
  if (!required.value && to.path === '/setup') {
    return navigateTo('/login')
  }
})
