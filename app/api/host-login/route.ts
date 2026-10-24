import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getRuntimeEnv } from "@/lib/runtime-env";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const env = getRuntimeEnv();
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ tracked: false, reason: "Email delivery is not configured" }, { status: 503 });

  const signedInAt = new Date().toISOString();
  const destination = env.ADMIN_TRACKING_EMAIL || "admin@famyank.com";
  const sender = env.SIGNIN_FROM_EMAIL || "FamBridge <notifications@famyank.com>";
  const agent = request.headers.get("user-agent")?.slice(0, 300) || "Unknown browser";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: sender,
      to: [destination],
      subject: `FamBridge host sign-in: ${user.displayName}`,
      text: [`Host: ${user.displayName}`, `Email: ${user.email}`, `Signed in: ${signedInAt}`, `Browser: ${agent}`].join("\n"),
    }),
  });

  if (!response.ok) return NextResponse.json({ tracked: false, reason: "Email provider rejected the notification" }, { status: 502 });
  return NextResponse.json({ tracked: true });
}
