import { RoomServiceClient } from "livekit-server-sdk"
import { allowedOrigin, verifiedHost } from "./_livekit-helpers.mjs"

const valid = /^[a-zA-Z0-9_-]{3,64}$/
export default async request => {
  const headers = { "content-type": "application/json", "cache-control": "no-store" }
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers })
  if (!allowedOrigin({ headers: Object.fromEntries(request.headers.entries()) })) return new Response(JSON.stringify({ error: "Origin not allowed." }), { status: 403, headers })
  try {
    const { room, participant_identity: identity, action, track_sid: trackSid } = await request.json()
    if (!valid.test(room || "") || !valid.test(identity || "")) throw Object.assign(new Error("Invalid moderation target."), { statusCode: 400 })
    await verifiedHost(request, room)
    const service = new RoomServiceClient(process.env.LIVEKIT_URL.replace(/^wss:/, "https:"), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET)
    if (action === "remove") await service.removeParticipant(room, identity)
    else if ((action === "mute-audio" || action === "mute-video") && trackSid) await service.mutePublishedTrack(room, identity, trackSid, true)
    else throw Object.assign(new Error("Unsupported moderation action."), { statusCode: 400 })
    return new Response(JSON.stringify({ ok: true }), { headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Moderation failed." }), { status: error.statusCode || 500, headers })
  }
}

export const config = { path: "/api/livekit/moderate", rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] } }
