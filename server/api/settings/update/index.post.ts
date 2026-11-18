export default defineEventHandler(async (event) => {
  await startUpdate()
  setResponseStatus(event, 202)
})
