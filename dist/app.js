const $ = s => document.querySelector(s)
const ROOM_INDEX_KEY = "livebridge:rooms"
const IDENTITY_KEY = "livebridge:identity"
const PRESENCE_TTL = 15000
const params = new URLSearchParams(location.search)
let roomId = params.get("room") || crypto.randomUUID().slice(0, 8)
let identity = JSON.parse(localStorage.getItem(IDENTITY_KEY) || "null")
let participants = []
const messages = [["LiveBridge", "Welcome to the room. Share the invite link to bring guests in automatically.", "#f6c258"]]
let sourceIndex = 0, recordingTimer, seconds = 0, cameraStream, channel
const sourcePresets = [["camera","CAM","Paste guest invitation link…"],["zoom","Z","Paste Zoom meeting link…"],["meet","M","Paste Google Meet link…"],["rtmp","↗","Paste RTMP or livestream URL…"]]

function roomKey(id = roomId) { return `livebridge:room:${id}` }
function readRoom(id = roomId) { try { return JSON.parse(localStorage.getItem(roomKey(id))) || { id, title: "Untitled live room", participants: {} } } catch { return { id, title: "Untitled live room", participants: {} } } }
function saveRoom(room) { localStorage.setItem(roomKey(room.id), JSON.stringify(room)); const rooms = JSON.parse(localStorage.getItem(ROOM_INDEX_KEY) || "[]").filter(r => r.id !== room.id); rooms.unshift({ id: room.id, title: room.title, updatedAt: Date.now() }); localStorage.setItem(ROOM_INDEX_KEY, JSON.stringify(rooms.slice(0, 20))); renderRoomPicker() }
function inviteUrl() { const url = new URL(location.href); url.searchParams.set("room", roomId); url.hash = "join"; return url.toString() }
function initials(name) { return name.split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase() || "G" }
function colorFor(value) { let n = 0; for (const c of value) n = (n * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${n % 360} 28% 40%)` }
function ensureRoomUrl() { const url = new URL(location.href); url.searchParams.set("room", roomId); history.replaceState({}, "", url) }
function renderRoomPicker() { const rooms = JSON.parse(localStorage.getItem(ROOM_INDEX_KEY) || "[]"); $("#roomPicker").innerHTML = [{ id: roomId, title: readRoom().title }, ...rooms.filter(r => r.id !== roomId)].map(r => `<option value="${r.id}" ${r.id === roomId ? "selected" : ""}>${r.title} · ${r.id}</option>`).join("") }
function addSource(preset = sourcePresets[sourceIndex++ % sourcePresets.length]) { const row = document.createElement("div"); row.className = "source-item"; row.innerHTML = `<span class="source-icon ${preset[0]}">${preset[1]}</span><input placeholder="${preset[2]}" aria-label="Source link"><button aria-label="Remove source">×</button>`; row.querySelector("button").onclick = () => row.remove(); $("#sourceList").append(row) }
sourcePresets.forEach(addSource)

function renderParticipants() {
  const now = Date.now(), room = readRoom()
  participants = Object.values(room.participants || {}).filter(p => now - p.lastSeen < PRESENCE_TTL)
  $("#participantGrid").innerHTML = participants.map((p, i) => `<article class="participant ${i === 0 ? "featured" : ""}" tabindex="0" data-id="${p.id}"><div class="participant-bg" style="--c1:${colorFor(p.id)};--c2:#202936"><div class="person-face">${initials(p.name)}</div></div><div class="participant-top"><strong>${p.name}</strong><span class="source-chip">${p.role || "Guest link"}</span></div><div class="participant-bottom"><span>● Live</span><span class="mute-indicator">♩</span><span class="signal"><i></i><i></i><i></i></span></div></article>`).join("") || `<div class="empty-room"><strong>No one is here yet</strong><span>Copy the invite link to bring guests into this room.</span></div>`
  $("#participantCount").textContent = participants.length
  document.querySelectorAll(".participant").forEach(card => card.onclick = () => { document.querySelector(".participant.featured")?.classList.remove("featured"); card.classList.add("featured"); showToast(`${participants.find(p => p.id === card.dataset.id)?.name} moved to the main stage`) })
}
function renderMessages() { $("#messages").innerHTML = messages.map((m, i) => `<div class="message ${m[0] === "You" ? "host" : ""}"><span class="message-avatar" style="--avatar:${m[2]}">${m[0][0]}</span><div><div class="message-head"><b>${m[0]}</b><time>${i + 1}m</time></div><p>${m[1]}</p></div></div>`).join(""); $("#messageCount").textContent = messages.length }
function showToast(text) { const t = $("#toast"); t.textContent = text; t.classList.add("show"); clearTimeout(t._id); t._id = setTimeout(() => t.classList.remove("show"), 2400) }
function formatTime(s) { return new Date(s * 1000).toISOString().slice(11, 19) }
function announce() { if (!identity) return; const room = readRoom(); room.title = $("#roomTitle").textContent.trim() || room.title; room.participants[identity.id] = { ...identity, lastSeen: Date.now(), role: identity.role || "Guest link" }; saveRoom(room); channel?.postMessage({ type: "presence" }); renderParticipants() }
function openRoom(id) { channel?.close(); roomId = id; ensureRoomUrl(); const room = readRoom(); $("#roomTitle").textContent = room.title; channel = new BroadcastChannel(`livebridge:${roomId}`); channel.onmessage = renderParticipants; announce(); renderRoomPicker(); showToast(`Loaded ${room.title}`) }

$("#joinForm").onsubmit = e => { e.preventDefault(); const name = $("#joinName").value.trim(); identity = { id: identity?.id || crypto.randomUUID(), name, role: location.hash === "#join" ? "Guest link" : "Host" }; localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity)); $("#joinDialog").close(); announce(); showToast(`Joined room as ${name}`) }
$("#newRoomBtn").onclick = () => { roomId = crypto.randomUUID().slice(0, 8); saveRoom({ id: roomId, title: "Untitled live room", participants: {} }); openRoom(roomId) }
$("#roomPicker").onchange = e => openRoom(e.target.value)
$("#roomTitle").addEventListener("blur", announce)
$("#addSourceBtn").onclick = () => addSource()
$("#connectBtn").onclick = () => { const urls = [...document.querySelectorAll(".source-item input")].filter(x => x.value.trim()); showToast(urls.length ? `${urls.length} source${urls.length > 1 ? "s" : ""} queued for secure connection` : "Add at least one live or guest link first") }
$("#copyInviteBtn").onclick = $("#inviteBtn").onclick = async () => { const url = inviteUrl(); try { await navigator.clipboard.writeText(url); showToast("Room invite link copied") } catch { showToast("Invite link ready: " + url) } }
$("#cameraBtn").onclick = async () => { try { if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; $("#hostVideo").style.display = "none"; $(".camera-placeholder").style.display = "flex"; $("#cameraState").textContent = "Camera off"; $("#cameraBtn").classList.remove("active") } else { cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); $("#hostVideo").srcObject = cameraStream; $("#hostVideo").style.display = "block"; $(".camera-placeholder").style.display = "none"; $("#cameraState").textContent = "Camera live"; $("#cameraBtn").classList.add("active") } } catch { showToast("Camera permission was not granted") } }
$("#micBtn").onclick = e => { e.currentTarget.classList.toggle("active"); const enabled = e.currentTarget.classList.contains("active"); cameraStream?.getAudioTracks().forEach(t => t.enabled = enabled); showToast(enabled ? "Microphone on" : "Microphone muted") }
$("#shareBtn").onclick = async () => { try { const s = await navigator.mediaDevices.getDisplayMedia({ video: true }); showToast("Screen share started"); s.getVideoTracks()[0].onended = () => showToast("Screen share ended") } catch { showToast("Screen sharing cancelled") } }
$("#leaveBtn").onclick = () => { cameraStream?.getTracks().forEach(t => t.stop()); const room = readRoom(); if (identity) delete room.participants[identity.id]; saveRoom(room); channel?.postMessage({ type: "presence" }); location.hash = "join"; $("#joinDialog").showModal() }
$("#recordBtn").onclick = e => { const b = e.currentTarget; b.classList.toggle("recording"); if (b.classList.contains("recording")) { b.querySelector("span").textContent = "Recording"; recordingTimer = setInterval(() => b.querySelector("time").textContent = formatTime(++seconds), 1000); showToast("Local session timer started") } else { clearInterval(recordingTimer); b.querySelector("span").textContent = "Start recording"; showToast("Recording stopped") } }
$("#reactionRow").onclick = e => { if (e.target.tagName === "BUTTON") showToast(`${e.target.textContent} reaction sent to everyone`) }
$("#muteAllBtn").onclick = () => { document.querySelectorAll(".participant").forEach(p => p.classList.add("muted")); showToast("All participant microphones muted") }
$("#layoutBtn").onclick = e => { const g = $("#participantGrid"); g.classList.toggle("compact"); e.currentTarget.textContent = g.classList.contains("compact") ? "▦ Focus" : "▦ Grid"; document.querySelectorAll(".participant").forEach(p => p.classList.remove("featured")); showToast("Room layout changed") }
$("#messageForm").onsubmit = e => { e.preventDefault(); const input = $("#messageInput"); if (!input.value.trim()) return; messages.push(["You", input.value.trim(), "#d9ff43"]); input.value = ""; renderMessages(); $("#messages").scrollTop = $("#messages").scrollHeight }
document.querySelectorAll(".tabs button").forEach(t => t.onclick = () => { document.querySelectorAll(".tabs button").forEach(x => x.classList.remove("active")); t.classList.add("active"); showToast(`${t.textContent.trim()} view selected`) })
$("#settingsBtn").onclick = () => $("#integrationDialog").showModal()
$("#integrationDialog").addEventListener("close", () => { if ($("#integrationDialog").returnValue === "default") showToast("Integration preferences saved for this demo") })
document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") $("#connectBtn").click() })
window.addEventListener("storage", e => { if (e.key === roomKey()) renderParticipants() })
window.addEventListener("beforeunload", announce)
ensureRoomUrl(); openRoom(roomId); renderMessages(); setInterval(announce, 5000)
if (!identity || location.hash === "#join") { $("#joinName").value = identity?.name || ""; $("#joinDialog").showModal() } else announce()
