import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { HOST_COOKIE } from "@/lib/host-auth";
import { getRuntimeEnv } from "@/lib/runtime-env";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { name?: unknown; email?: unknown; phone?: unknown };
  const name = String(body.name || "").trim().slice(0, 100);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
  const phone = String(body.phone || "").trim().slice(0, 30);
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[+0-9() .-]{7,30}$/.test(phone)) return NextResponse.json({ error: "Enter a valid name, email, and phone number." }, { status: 400 });
  const env = getRuntimeEnv();
  if (!env.FAMBRIDGE_INVITE_SECRET) return NextResponse.json({ error: "Host access is temporarily unavailable." }, { status: 503 });
  const token = await new SignJWT({ role: "host", name, email, phone }).setProtectedHeader({ alg: "HS256" }).setIssuer("fambridge-live").setAudience("fambridge-host").setIssuedAt().setExpirationTime("12h").sign(new TextEncoder().encode(env.FAMBRIDGE_INVITE_SECRET));
  let notificationSent = false;
  if (env.RESEND_API_KEY) {
    const sent = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: env.SIGNIN_FROM_EMAIL || "FamBridge <notifications@famyank.com>", to: [env.ADMIN_TRACKING_EMAIL || "admin@famyank.com"], subject: `FamBridge host login: ${name}`, text: [`Host: ${name}`, `Email: ${email}`, `Phone: ${phone}`, `Logged in: ${new Date().toISOString()}`].join("\n") }) }).catch(() => null);
    notificationSent = Boolean(sent?.ok);
  }
  const response = NextResponse.json({ ok: true, notificationSent });
  response.cookies.set(HOST_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  return response;
}
