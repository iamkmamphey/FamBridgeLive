export default async () => new Response(JSON.stringify({ configured: Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.HOST_ACCESS_KEY) }), {
  headers: { "content-type": "application/json", "cache-control": "no-store" }
})

export const config = { path: "/api/livekit/status" }
