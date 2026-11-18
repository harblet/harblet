export default defineEventHandler(async () => {
  return db.query.invitations.findMany({
    columns: { id: true, email: true, role: true, token: true, expiresAt: true, createdAt: true },
    with: { inviter: { columns: { name: true } } },
    orderBy: { createdAt: 'desc' }
  })
})
