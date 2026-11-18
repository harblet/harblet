export default defineNitroPlugin(() => {
  if (import.meta.prerender) {
    return
  }
  const logger = useLogger('plugins:system')
  applySystemComponents().then(upgradeServers).catch(error => logger.error(error))
  syncSiteDomain().catch(error => logger.error(error))
})
