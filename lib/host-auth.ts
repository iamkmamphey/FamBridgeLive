import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const HOST_COOKIE = "fambridge_host_session";
export type HostSession = { name: string; email: string; phone: string };

export async function getHostSession(): Promise<HostSession | null> {
  const token = (await cookies()).get(HOST_COOKIE)?.value;
  const secret = getRuntimeEnv().FAMBRIDGE_INVITE_SECRET;
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: "fambridge-live", audience: "fambridge-host" });
    if (payload.role !== "host" || !payload.name || !payload.email || !payload.phone) return null;
    return { name: String(payload.name), email: String(payload.email), phone: String(payload.phone) };
  } catch { return null; }
}
