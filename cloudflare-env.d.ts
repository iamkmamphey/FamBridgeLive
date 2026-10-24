declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    LIVEKIT_URL?: string;
    LIVEKIT_API_KEY?: string;
    LIVEKIT_API_SECRET?: string;
    FAMBRIDGE_INVITE_SECRET?: string;
    RESEND_API_KEY?: string;
    SIGNIN_FROM_EMAIL?: string;
    ADMIN_TRACKING_EMAIL?: string;
  }
}
