import { NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";

export async function POST(request: Request) {
  if (!request.headers.get("oai-authenticated-user-id") && process.env.NODE_ENV === "production") return NextResponse.json({ error: "Host sign-in required" }, { status: 401 });
  const { room, identity, action, trackSid } = await request.json() as { room: string; identity: string; action: string; trackSid?: string };
  const url = process.env.LIVEKIT_URL?.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  if (!url || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return NextResponse.json({ error: "LiveKit is not configured" }, { status: 503 });
  const service = new RoomServiceClient(url, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
  if (action === "remove") await service.removeParticipant(room, identity);
  else if (action === "mute" && trackSid) await service.mutePublishedTrack(room, identity, trackSid, true);
  else return NextResponse.json({ error: "Unsupported moderation action" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
