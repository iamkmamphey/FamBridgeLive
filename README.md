# FamBridge Live

Passwordless guest video rooms with adaptive video, audio, chat, reactions, screen sharing, waiting-room approval, moderation, captions, recording, and a collaborative whiteboard.

Video quality is selected automatically by adaptive streaming; hosts and guests do not need to configure a data mode.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Add credentials from a LiveKit Cloud project.
3. Generate a long random value for `FAMBRIDGE_INVITE_SECRET`.
4. Run `npm install` and `npm run dev`.
5. Open `http://127.0.0.1:5173/signin-with-chatgpt?return_to=/` to use the local host identity.

## Required runtime variables

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `FAMBRIDGE_INVITE_SECRET`

The host is authenticated by the hosting platform. Guests receive an expiring signed invitation URL and do not need an account.

## Verification

```bash
npx tsc --noEmit
npm run build
```
