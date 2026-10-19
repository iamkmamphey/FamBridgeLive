import { allowedOrigin, createParticipantToken, json } from "./_livekit-helpers.mjs"

export default async (request, context) => {
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers: { "content-type": "application/json", allow: "POST" } })
  const event = { headers: Object.fromEntries(request.headers.entries()) }
  if (!allowedOrigin(event)) return new Response(JSON.stringify({ error: "Origin not allowed." }), { status: 403, headers: { "content-type": "application/json", "cache-control": "no-store" } })
  try {
    const result = await createParticipantToken(await request.json())
    return new Response(JSON.stringify(result), { status: 201, headers: { "content-type": "application/json", "cache-control": "no-store" } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Unable to create room token." }), { status: error.statusCode || 500, headers: { "content-type": "application/json", "cache-control": "no-store" } })
  }
}

export const config = {
  path: "/api/livekit/token",
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ["ip", "domain"]
  }
}
