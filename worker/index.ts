import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { runWithRuntimeEnv } from "../lib/runtime-env";

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    // Vinext route modules can be evaluated in a separate module graph. Mirror
    // server-only string bindings into Node's Worker process environment so
    // every API route receives the same encrypted production configuration.
    for (const key of ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "FAMBRIDGE_INVITE_SECRET", "RESEND_API_KEY", "SIGNIN_FROM_EMAIL", "ADMIN_TRACKING_EMAIL"] as const) {
      const value = env[key];
      if (typeof value === "string" && value) process.env[key] = value;
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithRuntimeEnv(env, () =>
      runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx)),
    );
  },
};

export default worker;
