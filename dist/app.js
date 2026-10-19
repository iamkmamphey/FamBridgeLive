const $ = s => document.querySelector(s)
const ROOM_INDEX_KEY = "livebridge:rooms"
const IDENTITY_KEY = "livebridge:identity"
const SAVED_SOURCES_KEY = "fambridgelive:saved-sources"
const PRESENCE_TTL = 15000
const params = new URLSearchParams(location.search)
let roomId = params.get("room") || crypto.randomUUID().slice(0, 8)
let identity = JSON.parse(sessionStorage.getItem(IDENTITY_KEY) || "null")
let participants = []
let sourceIndex = 0, recordingTimer, seconds = 0, cameraStream, screenStream, recordingStream, mediaRecorder, saveHandle, channel, activeTab = "chat"
let recordedChunks = []
const sourcePresets = [["camera","CAM","Paste guest invitation link…"],["zoom","Z","Paste Zoom meeting link…"],["meet","M","Paste Google Meet link…"],["whatsapp","WA","Paste WhatsApp call link…"],["rtmp","↗","Paste RTMP or livestream URL…"]]

function roomKey(id = roomId) { return `livebridge:room:${id}` }
function readRoom(id = roomId) { try { const room = JSON.parse(localStorage.getItem(roomKey(id))) || { id, title: "Untitled live room", participants: {}, sources: {}, messages: [] }; room.participants ||= {}; room.sources ||= {}; room.messages ||= []; return room } catch { return { id, title: "Untitled live room", participants: {}, sources: {}, messages: [] } } }
function saveRoom(room) { localStorage.setItem(roomKey(room.id), JSON.stringify(room)); const rooms = JSON.parse(localStorage.getItem(ROOM_INDEX_KEY) || "[]").filter(r => r.id !== room.id); rooms.unshift({ id: room.id, title: room.title, updatedAt: Date.now() }); localStorage.setItem(ROOM_INDEX_KEY, JSON.stringify(rooms.slice(0, 20))); renderRoomPicker() }
function inviteUrl() { const url = new URL(location.href); url.searchParams.set("room", roomId); url.hash = "join"; return url.toString() }
function initials(name) { return name.split(/\s+/).map(x => x[0]).join("").slice(0, 2).toUpperCase() || "G" }
function renderIdentity() { if (identity?.role !== "Host") return; const shortName = initials(identity.name); $("#hostName").textContent = identity.name; $("#hostInitials").textContent = shortName; $("#hostAvatar").textContent = shortName; $("#hostAvatar").setAttribute("aria-label", `${identity.name}, host`) }
function colorFor(value) { let n = 0; for (const c of value) n = (n * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${n % 360} 28% 40%)` }
function ensureRoomUrl() { const url = new URL(location.href); url.searchParams.set("room", roomId); history.replaceState({}, "", url) }
function renderRoomPicker() { const rooms = JSON.parse(localStorage.getItem(ROOM_INDEX_KEY) || "[]"); $("#roomPicker").innerHTML = [{ id: roomId, title: readRoom().title }, ...rooms.filter(r => r.id !== roomId)].map(r => `<option value="${r.id}" ${r.id === roomId ? "selected" : ""}>${r.title} · ${r.id}</option>`).join("") }
function addSource(preset = sourcePresets[sourceIndex++ % sourcePresets.length]) { const row = document.createElement("div"); row.className = "source-item"; row.dataset.sourceType = preset[0]; row.innerHTML = `<span class="source-icon ${preset[0]}">${preset[1]}</span><input placeholder="${preset[2]}" aria-label="Source link"><button aria-label="Remove source">×</button>`; row.querySelector("button").onclick = () => row.remove(); $("#sourceList").append(row) }
sourcePresets.forEach(addSource)

function savedSources() { try { return JSON.parse(localStorage.getItem(SAVED_SOURCES_KEY)) || [] } catch { return [] } }
function saveSourceForLater(source) { const items = savedSources().filter(item => item.url !== source.url); items.unshift(source); localStorage.setItem(SAVED_SOURCES_KEY, JSON.stringify(items.slice(0, 30))); renderSavedSourcePicker() }
function renderSavedSourcePicker() { $("#savedSourcePicker").innerHTML = `<option value="">Choose a saved link…</option>` + savedSources().map((source, i) => `<option value="${i}">${source.name} · ${source.role}</option>`).join("") }
function sourcePreset(type) { return sourcePresets.find(item => item[0] === type) || sourcePresets[0] }

function renderParticipants() {
  const now = Date.now(), room = readRoom()
  const livePeople = Object.values(room.participants || {}).filter(p => now - p.lastSeen < PRESENCE_TTL).map(p => ({ ...p, status: "Live" }))
  const linkedSources = Object.values(room.sources || {}).map(s => ({ ...s, status: "Linked" }))
  participants = [...livePeople, ...linkedSources]
  $("#participantGrid").innerHTML = participants.map((p, i) => `<article class="participant ${i === 0 ? "featured" : ""}" tabindex="0" data-id="${p.id}"><div class="participant-bg" style="--c1:${colorFor(p.id)};--c2:#202936"><div class="person-face">${initials(p.name)}</div></div><div class="participant-top"><strong>${p.name}</strong><span class="source-chip">${p.role || "Guest link"}</span></div><div class="participant-bottom"><span>● ${p.status}</span><span class="mute-indicator">♩</span><span class="signal"><i></i><i></i><i></i></span></div></article>`).join("") || `<div class="empty-room"><strong>No one is here yet</strong><span>Copy the invite link or connect a source to bring guests into this room.</span></div>`
  $("#participantCount").textContent = livePeople.length
  document.querySelectorAll(".participant").forEach(card => card.onclick = () => { document.querySelector(".participant.featured")?.classList.remove("featured"); card.classList.add("featured"); showToast(`${participants.find(p => p.id === card.dataset.id)?.name} moved to the main stage`) })
  if (activeTab === "people") renderActivity()
}
function renderActivity() {
  const room = readRoom()
  const form = $("#messageForm")
  if (activeTab === "chat") {
    const messages = room.messages.length ? room.messages : [{ id: "welcome", name: "Fambridgelive", text: "Welcome to the room. Comments from native room participants appear here.", color: "#f6c258", createdAt: Date.now() }]
    $("#messages").innerHTML = messages.map(m => `<div class="message ${m.id === identity?.id ? "host" : ""}"><span class="message-avatar" style="--avatar:${m.color || colorFor(m.id)}">${initials(m.name).slice(0,1)}</span><div><div class="message-head"><b>${m.name}</b><time>${new Date(m.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</time></div><p>${m.text}</p></div></div>`).join("")
    $("#messageCount").textContent = room.messages.length
    form.hidden = false
  } else if (activeTab === "people") {
    $("#messages").innerHTML = participants.map(p => `<div class="message"><span class="message-avatar" style="--avatar:${colorFor(p.id)}">${initials(p.name).slice(0,1)}</span><div><div class="message-head"><b>${p.name}</b><time>${p.status}</time></div><p>${p.role || "Guest"}</p></div></div>`).join("") || `<div class="empty-activity">No participants are connected yet.</div>`
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
function announce() { if (!identity) return; const room = readRoom(); room.title = $("#roomTitle").textContent.trim() || room.title; room.participants[identity.id] = { ...identity, lastSeen: Date.now(), role: identity.role || "Guest link" }; saveRoom(room); channel?.postMessage({ type: "presence" }); renderParticipants(); renderActivity() }
function openRoom(id) { channel?.close(); roomId = id; ensureRoomUrl(); const room = readRoom(); $("#roomTitle").textContent = room.title; channel = new BroadcastChannel(`fambridgelive:${roomId}`); channel.onmessage = () => { renderParticipants(); renderActivity() }; announce(); renderRoomPicker(); renderActivity(); showToast(`Loaded ${room.title}`) }

$("#joinForm").onsubmit = e => { e.preventDefault(); const name = $("#joinName").value.trim(); const role = location.hash === "#join" ? "Guest link" : "Host"; identity = { id: identity?.id || crypto.randomUUID(), name, role }; sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity)); localStorage.setItem(`${IDENTITY_KEY}:last-name`, name); renderIdentity(); $("#joinDialog").close(); announce(); showToast(role === "Host" ? `Host set to ${name}` : `Joined room as ${name}`) }
$("#newRoomBtn").onclick = () => { roomId = crypto.randomUUID().slice(0, 8); saveRoom({ id: roomId, title: "Untitled live room", participants: {}, sources: {}, messages: [] }); openRoom(roomId) }
$("#roomPicker").onchange = e => openRoom(e.target.value)
$("#savedSourcePicker").onchange = e => { const source = savedSources()[Number(e.target.value)]; if (!source) return; addSource(sourcePreset(source.type)); const row = $("#sourceList").lastElementChild; row.querySelector("input").value = source.url; e.target.value = ""; showToast("Saved link loaded") }
$("#roomTitle").addEventListener("blur", announce)
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
      saveSourceForLater(source)
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
$("#cameraBtn").onclick = async () => { try { if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; $("#hostVideo").style.display = "none"; $(".camera-placeholder").style.display = "flex"; $("#cameraState").textContent = "Camera off"; $("#cameraBtn").classList.remove("active") } else { cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); $("#hostVideo").srcObject = cameraStream; $("#hostVideo").style.display = "block"; $(".camera-placeholder").style.display = "none"; $("#cameraState").textContent = "Camera live"; $("#cameraBtn").classList.add("active") } } catch { showToast("Camera permission was not granted") } }
$("#micBtn").onclick = e => { e.currentTarget.classList.toggle("active"); const enabled = e.currentTarget.classList.contains("active"); cameraStream?.getAudioTracks().forEach(t => t.enabled = enabled); showToast(enabled ? "Microphone on" : "Microphone muted") }
$("#shareBtn").onclick = async e => { try { if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); return } screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); $("#hostVideo").srcObject = screenStream; $("#hostVideo").classList.add("screen-share"); $("#hostVideo").style.display = "block"; $(".camera-placeholder").style.display = "none"; $("#cameraState").textContent = "Sharing screen"; e.currentTarget.classList.add("active"); const stopShare = () => { screenStream = null; $("#hostVideo").classList.remove("screen-share"); e.currentTarget.classList.remove("active"); if (cameraStream) { $("#hostVideo").srcObject = cameraStream; $("#cameraState").textContent = "Camera live" } else { $("#hostVideo").style.display = "none"; $(".camera-placeholder").style.display = "flex"; $("#cameraState").textContent = "Camera off" } showToast("Screen sharing ended") }; screenStream.getVideoTracks()[0].onended = stopShare; showToast("Your desktop is now in the host preview") } catch { showToast("Screen sharing cancelled") } }
$("#leaveBtn").onclick = () => { cameraStream?.getTracks().forEach(t => t.stop()); const room = readRoom(); if (identity) delete room.participants[identity.id]; saveRoom(room); channel?.postMessage({ type: "presence" }); location.hash = "join"; $("#joinDialog").showModal() }
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
$("#reactionRow").onclick = e => { if (e.target.tagName === "BUTTON") showToast(`${e.target.textContent} reaction sent to everyone`) }
$("#muteAllBtn").onclick = () => { document.querySelectorAll(".participant").forEach(p => p.classList.add("muted")); showToast("All participant microphones muted") }
$("#layoutBtn").onclick = e => { const g = $("#participantGrid"); g.classList.toggle("compact"); e.currentTarget.textContent = g.classList.contains("compact") ? "▦ Focus" : "▦ Grid"; document.querySelectorAll(".participant").forEach(p => p.classList.remove("featured")); showToast("Room layout changed") }
$("#messageForm").onsubmit = e => { e.preventDefault(); const input = $("#messageInput"); if (!input.value.trim() || !identity) return; const room = readRoom(); room.messages.push({ id: identity.id, name: identity.name, text: input.value.trim(), color: colorFor(identity.id), createdAt: Date.now() }); saveRoom(room); input.value = ""; channel?.postMessage({ type: "message" }); renderActivity(); $("#messages").scrollTop = $("#messages").scrollHeight }
document.querySelectorAll(".tabs button").forEach(t => t.onclick = () => { document.querySelectorAll(".tabs button").forEach(x => x.classList.remove("active")); t.classList.add("active"); activeTab = t.dataset.tab; renderActivity() })
$("#settingsBtn").onclick = () => $("#integrationDialog").showModal()
$("#integrationDialog").addEventListener("close", () => { if ($("#integrationDialog").returnValue === "default") showToast("Integration preferences saved for this demo") })
document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") $("#connectBtn").click() })
window.addEventListener("storage", e => { if (e.key === roomKey()) { renderParticipants(); renderActivity() } })
window.addEventListener("beforeunload", announce)
function installTooltips() { const labels = { layoutBtn: "Switch between grid and focus layouts", muteAllBtn: "Mute all participants", inviteBtn: "Copy a guest invite link", recordBtn: "Start or stop a local recording" }; document.querySelectorAll("button").forEach(button => { if (!button.title) button.title = labels[button.id] || button.getAttribute("aria-label") || button.textContent.trim() || "Action" }); const reactions = ["Applaud","Send love","Send fire reaction","Laugh","Celebrate","Share an idea"]; document.querySelectorAll("#reactionRow button").forEach((button, i) => { button.title = reactions[i]; button.setAttribute("aria-label", reactions[i]) }) }
if (typeof MediaRecorder === "undefined") $("#recordBtn").disabled = true
else [...$("#recordFormat").options].forEach(option => { option.disabled = !MediaRecorder.isTypeSupported(option.value) })
renderSavedSourcePicker(); installTooltips(); new MutationObserver(installTooltips).observe(document.body, { childList: true, subtree: true })
ensureRoomUrl(); openRoom(roomId); renderActivity(); setInterval(announce, 5000)
if (identity) renderIdentity()
if (!identity || location.hash === "#join") { const joiningAsGuest = location.hash === "#join"; $("#joinNameLabel").textContent = joiningAsGuest ? "Guest display name" : "Host display name"; $("#joinName").value = joiningAsGuest ? "" : (identity?.name || localStorage.getItem(`${IDENTITY_KEY}:last-name`) || ""); $("#joinDialog").showModal() } else announce()
