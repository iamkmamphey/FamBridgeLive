declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    LIVEKIT_URL?: string;
    LIVEKIT_API_KEY?: string;
    LIVEKIT_API_SECRET?: string;
    FAMBRIDGE_INVITE_SECRET?: string;
  }
}
