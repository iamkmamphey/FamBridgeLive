import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { getHostSession } from "@/lib/host-auth";

export async function POST(request: Request) {
  const host = await getHostSession();
  if (!host) return NextResponse.json({ error: "Host sign-in required" }, { status: 401 });
  const secret = getRuntimeEnv().FAMBRIDGE_INVITE_SECRET;
  if (!secret) return NextResponse.json({ error: "FAMBRIDGE_INVITE_SECRET is not configured" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { mode?: string };
  const room = `fambridge-${crypto.randomUUID()}`;
  const invite = await new SignJWT({ room, role: "guest", host: host.email, mode: body.mode || "balanced" })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h")
    .sign(new TextEncoder().encode(secret));
  return NextResponse.json({ room, invite, expiresIn: 28800 });
}
