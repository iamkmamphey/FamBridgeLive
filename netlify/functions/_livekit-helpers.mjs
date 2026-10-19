import { AccessToken } from "livekit-server-sdk"

const roomPattern = /^[a-zA-Z0-9_-]{3,64}$/

export function json(statusCode, body, extraHeaders = {}) {
  return { statusCode, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders }, body: JSON.stringify(body) }
}

export function allowedOrigin(event) {
  const configuredOrigin = process.env.APP_ORIGIN?.replace(/\/$/, "")
  const origin = event.headers.origin?.replace(/\/$/, "")
  return !configuredOrigin || !origin || origin === configuredOrigin
}

export async function createParticipantToken(payload) {
  const { room_name: roomName, participant_name: participantName, participant_identity: participantIdentity } = payload || {}
  if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) throw Object.assign(new Error("LiveKit is not configured."), { statusCode: 503 })
  if (!roomPattern.test(roomName || "") || typeof participantName !== "string" || !participantName.trim() || participantName.length > 50 || !roomPattern.test(participantIdentity || "")) throw Object.assign(new Error("Invalid room or participant details."), { statusCode: 400 })

  const requestedHost = payload.role === "host"
  const isHost = requestedHost && Boolean(process.env.HOST_ACCESS_KEY) && payload.host_access_key === process.env.HOST_ACCESS_KEY
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: participantIdentity,
    name: participantName.trim(),
    metadata: JSON.stringify({ role: isHost ? "host" : "guest" }),
    ttl: "2h"
  })
  token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true })
  return { server_url: process.env.LIVEKIT_URL, participant_token: await token.toJwt(), role: isHost ? "host" : "guest" }
}
