# Fambridgelive Host Studio

Server-backed LiveKit host dashboard for running a multi-guest live event from one screen.

## Run locally

1. Create a LiveKit Cloud project (or use a self-hosted LiveKit server).
2. Copy `.env.example` to `.env` and add the project URL, API key, and API secret.
3. Run `npm install` and then `npm run dev`.
4. Open `http://127.0.0.1:4173`, enter the host name, and copy the room invitation link.

The API secret remains on the Node server. Browsers receive short-lived, room-scoped participant tokens from `/api/livekit/token`.

## Deploy to Netlify from GitHub

The included `netlify.toml` publishes `dist` and routes token requests through Netlify Functions. Configure these values in **Netlify → Site configuration → Environment variables**; never place production values in the repository:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `HOST_ACCESS_KEY` (a long, unique passphrase used only when the host joins)
- `APP_ORIGIN` (the final HTTPS Netlify site URL, without a trailing slash)

The deployment includes same-origin validation, short-lived room-scoped tokens, a host-access check, non-cacheable API responses, restrictive browser permissions, CSP, framing protection, and 128-bit room identifiers.

## What works in this prototype

- Responsive participant grid with featured-speaker switching
- Reusable saved guest/source links, including WhatsApp, Zoom, Meet, RTMP, and native guest links
- Real browser camera/microphone preview via `getUserMedia`
- Screen sharing with a live desktop preview via `getDisplayMedia`
- Local recording with source, browser-supported format, folder, and filename selection
- Host controls, mute-all, reactions, shared native-room chat, participant list, invite-link copy, and layout switching
- LiveKit participant video/audio, presence, room chat, reactions, and screen sharing
- Secure server-side LiveKit token generation
- Verified-host controls to remove participants or stop their microphone/camera tracks
- Background blur and custom background images for host and guest cameras
- Synchronized host whiteboard and in-chat reactions visible to everyone

## Production API architecture

The browser UI must not contain secret API keys. A production backend should issue short-lived room tokens and handle webhooks.

1. **Guest video:** LiveKit (WebRTC room, participant tracks, screen sharing, and data messages).
2. **Broadcast:** Mux Live or Cloudflare Stream (recording, transcoding, playback).
3. **Destinations:** Restream or direct RTMP output for platforms that support stream keys.
4. **Realtime state:** Supabase Realtime or Firebase for presence, chat, reactions, and queue state.
5. **Backend endpoints:** `/api/rooms`, `/api/rooms/:id/token`, `/api/destinations`, `/api/webhooks/video`, `/api/recordings`.

Zoom, Google Meet, WhatsApp, TikTok, and similar consumer services generally cannot be "merged" by simply pasting a call URL. Use their approved SDK/API where available, or invite those guests into the app's own WebRTC room. Platform livestream outputs should use each platform's official RTMP/API permissions.
