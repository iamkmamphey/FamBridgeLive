import "dotenv/config"
import express from "express"
import { AccessToken, RoomServiceClient, TokenVerifier } from "livekit-server-sdk"

const app = express()
const port = Number(process.env.PORT || 4173)
const roomPattern = /^[a-zA-Z0-9_-]{3,64}$/
const requests = new Map()

app.disable("x-powered-by")
app.use(express.json({ limit: "16kb" }))
app.use("/api/livekit", (request, response, next) => {
  const allowedOrigin = process.env.APP_ORIGIN?.replace(/\/$/, "")
  const origin = request.get("origin")?.replace(/\/$/, "")
  if (allowedOrigin && origin && origin !== allowedOrigin) return response.status(403).json({ error: "Origin not allowed." })
  const now = Date.now(), key = request.ip, recent = (requests.get(key) || []).filter(time => now - time < 60_000)
  if (recent.length >= 30) return response.status(429).json({ error: "Too many requests. Try again shortly." })
  recent.push(now); requests.set(key, recent); response.set("Cache-Control", "no-store"); next()
})

app.get("/api/livekit/status", (_request, response) => {
  response.json({ configured: Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) })
})

app.post("/api/livekit/token", async (request, response) => {
  const { room_name: roomName, participant_name: participantName, participant_identity: participantIdentity, role = "guest", host_access_key: hostAccessKey } = request.body || {}
  if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) {
    return response.status(503).json({ error: "LiveKit is not configured on this server." })
  }
  if (!roomPattern.test(roomName || "") || typeof participantName !== "string" || !participantName.trim() || participantName.length > 50 || !roomPattern.test(participantIdentity || "")) {
    return response.status(400).json({ error: "Invalid room or participant details." })
  }

  try {
    const isHost = role === "host" && Boolean(process.env.HOST_ACCESS_KEY) && hostAccessKey === process.env.HOST_ACCESS_KEY
    const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
      identity: participantIdentity,
      name: participantName.trim(),
      metadata: JSON.stringify({ role: isHost ? "host" : "guest" }),
      ttl: "2h"
    })
    token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true })
    return response.status(201).json({ server_url: process.env.LIVEKIT_URL, participant_token: await token.toJwt(), role: isHost ? "host" : "guest" })
  } catch (error) {
    console.error("Unable to create LiveKit token", error)
    return response.status(500).json({ error: "Unable to create a room token." })
  }
})

app.post("/api/livekit/moderate", async (request, response) => {
  try {
    const bearer = request.get("authorization") || "", rawToken = bearer.startsWith("Bearer ") ? bearer.slice(7) : ""
    const { room, participant_identity: participantIdentity, action, track_sid: trackSid } = request.body || {}
    if (!rawToken || !roomPattern.test(room || "") || !roomPattern.test(participantIdentity || "")) return response.status(400).json({ error: "Invalid moderation request." })
    const claims = await new TokenVerifier(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET).verify(rawToken)
    let metadata = {}; try { metadata = JSON.parse(claims.metadata || "{}") } catch {}
    if (metadata.role !== "host" || claims.video?.room !== room) return response.status(403).json({ error: "Host permission denied." })
    const service = new RoomServiceClient(process.env.LIVEKIT_URL.replace(/^wss:/, "https:"), process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET)
    if (action === "remove") await service.removeParticipant(room, participantIdentity)
    else if ((action === "mute-audio" || action === "mute-video") && trackSid) await service.mutePublishedTrack(room, participantIdentity, trackSid, true)
    else return response.status(400).json({ error: "Unsupported moderation action." })
    return response.json({ ok: true })
  } catch (error) {
    console.error("LiveKit moderation failed", error)
    return response.status(500).json({ error: "Moderation failed." })
  }
})

app.use(express.static("dist", { extensions: ["html"] }))
app.get("/{*path}", (_request, response) => response.sendFile("index.html", { root: "dist" }))

app.listen(port, "0.0.0.0", () => {
  console.log(`Fambridgelive is running at http://127.0.0.1:${port}`)
  if (!process.env.LIVEKIT_URL) console.log("LiveKit is not configured yet. Copy .env.example to .env and add your credentials.")
})
