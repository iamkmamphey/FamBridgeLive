import { Room, RoomEvent, Track } from "livekit-client"
import { BackgroundProcessor, supportsBackgroundProcessors } from "@livekit/track-processors"

const $ = s => document.querySelector(s)
const ROOM_INDEX_KEY = "livebridge:rooms"
const IDENTITY_KEY = "livebridge:identity"
const SAVED_SOURCES_KEY = "fambridgelive:saved-sources"
const PRESENCE_TTL = 15000
const params = new URLSearchParams(location.search)
let roomId = params.get("room") || crypto.randomUUID().replaceAll("-", "")
let identity = JSON.parse(sessionStorage.getItem(IDENTITY_KEY) || "null")
let participants = []
let sourceIndex = 0, recordingTimer, seconds = 0, cameraStream, screenStream, recordingStream, mediaRecorder, saveHandle, channel, activeTab = "chat"
let liveRoom, liveToken = "", liveKitConfigured = false, connectingToLiveKit = false, backgroundProcessor
let hostAccessKey = ""
let recordedChunks = []
const sourcePresets = [["camera","CAM","Paste guest invitation link…"],["zoom","Z","Paste Zoom meeting link…"],["meet","M","Paste Google Meet link…"],["whatsapp","WA","Paste WhatsApp call link…"],["rtmp","↗","Paste RTMP or livestream URL…"]]

function roomKey(id = roomId) { return `livebridge:room:${id}` }
function readRoom(id = roomId) { try { const room = JSON.parse(localStorage.getItem(roomKey(id))) || { id, title: "Untitled live room", participants: {}, sources: {}, messages: [] }; room.participants ||= {}; room.sources ||= {}; room.messages ||= []; return room } catch { return { id, title: "Untitled live room", participants: {}, sources: {}, messages: [] } } }
function saveRoom(room) { localStorage.setItem(roomKey(room.id), JSON.stringify(room)); const rooms = JSON.parse(localStorage.getItem(ROOM_INDEX_KEY) || "[]").filter(r => r.id !== room.id); rooms.unshift({ id: room.id, title: room.title, updatedAt: Date.now() }); localStorage.setItem(ROOM_INDEX_KEY, JSON.stringify(rooms.slice(0, 20))); renderRoomPicker() }
function inviteUrl() { const url = new URL(location.href); url.searchParams.set("room", roomId); url.hash = "join"; return url.toString() }
function initials(name) { return name.split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase() || "G" }
function safe(value) { const element = document.createElement("span"); element.textContent = String(value ?? ""); return element.innerHTML }
function renderIdentity() { if (identity?.role !== "Host") return; const shortName = initials(identity.name); $("#hostName").textContent = identity.name; $("#hostInitials").textContent = shortName; $("#hostAvatar").textContent = shortName; $("#hostAvatar").setAttribute("aria-label", `${identity.name}, host`) }
function applyRoleView() {
  const guest = identity?.role === "Guest link" || location.hash === "#join"
  document.body.classList.toggle("guest-mode", guest)
  document.documentElement.classList.toggle("guest-mode", guest)
  if (!identity) return
  const shortName = initials(identity.name)
  $("#hostName").textContent = identity.name; $("#hostInitials").textContent = shortName; $("#hostAvatar").textContent = shortName
  $("#identityRole").textContent = guest ? "Guest" : "Host"; $("#roleBadge").textContent = guest ? "GUEST" : "HOST"
  $("#cameraEyebrow").textContent = guest ? "YOUR CAMERA" : "02 / HOST CAMERA"
  $("#roomTitle").contentEditable = guest ? "false" : "true"
  if ($("#clearWhiteboard")) $("#clearWhiteboard").hidden = guest
  if ($("#penColor")) $("#penColor").hidden = guest
  if (guest && activeTab === "queue") { activeTab = "chat"; document.querySelector('[data-tab="chat"]')?.classList.add("active") }
}
function colorFor(value) { let n = 0; for (const c of value) n = (n * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${n % 360} 28% 40%)` }
function ensureRoomUrl() { const url = new URL(location.href); url.searchParams.set("room", roomId); history.replaceState({}, "", url) }
function renderRoomPicker() { const rooms = JSON.parse(localStorage.getItem(ROOM_INDEX_KEY) || "[]"); $("#roomPicker").innerHTML = [{ id: roomId, title: readRoom().title }, ...rooms.filter(r => r.id !== roomId)].map(r => `<option value="${r.id}" ${r.id === roomId ? "selected" : ""}>${r.title} · ${r.id}</option>`).join("") }
function addSource(preset = sourcePresets[sourceIndex++ % sourcePresets.length]) { const row = document.createElement("div"); row.className = "source-item"; row.dataset.sourceType = preset[0]; row.innerHTML = `<span class="source-icon ${preset[0]}">${preset[1]}</span><input placeholder="${preset[2]}" aria-label="Source link"><button aria-label="Remove source">×</button>`; row.querySelector("button").onclick = () => row.remove(); $("#sourceList").append(row) }
sourcePresets.forEach(addSource)

function savedSources() { try { return JSON.parse(localStorage.getItem(SAVED_SOURCES_KEY)) || [] } catch { return [] } }
function saveSourceForLater(source) { const items = savedSources().filter(item => item.url !== source.url); items.unshift(source); localStorage.setItem(SAVED_SOURCES_KEY, JSON.stringify(items.slice(0, 30))) }
function restoreSavedSources() { for (const source of savedSources()) { const row = [...document.querySelectorAll(".source-item")].find(item => item.dataset.sourceType === source.type && !item.querySelector("input").value); if (row) row.querySelector("input").value = source.url } }
function sourcePreset(type) { return sourcePresets.find(item => item[0] === type) || sourcePresets[0] }

function liveParticipants() {
  if (!liveRoom || liveRoom.state !== "connected") return null
  const people = [liveRoom.localParticipant, ...liveRoom.remoteParticipants.values()]
  return people.map(person => {
    let metadata = {}; try { metadata = JSON.parse(person.metadata || "{}") } catch {}
    const publications = [...person.trackPublications.values()]
    return { id: person.identity, name: person.name || person.identity, role: metadata.role === "host" ? "Host" : "Guest", status: "Live", live: person, audioTrackSid: publications.find(p => p.source === Track.Source.Microphone)?.trackSid, videoTrackSid: publications.find(p => p.source === Track.Source.Camera)?.trackSid }
  })
}

function attachParticipantTracks() {
  if (!liveRoom) return
  for (const person of [liveRoom.localParticipant, ...liveRoom.remoteParticipants.values()]) {
    const container = document.querySelector(`[data-id="${CSS.escape(person.identity)}"] .participant-bg`)
    if (!container) continue
    for (const publication of person.trackPublications.values()) {
      if (!publication.track || publication.kind !== Track.Kind.Video) continue
      const element = publication.track.attach()
      element.autoplay = true; element.playsInline = true; element.className = "participant-video"
      if (person === liveRoom.localParticipant) element.muted = true
      container.querySelector("video")?.remove(); container.append(element)
    }
  }
}

function receiveRoomData(payload) {
  try {
    const message = JSON.parse(new TextDecoder().decode(payload))
    if (message.type === "chat") { const room = readRoom(); room.messages.push(message); saveRoom(room); renderActivity(); }
    if (message.type === "reaction") showToast(`${message.name} reacted ${message.emoji}`)
    if (message.type === "reaction") { const room = readRoom(); room.messages.push({ ...message, text: message.emoji, reaction: true, createdAt: message.createdAt || Date.now() }); saveRoom(room); renderActivity() }
    if (message.type === "room-title" && typeof message.title === "string") { const room = readRoom(); room.title = message.title.slice(0, 80); saveRoom(room); $("#roomTitle").textContent = room.title }
    if (message.type === "whiteboard") applyWhiteboardEvent(message)
  } catch {}
}

async function connectLiveRoom() {
  if (!identity || !liveKitConfigured || connectingToLiveKit) return
  connectingToLiveKit = true
  try {
    if (liveRoom) await liveRoom.disconnect()
    const response = await fetch("/api/livekit/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room_name: roomId, participant_name: identity.name, participant_identity: identity.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64), role: identity.role === "Host" ? "host" : "guest", host_access_key: identity.role === "Host" ? hostAccessKey : undefined }) })
    const credentials = await response.json()
    if (!response.ok) throw new Error(credentials.error || "Could not join LiveKit")
    liveToken = credentials.participant_token
    liveRoom = new Room({ adaptiveStream: true, dynacast: true })
    const refresh = () => { renderParticipants(); renderActivity(); requestAnimationFrame(attachParticipantTracks) }
    liveRoom.on(RoomEvent.ParticipantConnected, refresh)
    liveRoom.on(RoomEvent.ParticipantDisconnected, refresh)
    liveRoom.on(RoomEvent.TrackSubscribed, refresh)
    liveRoom.on(RoomEvent.TrackUnsubscribed, refresh)
    liveRoom.on(RoomEvent.TrackPublished, refresh)
    liveRoom.on(RoomEvent.TrackUnpublished, refresh)
    liveRoom.on(RoomEvent.DataReceived, receiveRoomData)
    liveRoom.on(RoomEvent.Disconnected, refresh)
    await liveRoom.connect(credentials.server_url, credentials.participant_token)
    $(".status-pill").innerHTML = "<i></i> LiveKit connected"
    renderParticipants(); renderActivity(); showToast("Connected to the live room")
  } catch (error) {
    console.error(error); showToast(error.message || "LiveKit connection failed")
  } finally { connectingToLiveKit = false }
}

function renderParticipants() {
  const now = Date.now(), room = readRoom()
  const livePeople = liveParticipants() || Object.values(room.participants || {}).filter(p => now - p.lastSeen < PRESENCE_TTL).map(p => ({ ...p, status: "Preview" }))
  participants = livePeople
  $("#participantGrid").innerHTML = participants.map((p, i) => `<article class="participant ${i === 0 ? "featured" : ""}" tabindex="0" data-id="${safe(p.id)}"><div class="participant-bg" style="--c1:${colorFor(p.id)};--c2:#202936"><div class="person-face">${safe(initials(p.name))}</div></div><div class="participant-top"><strong>${safe(p.name)}</strong><span class="source-chip">${safe(p.role || "Guest link")}</span></div>${identity?.role === "Host" && p.id !== identity.id ? `<div class="moderation-actions"><button data-action="mute-audio" title="Mute microphone">Mic off</button><button data-action="mute-video" title="Stop camera">Camera off</button><button class="remove" data-action="remove" title="Remove from room">Remove</button></div>` : ""}<div class="participant-bottom"><span>● ${safe(p.status)}</span><span class="mute-indicator">${p.live?.isMicrophoneEnabled ? "♩" : "♩̸"}</span><span class="signal"><i></i><i></i><i></i></span></div></article>`).join("") || `<div class="empty-room"><strong>No one is here yet</strong><span>Copy the invite link to bring guests into this LiveKit room.</span></div>`
  $("#participantCount").textContent = livePeople.length
  document.querySelectorAll(".participant").forEach(card => card.onclick = () => { document.querySelector(".participant.featured")?.classList.remove("featured"); card.classList.add("featured"); showToast(`${participants.find(p => p.id === card.dataset.id)?.name} moved to the main stage`) })
  document.querySelectorAll(".moderation-actions button").forEach(button => button.onclick = async event => { event.stopPropagation(); const card = button.closest(".participant"), person = participants.find(p => p.id === card.dataset.id), action = button.dataset.action, trackSid = action === "mute-audio" ? person.audioTrackSid : person.videoTrackSid; if (action !== "remove" && !trackSid) return showToast(`No active ${action === "mute-audio" ? "microphone" : "camera"} track`); try { const response = await fetch("/api/livekit/moderate", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${liveToken}` }, body: JSON.stringify({ room: roomId, participant_identity: person.id, action, track_sid: trackSid }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); showToast(action === "remove" ? `${person.name} removed` : `${person.name}'s ${action === "mute-audio" ? "microphone" : "camera"} stopped`) } catch (error) { showToast(error.message || "Moderation failed") } })
  requestAnimationFrame(attachParticipantTracks)
  if (activeTab === "people") renderActivity()
}
function renderActivity() {
  const room = readRoom()
  const form = $("#messageForm")
  if (activeTab === "chat") {
    const messages = room.messages.length ? room.messages : [{ id: "welcome", name: "Fambridgelive", text: "Welcome to the room. Comments from native room participants appear here.", color: "#f6c258", createdAt: Date.now() }]
    $("#messages").innerHTML = messages.map(m => `<div class="message ${m.id === identity?.id ? "host" : ""} ${m.reaction ? "reaction-message" : ""}"><span class="message-avatar" style="--avatar:${m.color || colorFor(m.id)}">${safe(initials(m.name).slice(0,1))}</span><div><div class="message-head"><b>${safe(m.name)}</b><time>${new Date(m.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</time></div><p>${safe(m.text)}</p></div></div>`).join("")
    $("#messageCount").textContent = room.messages.length
    form.hidden = false
  } else if (activeTab === "people") {
    $("#messages").innerHTML = participants.map(p => `<div class="message"><span class="message-avatar" style="--avatar:${colorFor(p.id)}">${safe(initials(p.name).slice(0,1))}</span><div><div class="message-head"><b>${safe(p.name)}</b><time>${safe(p.status)}</time></div><p>${safe(p.role || "Guest")}</p></div></div>`).join("") || `<div class="empty-activity">No participants are connected yet.</div>`
    $("#messageCount").textContent = participants.length
    form.hidden = true
  } else {
    $("#messages").innerHTML = `<div class="empty-activity">The guest queue is empty.</div>`
    $("#messageCount").textContent = "0"
    form.hidden = true
  }
}
function showToast(text) { const t = $("#toast"); t.textContent = text; t.classList.add("show"); clearTimeout(t._id); t._id = setTimeout(() => t.classList.remove("show"), 2400) }
function formatTime(s) { return new Date(s * 1000).toISOString().slice(11, 19) }
function announce() { if (!identity) return; const room = readRoom(); room.title = $("#roomTitle").textContent.trim() || room.title; if (!liveKitConfigured) room.participants[identity.id] = { ...identity, lastSeen: Date.now(), role: identity.role || "Guest link" }; saveRoom(room); channel?.postMessage({ type: "presence" }); renderParticipants(); renderActivity() }
async function openRoom(id) { channel?.close(); if (liveRoom) await liveRoom.disconnect(); roomId = id; ensureRoomUrl(); const room = readRoom(); $("#roomTitle").textContent = room.title; channel = new BroadcastChannel(`fambridgelive:${roomId}`); channel.onmessage = () => { renderParticipants(); renderActivity() }; announce(); renderRoomPicker(); renderActivity(); if (identity) connectLiveRoom(); showToast(`Loaded ${room.title}`) }

$("#joinForm").onsubmit = async e => { e.preventDefault(); const name = $("#joinName").value.trim(); const role = location.hash === "#join" ? "Guest link" : "Host"; hostAccessKey = role === "Host" ? $("#hostAccessKey").value : ""; identity = { id: identity?.id || crypto.randomUUID(), name, role }; sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity)); localStorage.setItem(`${IDENTITY_KEY}:last-name`, name); applyRoleView(); renderIdentity(); $("#joinDialog").close(); announce(); await connectLiveRoom(); hostAccessKey = ""; $("#hostAccessKey").value = ""; showToast(role === "Host" ? `Host set to ${name}` : `Joined room as ${name}`) }
$("#newRoomBtn").onclick = () => { roomId = crypto.randomUUID().replaceAll("-", ""); saveRoom({ id: roomId, title: "Untitled live room", participants: {}, sources: {}, messages: [] }); openRoom(roomId) }
$("#roomPicker").onchange = e => openRoom(e.target.value)
$("#saveSourcesBtn").onclick = () => { const rows = [...document.querySelectorAll(".source-item")].filter(row => row.querySelector("input").value.trim()); if (!rows.length) return showToast("Add at least one link to save"); let saved = 0; for (const row of rows) { try { const url = new URL(row.querySelector("input").value.trim()); const type = row.dataset.sourceType || "camera"; const labels = { zoom: "Zoom source", meet: "Google Meet source", whatsapp: "WhatsApp source", rtmp: "RTMP stream", camera: "Guest link" }; saveSourceForLater({ id: `saved-${type}-${url.hostname}-${url.pathname}`, type, name: labels[type], role: url.hostname.replace(/^www\./, ""), url: url.toString() }); saved++ } catch {} } showToast(`${saved} link${saved === 1 ? "" : "s"} saved for next time`) }
async function saveMeetingTitle() { if (identity?.role !== "Host") return; const room = readRoom(); room.title = $("#roomTitle").textContent.trim().slice(0, 80) || "Untitled live room"; $("#roomTitle").textContent = room.title; saveRoom(room); if (liveRoom?.state === "connected") await liveRoom.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type: "room-title", title: room.title })), { reliable: true }); channel?.postMessage({ type: "title" }); renderRoomPicker(); showToast("Meeting name saved") }
$("#roomTitle").addEventListener("blur", saveMeetingTitle)
$("#roomTitle").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur() } })
$("#addSourceBtn").onclick = () => addSource()
$("#connectBtn").onclick = () => {
  const rows = [...document.querySelectorAll(".source-item")].filter(row => row.querySelector("input").value.trim())
  if (!rows.length) return showToast("Add at least one live or guest link first")
  const room = readRoom()
  let connected = 0, invalid = 0
  for (const row of rows) {
    const input = row.querySelector("input")
    try {
      const url = new URL(input.value.trim())
      const type = row.dataset.sourceType || "camera"
      const labels = { zoom: "Zoom source", meet: "Google Meet source", whatsapp: "WhatsApp source", rtmp: "RTMP stream", camera: "Guest link" }
      const id = `source-${type}-${url.hostname}-${url.pathname}`
      const source = { id, type, name: labels[type], role: url.hostname.replace(/^www\./, ""), url: url.toString() }
      room.sources[id] = source
      row.classList.add("connected")
      input.disabled = true
      connected++
    } catch { invalid++; row.classList.add("invalid") }
  }
  saveRoom(room)
  channel?.postMessage({ type: "sources" })
  renderParticipants()
  showToast(connected ? `${connected} source${connected > 1 ? "s" : ""} connected and added to the room${invalid ? ` · ${invalid} invalid` : ""}` : "Enter a complete URL beginning with https://")
}
$("#copyInviteBtn").onclick = $("#inviteBtn").onclick = async () => { const url = inviteUrl(); try { await navigator.clipboard.writeText(url); showToast("Room invite link copied") } catch { showToast("Invite link ready: " + url) } }
$("#cameraBtn").onclick = async () => { try { if (liveRoom?.state === "connected") { const enabled = !liveRoom.localParticipant.isCameraEnabled; await liveRoom.localParticipant.setCameraEnabled(enabled); $("#cameraState").textContent = enabled ? "Camera live" : "Camera off"; $("#cameraBtn").classList.toggle("active", enabled); renderParticipants(); return } if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; $("#hostVideo").style.display = "none"; $(".camera-placeholder").style.display = "flex"; $("#cameraState").textContent = "Camera off"; $("#cameraBtn").classList.remove("active") } else { cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); $("#hostVideo").srcObject = cameraStream; $("#hostVideo").style.display = "block"; $(".camera-placeholder").style.display = "none"; $("#cameraState").textContent = "Camera preview"; $("#cameraBtn").classList.add("active") } } catch { showToast("Camera permission was not granted") } }
$("#micBtn").onclick = async e => { try { const enabled = !e.currentTarget.classList.contains("active"); if (liveRoom?.state === "connected") await liveRoom.localParticipant.setMicrophoneEnabled(enabled); else cameraStream?.getAudioTracks().forEach(t => t.enabled = enabled); e.currentTarget.classList.toggle("active", enabled); renderParticipants(); showToast(enabled ? "Microphone on" : "Microphone muted") } catch { showToast("Microphone permission was not granted") } }
$("#shareBtn").onclick = async e => { try { if (liveRoom?.state === "connected") { const enabled = !liveRoom.localParticipant.isScreenShareEnabled; await liveRoom.localParticipant.setScreenShareEnabled(enabled, { audio: true }); e.currentTarget.classList.toggle("active", enabled); $("#cameraState").textContent = enabled ? "Sharing screen" : (liveRoom.localParticipant.isCameraEnabled ? "Camera live" : "Camera off"); renderParticipants(); showToast(enabled ? "Your desktop is shared with the room" : "Screen sharing ended"); return } if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); return } screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); $("#hostVideo").srcObject = screenStream; $("#hostVideo").classList.add("screen-share"); $("#hostVideo").style.display = "block"; $(".camera-placeholder").style.display = "none"; $("#cameraState").textContent = "Sharing preview"; e.currentTarget.classList.add("active"); screenStream.getVideoTracks()[0].onended = () => { screenStream = null; e.currentTarget.classList.remove("active"); $("#hostVideo").style.display = "none"; $(".camera-placeholder").style.display = "flex" }; } catch { showToast("Screen sharing cancelled") } }
async function setBackground(mode, imagePath) { try { if (!liveRoom?.localParticipant.isCameraEnabled) return showToast("Turn on your camera first"); if (!supportsBackgroundProcessors()) return showToast("Background effects are not supported in this browser"); const publication = liveRoom.localParticipant.getTrackPublication(Track.Source.Camera), videoTrack = publication?.videoTrack; if (!videoTrack) return showToast("Camera track is not ready"); if (mode === "none") { await videoTrack.stopProcessor(); backgroundProcessor = null; return showToast("Camera background removed") } if (backgroundProcessor) await videoTrack.stopProcessor(); backgroundProcessor = BackgroundProcessor(mode === "blur" ? { mode: "background-blur", blurRadius: 12 } : { mode: "virtual-background", imagePath }); await videoTrack.setProcessor(backgroundProcessor); showToast(mode === "blur" ? "Background blurred" : "Background image applied") } catch (error) { console.error(error); showToast("Background effect could not be applied") } }
$("#backgroundMode").onchange = e => { if (e.target.value === "image") $("#backgroundImage").click(); else setBackground(e.target.value) }
$("#backgroundImage").onchange = e => { const file = e.target.files[0]; if (!file) return; setBackground("image", URL.createObjectURL(file)) }
$("#leaveBtn").onclick = async () => { await liveRoom?.disconnect(); cameraStream?.getTracks().forEach(t => t.stop()); const room = readRoom(); if (identity) delete room.participants[identity.id]; saveRoom(room); channel?.postMessage({ type: "presence" }); location.hash = "join"; $("#joinDialog").showModal() }
$("#recordBtn").onclick = () => { if (mediaRecorder?.state === "recording") { mediaRecorder.stop(); return } $("#recordDialog").showModal() }
$("#closeRecordDialog").onclick = () => $("#recordDialog").close()
$("#recordForm").onsubmit = async e => {
  e.preventDefault()
  const requestedMime = $("#recordFormat").value
  const mimeType = MediaRecorder.isTypeSupported(requestedMime) ? requestedMime : "video/webm"
  const extension = mimeType.includes("mp4") ? "mp4" : "webm"
  try {
    if ("showSaveFilePicker" in window) saveHandle = await window.showSaveFilePicker({ suggestedName: `Fambridgelive-${new Date().toISOString().replace(/[:.]/g,"-")}.${extension}`, types: [{ description: `${extension.toUpperCase()} video`, accept: { [mimeType.split(";")[0]]: [`.${extension}`] } }] })
    recordingStream = $("#recordSource").value === "screen" ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }) : (cameraStream || await navigator.mediaDevices.getUserMedia({ video: true, audio: true }))
    recordedChunks = []
    mediaRecorder = new MediaRecorder(recordingStream, { mimeType })
    mediaRecorder.ondataavailable = event => { if (event.data.size) recordedChunks.push(event.data) }
    mediaRecorder.onstop = async () => { clearInterval(recordingTimer); const blob = new Blob(recordedChunks, { type: mimeType }); if (saveHandle) { const writable = await saveHandle.createWritable(); await writable.write(blob); await writable.close() } else { const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `Fambridgelive-recording.${extension}`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000) } if (recordingStream !== cameraStream && recordingStream !== screenStream) recordingStream.getTracks().forEach(t => t.stop()); const b = $("#recordBtn"); b.classList.remove("recording"); b.querySelector("span").textContent = "Start recording"; showToast("Recording saved") }
    mediaRecorder.start(1000); seconds = 0; const b = $("#recordBtn"); b.classList.add("recording"); b.querySelector("span").textContent = "Stop & save"; b.querySelector("time").textContent = "00:00:00"; recordingTimer = setInterval(() => b.querySelector("time").textContent = formatTime(++seconds), 1000); $("#recordDialog").close(); showToast("Recording started")
  } catch (error) { if (error?.name !== "AbortError") showToast("Recording could not start") }
}
async function sendReaction(emoji) { const message = { type: "reaction", id: identity.id, emoji, text: emoji, reaction: true, name: identity.name, createdAt: Date.now() }; const room = readRoom(); room.messages.push(message); saveRoom(room); renderActivity(); if (liveRoom?.state === "connected") await liveRoom.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), { reliable: true }); showToast(`${emoji} reaction sent to everyone`) }
$("#reactionRow").onclick = e => { if (e.target.tagName === "BUTTON") sendReaction(e.target.textContent) }
$("#chatReactions").onclick = e => { if (e.target.tagName === "BUTTON") sendReaction(e.target.textContent) }
$("#muteAllBtn").onclick = async () => { const buttons = [...document.querySelectorAll('[data-action="mute-audio"]')]; if (!buttons.length) return showToast("No guest microphones are active"); buttons.forEach(button => button.click()); showToast("All guest microphones muted") }
$("#layoutBtn").onclick = e => { const g = $("#participantGrid"); g.classList.toggle("compact"); e.currentTarget.textContent = g.classList.contains("compact") ? "▦ Focus" : "▦ Grid"; document.querySelectorAll(".participant").forEach(p => p.classList.remove("featured")); showToast("Room layout changed") }
$("#messageForm").onsubmit = async e => { e.preventDefault(); const input = $("#messageInput"); if (!input.value.trim() || !identity) return; const message = { type: "chat", id: identity.id, name: identity.name, text: input.value.trim(), color: colorFor(identity.id), createdAt: Date.now() }; const room = readRoom(); room.messages.push(message); saveRoom(room); if (liveRoom?.state === "connected") await liveRoom.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), { reliable: true }); input.value = ""; channel?.postMessage({ type: "message" }); renderActivity(); $("#messages").scrollTop = $("#messages").scrollHeight }
document.querySelectorAll(".tabs button").forEach(t => t.onclick = () => { document.querySelectorAll(".tabs button").forEach(x => x.classList.remove("active")); t.classList.add("active"); activeTab = t.dataset.tab; renderActivity() })
const whiteboardButton = document.createElement("button"); whiteboardButton.id = "whiteboardBtn"; whiteboardButton.textContent = "✎ Whiteboard"; $("#layoutBtn").before(whiteboardButton)
const whiteboard = $("#whiteboard"), boardContext = whiteboard.getContext("2d")
function drawBoardLine(event) { boardContext.strokeStyle = event.color || "#17211d"; boardContext.lineWidth = 4; boardContext.lineCap = "round"; boardContext.beginPath(); boardContext.moveTo(event.from[0] * whiteboard.width, event.from[1] * whiteboard.height); boardContext.lineTo(event.to[0] * whiteboard.width, event.to[1] * whiteboard.height); boardContext.stroke() }
function applyWhiteboardEvent(event) { if (event.action === "open") $("#whiteboardDialog").showModal(); else if (event.action === "clear") boardContext.clearRect(0, 0, whiteboard.width, whiteboard.height); else if (event.action === "draw") drawBoardLine(event) }
async function sendBoardEvent(message) { applyWhiteboardEvent(message); if (liveRoom?.state === "connected") await liveRoom.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), { reliable: true }) }
whiteboardButton.onclick = () => { if (identity?.role === "Host") sendBoardEvent({ type: "whiteboard", action: "open" }) }
$("#closeWhiteboard").onclick = () => $("#whiteboardDialog").close()
$("#clearWhiteboard").onclick = () => { if (identity?.role === "Host") sendBoardEvent({ type: "whiteboard", action: "clear" }) }
let drawing = false, previousPoint
function boardPoint(event) { const box = whiteboard.getBoundingClientRect(); return [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height] }
whiteboard.onpointerdown = event => { if (identity?.role !== "Host") return; drawing = true; previousPoint = boardPoint(event); whiteboard.setPointerCapture(event.pointerId) }
whiteboard.onpointermove = event => { if (!drawing || identity?.role !== "Host") return; const point = boardPoint(event), message = { type: "whiteboard", action: "draw", from: previousPoint, to: point, color: $("#penColor").value }; previousPoint = point; sendBoardEvent(message) }
whiteboard.onpointerup = whiteboard.onpointercancel = () => { drawing = false }
if (identity?.role !== "Host") { $("#clearWhiteboard").hidden = true; $("#penColor").hidden = true }
$("#settingsBtn").onclick = () => $("#integrationDialog").showModal()
$("#integrationDialog").addEventListener("close", () => { if ($("#integrationDialog").returnValue === "default") showToast("Integration preferences saved for this demo") })
document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") $("#connectBtn").click() })
window.addEventListener("storage", e => { if (e.key === roomKey()) { renderParticipants(); renderActivity() } })
window.addEventListener("beforeunload", announce)
function installTooltips() { const labels = { layoutBtn: "Switch between grid and focus layouts", muteAllBtn: "Mute all participants", inviteBtn: "Copy a guest invite link", recordBtn: "Start or stop a local recording", saveSourcesBtn: "Save every entered source link for next time" }; document.querySelectorAll("button").forEach(button => { if (!button.title) button.title = labels[button.id] || button.getAttribute("aria-label") || button.textContent.trim() || "Action" }); const reactions = ["Like","Applaud","Send love","Send fire reaction","Laugh","Celebrate","Pray","Surprised","Sad","Thinking","One hundred","Share an idea"]; document.querySelectorAll("#reactionRow button").forEach((button, i) => { button.title = reactions[i]; button.setAttribute("aria-label", reactions[i]) }) }
if (typeof MediaRecorder === "undefined") $("#recordBtn").disabled = true
else [...$("#recordFormat").options].forEach(option => { option.disabled = !MediaRecorder.isTypeSupported(option.value) })
restoreSavedSources(); installTooltips(); new MutationObserver(installTooltips).observe(document.body, { childList: true, subtree: true })
ensureRoomUrl(); fetch("/api/livekit/status").then(r => r.json()).then(status => { liveKitConfigured = status.configured; $(".status-pill").innerHTML = status.configured ? "<i></i> LiveKit ready" : "<i></i> Setup needed"; openRoom(roomId) }).catch(() => openRoom(roomId)); renderActivity(); setInterval(announce, 5000)
if (identity) renderIdentity()
applyRoleView()
if (!identity || location.hash === "#join" || identity?.role === "Host") { const joiningAsGuest = location.hash === "#join"; $("#joinNameLabel").textContent = joiningAsGuest ? "Guest display name" : "Host display name"; $("#hostCodeField").hidden = joiningAsGuest; $("#hostAccessKey").required = !joiningAsGuest; $("#joinName").value = joiningAsGuest ? "" : (identity?.name || localStorage.getItem(`${IDENTITY_KEY}:last-name`) || ""); $("#joinDialog").showModal() } else announce()
