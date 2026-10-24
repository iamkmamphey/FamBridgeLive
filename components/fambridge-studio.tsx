"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionQuality,
  LocalParticipant,
  Participant,
  RemoteParticipant,
  Room,
  RoomEvent,
  Track,
  VideoPresets,
} from "livekit-client";
import {
  Camera, CameraOff, Check, Clipboard, Copy, Hand, LayoutGrid, Loader2,
  MessageCircle, Mic, MicOff, MonitorUp, MoreVertical, PhoneOff, Radio,
  Send, Settings2, ShieldCheck, Sparkles, UserMinus, Users, Video, Wifi, LogOut,
  WifiLow, X,
} from "lucide-react";
import { clearHostSignInTracking } from "@/components/host-signin-tracker";

type Mode = "data" | "balanced" | "quality";
type FeedMessage = { id: string; sender: string; text: string; kind?: "chat" | "caption" | "question"; own?: boolean };
type WaitingGuest = { identity: string; name: string };
type WireEvent = { type: string; text?: string; emoji?: string; name?: string; identity?: string; approved?: boolean; x?: number; y?: number; drawing?: boolean; color?: string };
type TokenResponse = { token: string; url: string; identity: string; isHost: boolean; error?: string };
type RoomResponse = { room: string; invite: string; expiresIn: number; error?: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const reactions = ["👏", "❤️", "🔥", "😂", "🎉", "👍"];

function participantName(participant: Participant) {
  return participant.name || participant.identity.replace(/^(host|guest)-/, "").slice(0, 16) || "Guest";
}

function MediaTile({ participant, featured = false, isHost, onRemove }: { participant: Participant; featured?: boolean; isHost: boolean; onRemove?: () => void }) {
  const videoRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const update = () => setTick(value => value + 1);
    participant.on("trackPublished", update).on("trackUnpublished", update).on("trackMuted", update).on("trackUnmuted", update);
    return () => { participant.off("trackPublished", update).off("trackUnpublished", update).off("trackMuted", update).off("trackUnmuted", update); };
  }, [participant]);
  useEffect(() => {
    const videoNode = videoRef.current, audioNode = audioRef.current;
    if (!videoNode || !audioNode) return;
    videoNode.replaceChildren(); audioNode.replaceChildren();
    for (const publication of participant.trackPublications.values()) {
      if (!publication.track || publication.isMuted) continue;
      const element = publication.track.attach();
      element.autoplay = true;
      if (publication.kind === Track.Kind.Video) { element.setAttribute("playsinline", "true"); (videoNode as any).appendChild(element); }
      if (publication.kind === Track.Kind.Audio && !participant.isLocal) (audioNode as any).appendChild(element);
    }
    return () => participant.trackPublications.forEach(publication => publication.track?.detach().forEach(element => element.remove()));
  }, [participant, tick]);
  const hasVideo = [...participant.trackPublications.values()].some(publication => publication.kind === Track.Kind.Video && publication.track && !publication.isMuted);
  const initials = participantName(participant).split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  return (
    <article className={`media-tile ${featured ? "featured" : ""}`}>
      <div ref={videoRef} className="video-mount" />
      <div ref={audioRef} />
      {!hasVideo && <div className="avatar-fallback">{initials}</div>}
      <div className="tile-meta"><span>{participantName(participant)} {participant.isLocal && "· You"}</span><span className="live-mark">● Live</span></div>
      {isHost && !participant.isLocal && <button className="tile-menu" onClick={onRemove} title="Remove guest"><UserMinus size={16} /></button>}
    </article>
  );
}

function Whiteboard({ room, open, onClose }: { room: Room; open: boolean; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<[number, number] | null>(null);
  const [color, setColor] = useState("#d9ff43");
  const draw = useCallback((event: WireEvent) => {
    const canvas = canvasRef.current; if (!canvas || event.x == null || event.y == null) return;
    const context = canvas.getContext("2d"); if (!context) return;
    const x = event.x * canvas.width, y = event.y * canvas.height;
    if (!event.drawing || !last.current) { last.current = [x, y]; return; }
    context.strokeStyle = event.color || "#d9ff43"; context.lineWidth = 4; context.lineCap = "round";
    context.beginPath(); context.moveTo(...last.current); context.lineTo(x, y); context.stroke(); last.current = [x, y];
  }, []);
  useEffect(() => {
    const receive = (payload: Uint8Array) => { try { const event = JSON.parse(decoder.decode(payload)); if (event.type === "board") draw(event); if (event.type === "board-clear") canvasRef.current?.getContext("2d")?.clearRect(0, 0, 10000, 10000); } catch {} };
    room.on(RoomEvent.DataReceived, receive); return () => { room.off(RoomEvent.DataReceived, receive); };
  }, [room, draw]);
  if (!open) return null;
  const sendPoint = (event: React.PointerEvent<HTMLCanvasElement>, isDrawing: boolean) => {
    const canvas = event.currentTarget, rect = canvas.getBoundingClientRect();
    const message: WireEvent = { type: "board", x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height, drawing: isDrawing, color };
    draw(message); room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable: false });
  };
  return <div className="modal-backdrop"><section className="whiteboard-card"><header><div><span className="eyebrow">LIVE COLLABORATION</span><h2>Room whiteboard</h2></div><button className="icon-button" onClick={onClose}><X /></button></header><div className="board-tools">{["#d9ff43", "#73d6ff", "#ff8177", "#ffffff"].map(value => <button key={value} onClick={() => setColor(value)} style={{ background: value }} className={color === value ? "selected" : ""} />)}<button onClick={() => { canvasRef.current?.getContext("2d")?.clearRect(0, 0, 10000, 10000); room.localParticipant.publishData(encoder.encode(JSON.stringify({ type: "board-clear" })), { reliable: true }); }}>Clear</button></div><canvas ref={canvasRef} width={1200} height={700} onPointerDown={event => { drawing.current = true; last.current = null; sendPoint(event, false); }} onPointerMove={event => drawing.current && sendPoint(event, true)} onPointerUp={() => { drawing.current = false; last.current = null; }} /></section></div>;
}

export default function FamBridgeStudio({ hostAuthenticated, hostName }: { hostAuthenticated: boolean; hostName: string }) {
  const query = useMemo(() => typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search), []);
  const inviteRoom = query.get("room"), inviteToken = query.get("invite");
  const isGuestLink = Boolean(inviteRoom && inviteToken);
  const [name, setName] = useState(isGuestLink ? "" : hostName);
  const [room, setRoom] = useState<Room | null>(null);
  const [roomId, setRoomId] = useState(inviteRoom || "");
  const [inviteUrl, setInviteUrl] = useState("");
  const [mode, setMode] = useState<Mode>("balanced");
  const [status, setStatus] = useState<"idle" | "connecting" | "waiting" | "connected" | "reconnecting" | "ended">("idle");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [waiting, setWaiting] = useState<WaitingGuest[]>([]);
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [message, setMessage] = useState("");
  const [camera, setCamera] = useState(true), [microphone, setMicrophone] = useState(true), [sharing, setSharing] = useState(false);
  const [whiteboard, setWhiteboard] = useState(false), [captioning, setCaptioning] = useState(false);
  const [quality, setQuality] = useState<ConnectionQuality>(ConnectionQuality.Unknown);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null), chunksRef = useRef<Blob[]>([]);

  const flash = (text: string) => { setToast(text); window.setTimeout(() => setToast(""), 2600); };
  const refreshParticipants = useCallback((activeRoom: Room) => setParticipants([activeRoom.localParticipant, ...activeRoom.remoteParticipants.values()]), []);
  const publish = useCallback((activeRoom: Room, event: WireEvent, reliable = true, destinations?: string[]) => activeRoom.localParticipant.publishData(encoder.encode(JSON.stringify(event)), { reliable, destinationIdentities: destinations }), []);

  const bindRoom = useCallback((activeRoom: Room, host: boolean) => {
    const refresh = () => refreshParticipants(activeRoom);
    activeRoom.on(RoomEvent.ParticipantConnected, refresh).on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.TrackSubscribed, refresh).on(RoomEvent.TrackUnsubscribed, refresh)
      .on(RoomEvent.LocalTrackPublished, refresh).on(RoomEvent.LocalTrackUnpublished, refresh)
      .on(RoomEvent.Reconnecting, () => setStatus("reconnecting")).on(RoomEvent.Reconnected, () => setStatus("connected"))
      .on(RoomEvent.Disconnected, () => setStatus("ended"))
      .on(RoomEvent.ConnectionQualityChanged, (value, participant) => { if (participant.isLocal) setQuality(value); })
      .on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const event = JSON.parse(decoder.decode(payload)) as WireEvent;
          const sender = participant ? participantName(participant) : "Room";
          if (event.type === "join-request" && host && participant) setWaiting(current => current.some(item => item.identity === participant.identity) ? current : [...current, { identity: participant.identity, name: event.name || sender }]);
          if (event.type === "approved" && !host) { setStatus("connected"); activeRoom.localParticipant.setCameraEnabled(camera, mode === "data" ? { resolution: VideoPresets.h180.resolution } : mode === "quality" ? { resolution: VideoPresets.h720.resolution } : { resolution: VideoPresets.h360.resolution }); activeRoom.localParticipant.setMicrophoneEnabled(microphone); flash("The host admitted you"); }
          if (["chat", "caption", "question"].includes(event.type) && event.text) setMessages(current => [...current, { id: crypto.randomUUID(), sender, text: event.text!, kind: event.type as FeedMessage["kind"] }]);
          if (event.type === "reaction" && event.emoji) flash(`${sender} reacted ${event.emoji}`);
          if (event.type === "hand") flash(`${sender} raised a hand`);
        } catch {}
      });
    refresh();
  }, [camera, microphone, mode, refreshParticipants]);

  async function getMediaToken(targetRoom: string, role: "host" | "guest", invite?: string) {
    const response = await fetch("/api/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room: targetRoom, invite, name: name.trim() || (role === "host" ? hostName : "Guest"), role }) });
    const result = await response.json() as TokenResponse; if (!response.ok) throw new Error(result.error || "Could not join room"); return result;
  }

  async function connect(targetRoom: string, role: "host" | "guest", invite?: string) {
    setError(""); setStatus("connecting");
    try {
      const credentials = await getMediaToken(targetRoom, role, invite);
      const activeRoom = new Room({ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { resolution: mode === "data" ? VideoPresets.h180.resolution : mode === "quality" ? VideoPresets.h720.resolution : VideoPresets.h360.resolution }, publishDefaults: { simulcast: true, videoSimulcastLayers: mode === "data" ? [VideoPresets.h180, VideoPresets.h90] : [VideoPresets.h360, VideoPresets.h180] } });
      bindRoom(activeRoom, role === "host"); await activeRoom.connect(credentials.url, credentials.token); setRoom(activeRoom); setRoomId(targetRoom);
      if (role === "host") { await Promise.all([activeRoom.localParticipant.setCameraEnabled(true), activeRoom.localParticipant.setMicrophoneEnabled(true)]); setStatus("connected"); }
      else { setStatus("waiting"); await publish(activeRoom, { type: "join-request", name: name.trim() || "Guest" }); }
      refreshParticipants(activeRoom);
    } catch (caught) { setStatus("idle"); setError(caught instanceof Error ? caught.message : "Connection failed"); }
  }

  async function createRoom() {
    if (!hostAuthenticated && process.env.NODE_ENV === "production") { setError("The host must sign in before creating a room."); return; }
    setError(""); setStatus("connecting");
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
      const result = await response.json() as RoomResponse; if (!response.ok) throw new Error(result.error || "Could not create room");
      const url = new URL(window.location.href); url.search = ""; url.searchParams.set("room", result.room); url.searchParams.set("invite", result.invite); setInviteUrl(url.href);
      await connect(result.room, "host");
    } catch (caught) { setStatus("idle"); setError(caught instanceof Error ? caught.message : "Room creation failed"); }
  }

  async function approve(guest: WaitingGuest) {
    if (!room) return; await publish(room, { type: "approved", approved: true }, true, [guest.identity]); setWaiting(current => current.filter(item => item.identity !== guest.identity)); flash(`${guest.name} joined the room`);
  }
  async function toggleCamera() { if (!room) return; const enabled = !camera; await room.localParticipant.setCameraEnabled(enabled); setCamera(enabled); }
  async function toggleMic() { if (!room) return; const enabled = !microphone; await room.localParticipant.setMicrophoneEnabled(enabled); setMicrophone(enabled); }
  async function toggleShare() { if (!room) return; const enabled = !sharing; await room.localParticipant.setScreenShareEnabled(enabled); setSharing(enabled); }
  function sendMessage(kind: "chat" | "question" = "chat") { if (!room || !message.trim()) return; publish(room, { type: kind, text: message.trim() }); setMessages(current => [...current, { id: crypto.randomUUID(), sender: "You", text: message.trim(), kind, own: true }]); setMessage(""); }
  async function removeParticipant(participant: Participant) { const response = await fetch("/api/moderate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room: roomId, identity: participant.identity, action: "remove" }) }); if (response.ok) flash(`${participantName(participant)} removed`); }
  function leave() { room?.disconnect(); setRoom(null); setParticipants([]); setStatus("ended"); }
  function startRecording() {
    if (!room) return;
    if (recording) { recorderRef.current?.stop(); setRecording(false); return; }
    const tracks = [...room.localParticipant.trackPublications.values()].flatMap(publication => publication.track?.mediaStreamTrack ? [publication.track.mediaStreamTrack] : []);
    if (!tracks.length) return flash("Turn on camera or microphone before recording");
    const recorder = new MediaRecorder(new MediaStream(tracks)); chunksRef.current = [];
    recorder.ondataavailable = event => event.data.size && chunksRef.current.push(event.data);
    recorder.onstop = () => { const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(chunksRef.current, { type: recorder.mimeType })); link.download = `FamBridge-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`; link.click(); URL.revokeObjectURL(link.href); };
    recorder.start(1000); recorderRef.current = recorder; setRecording(true); flash("Local recording started");
  }

  useEffect(() => () => { room?.disconnect(); }, [room]);
  useEffect(() => {
    if (!captioning || !room || status !== "connected") return;
    const SpeechRecognition = (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
    if (!SpeechRecognition) { flash("Live captions are not supported by this browser"); setCaptioning(false); return; }
    const recognition = new SpeechRecognition(); recognition.continuous = true; recognition.interimResults = false; recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event: any) => { const text = event.results[event.results.length - 1]?.[0]?.transcript?.trim(); if (!text) return; publish(room, { type: "caption", text }); setMessages(current => [...current, { id: crypto.randomUUID(), sender: "You", text, kind: "caption", own: true }]); };
    recognition.onerror = () => flash("Captions paused — check microphone permission"); recognition.start();
    return () => recognition.stop();
  }, [captioning, room, status, publish]);

  if (!room) return <main className="welcome-shell"><div className="ambient a"/><div className="ambient b"/><section className="welcome-card"><div className="brand"><img src="/assets/famyank-logo.png" alt="Famyank"/><span>FAMBRIDGE<em>LIVE</em></span></div><div className="welcome-copy"><span className="eyebrow">PRIVATE • SIMPLE • LIVE</span><h1>{isGuestLink ? "Join your FamBridge room" : "Bring everyone closer."}</h1><p>{isGuestLink ? "No account needed. Check your name and choose how much data you want to use." : "Start a secure room with video, clear audio, chat, reactions, screen sharing and collaborative tools."}</p></div><label className="field"><span>{isGuestLink ? "Your display name" : "Host display name"}</span><input value={name} onChange={event => setName(event.target.value)} placeholder={isGuestLink ? "Enter your name" : "Host name"}/></label><div className="quality-picker"><span>Video data use</span><div>{(["data","balanced","quality"] as Mode[]).map(value => <button key={value} className={mode === value ? "active" : ""} onClick={() => setMode(value)}><b>{value === "data" ? "Data saver" : value[0].toUpperCase()+value.slice(1)}</b><small>{value === "data" ? "Audio-first · 180p" : value === "balanced" ? "Recommended · 360p" : "Sharper · 720p"}</small></button>)}</div></div>{error && <p className="error-banner">{error}</p>}<button className="primary-cta" disabled={status === "connecting" || (isGuestLink && !name.trim())} onClick={() => isGuestLink ? connect(inviteRoom!, "guest", inviteToken!) : createRoom()}>{status === "connecting" ? <><Loader2 className="spin"/> Connecting…</> : isGuestLink ? <><Video/> Preview & request to join</> : <><Radio/> Start FamBridge room</>}</button>{!isGuestLink && !hostAuthenticated && <p className="signin-note">Host authentication is required on the published site. Guests never need an account.</p>}</section></main>;

  return <main className="studio"><header className="studio-header"><div className="brand"><img src="/assets/famyank-logo.png" alt="Famyank"/><span>FAMBRIDGE<em>LIVE</em></span></div><div className="room-title"><span className="live-dot"/><div><small>FAMBRIDGE ROOM</small><strong>{roomId.slice(-8).toUpperCase()}</strong></div></div><div className="header-actions"><div className="header-status">{status === "reconnecting" ? <WifiLow/> : <Wifi/>}<span>{status === "reconnecting" ? "Reconnecting" : quality === ConnectionQuality.Poor ? "Weak network" : "Connected"}</span></div>{!isGuestLink && <a className="logout-button" href="/signout-with-chatgpt?return_to=%2F" target="_top" onClick={clearHostSignInTracking}><LogOut size={16}/> Log out</a>}</div></header><div className="studio-grid"><aside className="left-rail"><section className="panel"><span className="eyebrow">ROOM ACCESS</span><h2>Invite FamGuests</h2>{inviteUrl ? <><button className="copy-link" onClick={async () => { await navigator.clipboard.writeText(inviteUrl); flash("FamGuest link copied"); }}><Copy/> Copy guest link</button><small>Expires automatically after 8 hours.</small></> : <p>Waiting for the host invitation.</p>}</section>{waiting.length > 0 && <section className="panel waiting"><span className="eyebrow">WAITING ROOM</span><h2>{waiting.length} waiting</h2>{waiting.map(guest => <div className="waiting-person" key={guest.identity}><span>{guest.name[0]?.toUpperCase()}</span><b>{guest.name}</b><button onClick={() => approve(guest)}><Check/></button></div>)}</section>}<section className="panel"><span className="eyebrow">DATA MODE</span><h2>{mode === "data" ? "Data saver" : mode === "quality" ? "High quality" : "Balanced"}</h2><p>Adaptive video sends only the quality each screen needs.</p></section></aside><section className="stage"><div className={`participant-grid count-${participants.length}`}>{status === "waiting" ? <div className="waiting-screen"><ShieldCheck/><h2>Waiting for the host</h2><p>Your camera and microphone stay off until you are admitted.</p></div> : participants.map((participant, index) => <MediaTile key={participant.identity} participant={participant} featured={index === 0} isHost={participants[0] instanceof LocalParticipant && participants[0].identity.startsWith("host-")} onRemove={() => removeParticipant(participant)}/>)}</div><div className="stage-tools"><button onClick={() => setWhiteboard(true)}><Sparkles/> Whiteboard</button><button onClick={() => room && publish(room, { type: "hand" })}><Hand/> Raise hand</button><button onClick={startRecording} className={recording ? "danger" : ""}><span className="record-dot"/> {recording ? "Stop recording" : "Record"}</button><span><Users/> {participants.length}</span></div></section><aside className="chat-panel"><div className="chat-title"><div><span className="eyebrow">ROOM PULSE</span><h2>Live conversation</h2></div><MessageCircle/></div><div className="message-list">{messages.length === 0 && <div className="empty-chat"><MessageCircle/><b>No messages yet</b><span>Start the conversation.</span></div>}{messages.map(item => <article key={item.id} className={item.own ? "own" : ""}><div><b>{item.sender}</b>{item.kind === "caption" && <small>CAPTION</small>}</div><p>{item.text}</p></article>)}</div><div className="reaction-row">{reactions.map(emoji => <button key={emoji} onClick={() => room && publish(room, { type: "reaction", emoji })}>{emoji}</button>)}</div><form className="message-form" onSubmit={event => { event.preventDefault(); sendMessage(); }}><input value={message} onChange={event => setMessage(event.target.value)} maxLength={500} placeholder="Message everyone…"/><button><Send/></button></form></aside></div><footer className="control-dock"><button onClick={toggleMic} className={!microphone ? "off" : ""}>{microphone ? <Mic/> : <MicOff/>}<span>{microphone ? "Mute" : "Unmute"}</span></button><button onClick={toggleCamera} className={!camera ? "off" : ""}>{camera ? <Camera/> : <CameraOff/>}<span>{camera ? "Camera" : "Start video"}</span></button><button onClick={toggleShare} className={sharing ? "active" : ""}><MonitorUp/><span>{sharing ? "Stop sharing" : "Share screen"}</span></button><button onClick={() => { setCaptioning(!captioning); flash(captioning ? "Captions stopped" : "Live captions ready when supported by the browser"); }} className={captioning ? "active" : ""}><Settings2/><span>Captions</span></button><button onClick={leave} className="leave"><PhoneOff/><span>Leave</span></button></footer><Whiteboard room={room} open={whiteboard} onClose={() => setWhiteboard(false)}/>{toast && <output className="toast">{toast}</output>}</main>;
}
