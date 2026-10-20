import { missingLiveKitVariables } from "./_livekit-helpers.mjs"

export default async () => {
  const missing = [...missingLiveKitVariables(), ...(!process.env.HOST_ACCESS_KEY ? ["HOST_ACCESS_KEY"] : [])]
  return new Response(JSON.stringify({ configured: missing.length === 0, missing }), {
  headers: { "content-type": "application/json", "cache-control": "no-store" }
  })
}

export const config = { path: "/api/livekit/status" }
