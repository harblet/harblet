export default defineEventHandler(async (event) => {
  const token = await createJoinToken()
  setResponseStatus(event, 201)
  return token
})
