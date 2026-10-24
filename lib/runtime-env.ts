import { AsyncLocalStorage } from "node:async_hooks";

type RuntimeEnv = Pick<Cloudflare.Env,
  "LIVEKIT_URL" | "LIVEKIT_API_KEY" | "LIVEKIT_API_SECRET" |
  "FAMBRIDGE_INVITE_SECRET" | "RESEND_API_KEY" |
  "SIGNIN_FROM_EMAIL" | "ADMIN_TRACKING_EMAIL"
>;

const runtimeEnv = new AsyncLocalStorage<RuntimeEnv>();

export function runWithRuntimeEnv<T>(env: Cloudflare.Env, run: () => T): T {
  return runtimeEnv.run(env, run);
}

export function getRuntimeEnv(): RuntimeEnv {
  const bindings = runtimeEnv.getStore();
  if (bindings) return bindings;
  return process.env as unknown as RuntimeEnv;
}
