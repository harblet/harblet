export default defineEventHandler((event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  return { appSecret: useRuntimeConfig().appSecret }
})
