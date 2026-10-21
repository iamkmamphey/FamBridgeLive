# Fambridgelive Host Studio

Responsive host dashboard prototype for running a multi-guest live event from one screen.

## What works in this prototype

- Responsive participant grid with featured-speaker switching
- Guest/source link inputs and connection-state feedback
- Real browser camera/microphone preview via `getUserMedia`
- Screen sharing via `getDisplayMedia`
- Host controls, mute-all, reactions, chat, invite-link copy, layout switching, and recording timer
- Integration configuration map for production video, broadcast, RTMP, and realtime APIs

## Production API architecture

The browser UI must not contain secret API keys. A production backend should issue short-lived room tokens and handle webhooks.

1. **Guest video:** LiveKit, Daily, or Twilio Video (WebRTC room, participant tracks, moderation).
2. **Broadcast:** Mux Live or Cloudflare Stream (recording, transcoding, playback).
3. **Destinations:** Restream or direct RTMP output for platforms that support stream keys.
4. **Realtime state:** Supabase Realtime or Firebase for presence, chat, reactions, and queue state.
5. **Backend endpoints:** `/api/rooms`, `/api/rooms/:id/token`, `/api/destinations`, `/api/webhooks/video`, `/api/recordings`.

Zoom, Google Meet, WhatsApp, TikTok, and similar consumer services generally cannot be "merged" by simply pasting a call URL. Use their approved SDK/API where available, or invite those guests into the app's own WebRTC room. Platform livestream outputs should use each platform's official RTMP/API permissions.
