export function useLoading() {
  const loading = ref(false)

  async function withLoading<T>(fn: () => Promise<T>) {
    loading.value = true
    try {
      return await fn()
    } finally {
      loading.value = false
    }
  }

  return { loading: readonly(loading), withLoading }
}
