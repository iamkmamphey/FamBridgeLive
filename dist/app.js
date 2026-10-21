const $ = s => document.querySelector(s);
function applyTheme(theme,save=true){document.documentElement.dataset.theme=theme;if(save)localStorage.setItem('fambridge-theme',theme);const button=$('#themeToggle');if(button){const light=theme==='light';button.querySelector('.theme-icon').textContent=light?'☾':'☀';button.querySelector('.theme-label').textContent=light?'Dark':'Light';button.setAttribute('aria-label',light?'Switch to dark theme':'Switch to light theme');button.title=button.getAttribute('aria-label')}}
applyTheme(localStorage.getItem('fambridge-theme')||'dark');
const participants = [
  ['Keisha Brown','KB','#8aa33a','#303b22','Host'],
  ['Amara Okafor','AO','#835f4d','#342823','Teams'],['Marcus Reed','MR','#405e6c','#1e3036','Zoom'],['Nia Brooks','NB','#7f514f','#2e2020','YouTube'],['David Chen','DC','#5e6e64','#28322d','Meet'],
  ['Sofia Martinez','SM','#7d6250','#322a24','Teams'],['Jordan Lee','JL','#4b596f','#202936','Zoom'],['Amina Yusuf','AY','#79624c','#332b23','Zoom'],['Theo Martin','TM','#53666d','#242f33','YouTube'],
  ['Zara Patel','ZP','#705c78','#302638','Meet'],['Noah Williams','NW','#6e5f4e','#2d2823','Teams'],['Lena Fischer','LF','#527060','#223229','Meet'],['Isaac Mensah','IM','#76534a','#332420','Zoom']
];
const savedHostName=localStorage.getItem('fambridge-host-name');if(savedHostName){participants[0][0]=savedHostName;participants[0][1]=savedHostName.trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()||'').join('')||'H'}
const messages=[['Maya','Welcome everyone! We are live from Atlanta.','#f6c258','Teams'],['Jordan','The energy in this room is incredible. 🔥','#6dc4ef','Zoom'],['Amina','Can we get the resource link after the session?','#c58be7','Meet'],['You','Absolutely — we’ll share it here before we close.','#d9ff43','Host'],['Marcus','Audio and video are crystal clear on my end.','#7ed6a1','Zoom']];
let sourceIndex=0, recordingTimer, seconds=0, hostStream, mediaRecorder, recordingChunks=[], recordingDirectory, hostIsLive=false, privateTalkTarget=null;
let localRoomId, localSignal, localPeer, localDataChannel, localGuestStream;
let boardColor='#101410', boardSize=5, boardHistory=[], boardDrawing=false, lastBoardPoint=null;
const sourcePresets=[['zoom','Z','Paste existing Zoom room link…'],['meet','M','Paste existing Google Meet link…'],['camera','T','Paste existing Microsoft Teams link…'],['rtmp','↗','Paste livestream source URL…']];

function addSource(preset=sourcePresets[sourceIndex++%sourcePresets.length]){
  const row=document.createElement('div'); row.className='source-item';
  row.innerHTML=`<span class="source-icon ${preset[0]}">${preset[1]}</span><input placeholder="${preset[2]}" aria-label="Source link"><button aria-label="Remove source">×</button>`;
  row.querySelector('button').onclick=()=>row.remove(); $('#sourceList').append(row);
}
function initials(name){return name.trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()||'').join('')||'H'}
function roomPeople(){return[...participants.map(p=>({name:p[0],initials:p[1],source:p[4],color:p[2]})),...(localGuestStream?[{name:'Local Guest',initials:'LG',source:'WebRTC',color:'#73d6ff'}]:[])]}
function updateHostName(name){const clean=name.trim()||'Host';participants[0][0]=clean;participants[0][1]=initials(clean);localStorage.setItem('fambridge-host-name',clean);$('#hostNameplate').textContent=`${clean} · Host`;$('#hostAvatar').textContent=participants[0][1];renderParticipants();localSignal?.postMessage({type:'people',people:roomPeople()})}
sourcePresets.forEach(addSource);

function renderParticipants(){
  $('#participantGrid').innerHTML=participants.map((p,i)=>`<article class="participant ${i===0?'featured host-participant':''}" tabindex="0" data-index="${i}"><div class="participant-bg" style="--c1:${p[2]};--c2:${p[3]}">${i===0?'<video class="room-host-video" autoplay muted playsinline></video>':''}<div class="person-face">${p[1]}</div></div><div class="participant-top"><strong>${p[0]}</strong><span class="source-chip">${p[4]}</span></div><div class="participant-bottom"><span>${i===0&&!hostIsLive?'○ Preview':'● Live'}</span><span class="mute-indicator">♩</span><span class="signal"><i></i><i></i><i></i></span></div></article>`).join('')+(localGuestStream?`<article class="participant local-guest-participant" tabindex="0"><div class="participant-bg"><video class="local-guest-video" autoplay playsinline></video></div><div class="participant-top"><strong>Local Guest</strong><span class="source-chip">WebRTC</span></div><button class="remove-guest-btn">Remove guest</button><div class="participant-bottom"><span>● Connected</span><span class="mute-indicator">♩</span><span class="signal"><i></i><i></i><i></i></span></div></article>`:'');
  $('#participantCount').textContent=participants.length+(localGuestStream?1:0);
  document.querySelectorAll('.participant[data-index]').forEach(card=>card.onclick=()=>{document.querySelector('.participant.featured')?.classList.remove('featured');card.classList.add('featured');showToast(`${participants[card.dataset.index][0]} moved to the main stage`)});
  $('.remove-guest-btn')?.addEventListener('click',e=>{e.stopPropagation();removeLocalGuest()});
  syncHostRoomVideo();
  syncLocalGuestVideo();
}
function renderMessages(){
  $('#messages').innerHTML=messages.map((m,i)=>`<div class="message ${m[0]==='You'?'host':''}"><span class="message-avatar" style="--avatar:${m[2]}">${m[0].slice(0,1)}</span><div><div class="message-head"><b>${m[0]} <small class="platform-label">${m[3]}</small></b><time>${i+1}m</time></div><p>${m[1]}</p></div></div>`).join('');
  $('#messageCount').textContent=messages.length;
}
function syncHostRoomVideo(){const video=$('.room-host-video');if(!video)return;if(hostIsLive&&hostStream){video.srcObject=hostStream;video.style.display='block';$('.host-participant .person-face').style.display='none'}else{video.srcObject=null;video.style.display='none';$('.host-participant .person-face').style.display='grid'}}
function syncLocalGuestVideo(){const video=$('.local-guest-video');if(video&&localGuestStream){video.srcObject=localGuestStream;video.play().catch(()=>{})}}
function addRemoteMessage(sender,text){messages.push([sender,text,'#73d6ff','Local']);renderMessages();$('#messages').scrollTop=$('#messages').scrollHeight}

async function startLocalRoom(){
  if(!/^localhost$|^127\.0\.0\.1$/.test(location.hostname)){showToast('Local test mode only runs on localhost');return}
  try{
    if(!hostStream)hostStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
    $('#hostVideo').srcObject=hostStream;$('#hostVideo').style.display='block';$('.camera-placeholder').style.display='none';
    $('#goLiveBtn').disabled=false;hostIsLive=true;$('#goLiveBtn').textContent='End live';$('#goLiveBtn').classList.add('is-live');$('#cameraState').textContent='Host · Local test';
    localRoomId=crypto.randomUUID().slice(0,8);localSignal?.close();localSignal=new BroadcastChannel(`livebridge-${localRoomId}`);localSignal.onmessage=handleLocalSignal;
    const guestUrl=new URL('guest.html',location.href);guestUrl.searchParams.set('room',localRoomId);
    $('#localTestBtn').textContent='Copy guest test link';$('#localTestBtn').onclick=()=>copyLocalGuestLink(guestUrl.href);
    $('#localTestStatus').innerHTML=`Room <b>${localRoomId}</b> is ready. Open the guest link in another tab.`;
    await copyLocalGuestLink(guestUrl.href);renderParticipants();
  }catch{showToast('Allow camera and microphone access to start the local room')}
}
async function copyLocalGuestLink(url){try{await navigator.clipboard.writeText(url);showToast('Guest test link copied — open it in another tab')}catch{showToast(`Open ${url}`)}}
async function handleLocalSignal({data}){
  if(data.type==='guest-ready'){localSignal.postMessage({type:'people',people:[...participants.map(p=>({name:p[0],initials:p[1],source:p[4],color:p[2]})),{name:'Local Guest',initials:'LG',source:'WebRTC',color:'#73d6ff'}]});localSignal.postMessage({type:'board-state',history:boardHistory});await createLocalPeer();return}
  if(data.type==='reaction'){showReaction(data.emoji);showToast(`Local Guest reacted ${data.emoji}`);return}
  if(data.type==='board-stroke'){boardHistory.push(data.segment);drawBoardSegment(data.segment);return}
  if(data.type==='board-clear'){clearBoard(false);return}
  if(!localPeer)return;
  if(data.type==='answer')await localPeer.setRemoteDescription(data.answer);
  if(data.type==='ice'&&data.candidate)await localPeer.addIceCandidate(data.candidate).catch(()=>{});
}
async function createLocalPeer(){
  localPeer?.close();localPeer=new RTCPeerConnection({iceServers:[]});hostStream.getTracks().forEach(track=>localPeer.addTrack(track,hostStream));
  localPeer.onicecandidate=e=>e.candidate&&localSignal.postMessage({type:'ice',candidate:e.candidate});
  localPeer.ontrack=e=>{localGuestStream=e.streams[0];renderParticipants();showToast('Local guest video and audio connected')};
  localPeer.onconnectionstatechange=()=>{$('#localTestStatus').textContent=`Local guest: ${localPeer.connectionState}`;if(['failed','closed'].includes(localPeer.connectionState)){localGuestStream=null;renderParticipants()}};
  localDataChannel=localPeer.createDataChannel('room');localDataChannel.onopen=()=>showToast('Two-way local chat connected');localDataChannel.onmessage=e=>{let data;try{data=JSON.parse(e.data)}catch{data={type:'chat',text:e.data}}if(data.type==='chat')addRemoteMessage('Local Guest',data.text)};
  await localPeer.setLocalDescription(await localPeer.createOffer());localSignal.postMessage({type:'offer',offer:localPeer.localDescription});
}
function sendData(payload){if(localDataChannel?.readyState==='open')localDataChannel.send(JSON.stringify(payload))}
function showReaction(emoji){const el=document.createElement('div');el.className='reaction-burst';el.textContent=emoji;document.body.append(el);setTimeout(()=>el.remove(),1500)}
function removeLocalGuest(){localSignal?.postMessage({type:'kicked'});localPeer?.close();localGuestStream=null;localDataChannel=null;renderParticipants();showToast('Guest removed from the room')}
function displaySharedMedia(target,payload){target.innerHTML='';let media;if(payload.blob){media=document.createElement(payload.blob.type.startsWith('audio/')?'audio':'video');media.src=URL.createObjectURL(payload.blob)}else if(/\.(mp4|webm|mov|m4v)(\?|$)/i.test(payload.url)){media=document.createElement('video');media.src=payload.url}else if(/\.(mp3|wav|m4a|ogg)(\?|$)/i.test(payload.url)){media=document.createElement('audio');media.src=payload.url}else{media=document.createElement('iframe');media.src=payload.url;media.allow='autoplay; fullscreen';media.referrerPolicy='no-referrer'}if(media.tagName!=='IFRAME'){media.controls=true;media.autoplay=true}target.append(media)}
function setupWhiteboard(){const canvas=$('#whiteboardCanvas'),ctx=canvas.getContext('2d');const resize=()=>{const rect=canvas.getBoundingClientRect(),ratio=devicePixelRatio||1;canvas.width=rect.width*ratio;canvas.height=rect.height*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.lineCap='round';boardHistory.forEach(drawBoardSegment)};new ResizeObserver(resize).observe(canvas);const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}};canvas.onpointerdown=e=>{boardDrawing=true;lastBoardPoint=point(e);canvas.setPointerCapture(e.pointerId)};canvas.onpointermove=e=>{if(!boardDrawing)return;const next=point(e),segment={from:lastBoardPoint,to:next,color:boardColor,size:boardSize};boardHistory.push(segment);drawBoardSegment(segment);localSignal?.postMessage({type:'board-stroke',segment});lastBoardPoint=next};canvas.onpointerup=()=>boardDrawing=false;window.addEventListener('resize',resize)}
function drawBoardSegment(segment){const canvas=$('#whiteboardCanvas');if(!canvas)return;const r=canvas.getBoundingClientRect(),ctx=canvas.getContext('2d');ctx.beginPath();ctx.strokeStyle=segment.color;ctx.lineWidth=segment.size;ctx.moveTo(segment.from.x*r.width,segment.from.y*r.height);ctx.lineTo(segment.to.x*r.width,segment.to.y*r.height);ctx.stroke()}
function clearBoard(broadcast=true){boardHistory=[];const canvas=$('#whiteboardCanvas');canvas?.getContext('2d').clearRect(0,0,canvas.width,canvas.height);if(broadcast)localSignal?.postMessage({type:'board-clear'})}
function renderPeople(){
  $('#messages').innerHTML=`<div class="people-list">${participants.map((p,i)=>`<div class="person-row"><span class="message-avatar" style="--avatar:${p[2]}">${p[1]}</span><span><b>${p[0]}</b><small><i></i> Online · ${p[4]}</small></span>${i===0?'<em>You</em>':`<button class="private-talk-btn ${privateTalkTarget===p[0]?'active':''}" data-person="${p[0]}">${privateTalkTarget===p[0]?'● Talking privately':'Talk privately'}</button>`}</div>`).join('')}</div>`;
  document.querySelectorAll('.private-talk-btn').forEach(button=>button.onclick=()=>{privateTalkTarget=privateTalkTarget===button.dataset.person?null:button.dataset.person;$('#messageInput').placeholder=privateTalkTarget?`Private message to ${privateTalkTarget}…`:'Message everyone…';renderPeople();showToast(privateTalkTarget?`Private talk with ${privateTalkTarget} — the room cannot hear`:'Private talk ended — back to the whole room')});
}
function renderQueue(){$('#messages').innerHTML='<div class="empty-view"><strong>No one is waiting</strong><span>New attendees from connected platforms will appear here.</span></div>'}
function showToast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(t._id);t._id=setTimeout(()=>t.classList.remove('show'),2400)}
function formatTime(s){return new Date(s*1000).toISOString().slice(11,19)}

$('#addSourceBtn').onclick=()=>addSource();
$('#connectBtn').onclick=()=>{const urls=[...document.querySelectorAll('.source-item input')].filter(x=>x.value.trim());showToast(urls.length?`${urls.length} existing platform source${urls.length>1?'s':''} queued for connection`:'Add at least one existing platform room first')};
$('#localTestBtn').onclick=startLocalRoom;
$('#refreshBtn').onclick=()=>showToast('Refreshing members and media states from connected platforms');
$('#previewBtn').onclick=async()=>{try{if(!hostStream)hostStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});$('#hostVideo').srcObject=hostStream;$('#hostVideo').style.display='block';$('.camera-placeholder').style.display='none';$('#goLiveBtn').disabled=false;$('#cameraState').textContent='Host · Preview';showToast('Private preview is ready — check your picture and sound')}catch{showToast('Camera and microphone permission is needed for preview')}};
$('#goLiveBtn').onclick=e=>{hostIsLive=!hostIsLive;e.currentTarget.textContent=hostIsLive?'End live':'Go live';e.currentTarget.classList.toggle('is-live',hostIsLive);$('#cameraState').textContent=hostIsLive?'Host · Live':'Host · Preview';renderParticipants();showToast(hostIsLive?'Host camera and sound are now live in the room':'Host feed returned to private preview')};
$('#cameraBtn').onclick=e=>{e.currentTarget.classList.toggle('active');const enabled=e.currentTarget.classList.contains('active');hostStream?.getVideoTracks().forEach(t=>t.enabled=enabled);showToast(enabled?'Host preview video on':'Host preview video off')};
$('#micBtn').onclick=e=>{e.currentTarget.classList.toggle('active');const enabled=e.currentTarget.classList.contains('active');hostStream?.getAudioTracks().forEach(t=>t.enabled=enabled);showToast(enabled?'Host preview audio on':'Host preview audio muted')};
$('#leaveBtn').onclick=()=>{hostStream?.getTracks().forEach(t=>t.stop());hostStream=null;hostIsLive=false;$('#hostVideo').style.display='none';$('.camera-placeholder').style.display='flex';$('#goLiveBtn').disabled=true;$('#goLiveBtn').textContent='Go live';$('#cameraState').textContent='Host · Offline';renderParticipants();showToast('Host preview ended')};
$('#recordBtn').onclick=async e=>{const b=e.currentTarget;if(b.classList.contains('recording')){mediaRecorder?.stop();clearInterval(recordingTimer);b.classList.remove('recording');b.querySelector('span').textContent='Start recording';return}if(!hostStream){showToast('Preview camera & sound before recording');return}if(!window.showDirectoryPicker){showToast('Folder selection requires Chrome or Edge on a secure connection');return}try{recordingDirectory=await window.showDirectoryPicker({mode:'readwrite'});recordingChunks=[];mediaRecorder=new MediaRecorder(hostStream);mediaRecorder.ondataavailable=x=>{if(x.data.size)recordingChunks.push(x.data)};mediaRecorder.onstop=saveRecording;mediaRecorder.start(1000);seconds=0;b.querySelector('time').textContent='00:00:00';b.classList.add('recording');b.querySelector('span').textContent='Stop & save';recordingTimer=setInterval(()=>b.querySelector('time').textContent=formatTime(++seconds),1000);showToast(`Recording will save to ${recordingDirectory.name}`)}catch(err){if(err.name!=='AbortError')showToast('The recording folder could not be opened')}};
async function saveRecording(){try{const blob=new Blob(recordingChunks,{type:mediaRecorder.mimeType||'video/webm'});const stamp=new Date().toISOString().replace(/[:.]/g,'-');const file=await recordingDirectory.getFileHandle(`Fambridgelive-${stamp}.webm`,{create:true});const writable=await file.createWritable();await writable.write(blob);await writable.close();showToast(`Recording saved in ${recordingDirectory.name}`)}catch{showToast('Recording stopped, but the file could not be saved')}}
$('#reactionRow').onclick=e=>{if(e.target.tagName==='BUTTON'){const emoji=e.target.textContent;showReaction(emoji);localSignal?.postMessage({type:'reaction',emoji});showToast(`${emoji} reaction sent to everyone`)}};
$('#muteAudioBtn').onclick=e=>{const muted=!$('#participantGrid').classList.contains('all-audio-muted');$('#participantGrid').classList.toggle('all-audio-muted',muted);document.querySelectorAll('.participant').forEach(p=>p.classList.toggle('muted',muted));e.currentTarget.textContent=muted?'♩ Unmute all audio':'♩ Mute all audio';showToast(muted?'All member audio muted':'All member audio restored')};
$('#muteVideoBtn').onclick=e=>{const hidden=!$('#participantGrid').classList.contains('all-video-muted');$('#participantGrid').classList.toggle('all-video-muted',hidden);e.currentTarget.textContent=hidden?'◉ Restore all video':'◉ Turn off all video';showToast(hidden?'All member video turned off':'All member video restored')};
$('#layoutBtn').onclick=e=>{const g=$('#participantGrid');g.classList.toggle('compact');e.currentTarget.textContent=g.classList.contains('compact')?'▦ Focus':'▦ Grid';document.querySelectorAll('.participant').forEach(p=>p.classList.remove('featured'));showToast('Room layout changed')};
$('#messageForm').onsubmit=e=>{e.preventDefault();const input=$('#messageInput');if(!input.value.trim())return;if(privateTalkTarget){showToast(`Private message sent only to ${privateTalkTarget}`);input.value='';return}const text=input.value.trim();messages.push(['You',text,'#d9ff43','Host']);sendData({type:'chat',text});input.value='';renderMessages();$('#messages').scrollTop=$('#messages').scrollHeight};
document.querySelectorAll('.tabs button').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));t.classList.add('active');if(t.dataset.tab==='chat'){privateTalkTarget=null;$('#messageInput').placeholder='Message everyone…';renderMessages()}else if(t.dataset.tab==='people')renderPeople();else renderQueue()});
$('#settingsBtn').onclick=()=>$('#integrationDialog').showModal();
$('#themeToggle').onclick=()=>applyTheme(document.documentElement.dataset.theme==='light'?'dark':'light');
$('#hostNameInput').value=participants[0][0];$('#hostNameplate').textContent=`${participants[0][0]} · Host`;$('#hostAvatar').textContent=participants[0][1];
$('#hostNameInput').oninput=e=>updateHostName(e.target.value);
$('#whiteboardBtn').onclick=$('#whiteboardStageBtn').onclick=()=>$('#whiteboardDialog').showModal();
$('#clearBoardBtn').onclick=()=>clearBoard(true);
document.querySelectorAll('#whiteboardDialog .color-swatch').forEach(button=>button.onclick=()=>{document.querySelectorAll('#whiteboardDialog .color-swatch').forEach(x=>x.classList.remove('active'));button.classList.add('active');boardColor=button.dataset.color});
$('#penSize').oninput=e=>boardSize=Number(e.target.value);
$('#shareMediaBtn').onclick=()=>$('#mediaDialog').showModal();
$('#roomMediaFile').onchange=e=>{const file=e.target.files[0];if(!file)return;const payload={type:'shared-media',blob:file,name:file.name};displaySharedMedia($('#hostSharedMedia'),payload);localSignal?.postMessage(payload);showToast(`${file.name} is now playing for the room`)};
$('#roomLinkForm').onsubmit=e=>{e.preventDefault();const url=$('#roomLinkInput').value.trim();const payload={type:'shared-media',url};displaySharedMedia($('#hostSharedMedia'),payload);localSignal?.postMessage(payload);showToast('Shared link sent to the room')};
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>document.getElementById(button.dataset.close).close());
$('#integrationDialog').addEventListener('close',()=>{if($('#integrationDialog').returnValue==='default')showToast('Integration preferences saved for this demo')});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')$('#connectBtn').click()});
document.querySelectorAll('button[aria-label]').forEach(button=>button.title=button.getAttribute('aria-label'));
window.addEventListener('storage',e=>{if(e.key==='fambridge-theme'&&e.newValue)applyTheme(e.newValue,false)});
renderParticipants();renderMessages();setupWhiteboard();
