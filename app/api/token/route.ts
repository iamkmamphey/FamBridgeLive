import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { AccessToken } from "livekit-server-sdk";

export async function POST(request: Request) {
  const { room, invite, name, role } = await request.json().catch(() => ({})) as { room?: string; invite?: string; name?: string; role?: string };
  const url = process.env.LIVEKIT_URL, apiKey = process.env.LIVEKIT_API_KEY, apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return NextResponse.json({ error: "LiveKit is not configured" }, { status: 503 });
  const isHost = role === "host" && Boolean(request.headers.get("oai-authenticated-user-id") || process.env.NODE_ENV !== "production");
  if (!isHost) {
    try {
      const verified = await jwtVerify(String(invite || ""), new TextEncoder().encode(process.env.FAMBRIDGE_INVITE_SECRET || ""));
      if (verified.payload.room !== room || verified.payload.role !== "guest") throw new Error("Invalid invite");
    } catch { return NextResponse.json({ error: "Guest link is invalid or expired" }, { status: 403 }); }
  }
  const identity = `${isHost ? "host" : "guest"}-${crypto.randomUUID()}`;
  const token = new AccessToken(apiKey, apiSecret, { identity, name: String(name || (isHost ? "Host" : "Guest")).slice(0, 50), ttl: "8h" });
  token.addGrant({ roomJoin: true, room: String(room), canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: isHost });
  return NextResponse.json({ token: await token.toJwt(), url, identity, isHost });
}
