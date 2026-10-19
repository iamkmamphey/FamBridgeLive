const $ = s => document.querySelector(s);
const participants = [
  ['Amara Okafor','AO','#835f4d','#342823','Studio'],['Marcus Reed','MR','#405e6c','#1e3036','Zoom'],['Nia Brooks','NB','#7f514f','#2e2020','Guest link'],['David Chen','DC','#5e6e64','#28322d','Meet'],
  ['Sofia Martinez','SM','#7d6250','#322a24','Guest link'],['Jordan Lee','JL','#4b596f','#202936','Studio'],['Amina Yusuf','AY','#79624c','#332b23','Zoom'],['Theo Martin','TM','#53666d','#242f33','Guest link'],
  ['Zara Patel','ZP','#705c78','#302638','Meet'],['Noah Williams','NW','#6e5f4e','#2d2823','Guest link'],['Lena Fischer','LF','#527060','#223229','Studio'],['Isaac Mensah','IM','#76534a','#332420','Zoom']
];
const messages=[['Maya','Welcome everyone! We are live from Atlanta.','#f6c258'],['Jordan','The energy in this room is incredible. 🔥','#6dc4ef'],['Amina','Can we get the resource link after the session?','#c58be7'],['You','Absolutely — we’ll share it here before we close.','#d9ff43'],['Marcus','Audio and video are crystal clear on my end.','#7ed6a1']];
let sourceIndex=0, recordingTimer, seconds=0, cameraStream;
const sourcePresets=[['camera','CAM','Paste guest invitation link…'],['zoom','Z','Paste Zoom meeting link…'],['meet','M','Paste Google Meet link…'],['rtmp','↗','Paste RTMP or livestream URL…']];

function addSource(preset=sourcePresets[sourceIndex++%sourcePresets.length]){
  const row=document.createElement('div'); row.className='source-item';
  row.innerHTML=`<span class="source-icon ${preset[0]}">${preset[1]}</span><input placeholder="${preset[2]}" aria-label="Source link"><button aria-label="Remove source">×</button>`;
  row.querySelector('button').onclick=()=>row.remove(); $('#sourceList').append(row);
}
sourcePresets.forEach(addSource);

function renderParticipants(){
  $('#participantGrid').innerHTML=participants.map((p,i)=>`<article class="participant ${i===0?'featured':''}" tabindex="0" data-index="${i}"><div class="participant-bg" style="--c1:${p[2]};--c2:${p[3]}"><div class="person-face">${p[1]}</div></div><div class="participant-top"><strong>${p[0]}</strong><span class="source-chip">${p[4]}</span></div><div class="participant-bottom"><span>● Live</span><span class="mute-indicator">♩</span><span class="signal"><i></i><i></i><i></i></span></div></article>`).join('');
  document.querySelectorAll('.participant').forEach(card=>card.onclick=()=>{document.querySelector('.participant.featured')?.classList.remove('featured');card.classList.add('featured');showToast(`${participants[card.dataset.index][0]} moved to the main stage`)});
}
function renderMessages(){
  $('#messages').innerHTML=messages.map((m,i)=>`<div class="message ${i===3?'host':''}"><span class="message-avatar" style="--avatar:${m[2]}">${m[0].slice(0,1)}</span><div><div class="message-head"><b>${m[0]}</b><time>${i+1}m</time></div><p>${m[1]}</p></div></div>`).join('');
  $('#messageCount').textContent=messages.length;
}
function showToast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(t._id);t._id=setTimeout(()=>t.classList.remove('show'),2400)}
function formatTime(s){return new Date(s*1000).toISOString().slice(11,19)}

$('#addSourceBtn').onclick=()=>addSource();
$('#connectBtn').onclick=()=>{const urls=[...document.querySelectorAll('.source-item input')].filter(x=>x.value.trim());showToast(urls.length?`${urls.length} source${urls.length>1?'s':''} queued for secure connection`:'Add at least one live or guest link first')};
$('#copyInviteBtn').onclick=$('#inviteBtn').onclick=async()=>{const url=location.href.split('#')[0]+'#join';try{await navigator.clipboard.writeText(url);showToast('Guest invite link copied')}catch{showToast('Invite link ready: '+url)}};
$('#cameraBtn').onclick=async()=>{try{if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;$('#hostVideo').style.display='none';$('.camera-placeholder').style.display='flex';$('#cameraState').textContent='Camera off';$('#cameraBtn').classList.remove('active')}else{cameraStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});$('#hostVideo').srcObject=cameraStream;$('#hostVideo').style.display='block';$('.camera-placeholder').style.display='none';$('#cameraState').textContent='Camera live';$('#cameraBtn').classList.add('active')}}catch{showToast('Camera permission was not granted')}};
$('#micBtn').onclick=e=>{e.currentTarget.classList.toggle('active');const enabled=e.currentTarget.classList.contains('active');cameraStream?.getAudioTracks().forEach(t=>t.enabled=enabled);showToast(enabled?'Microphone on':'Microphone muted')};
$('#shareBtn').onclick=async()=>{try{const s=await navigator.mediaDevices.getDisplayMedia({video:true});showToast('Screen share started');s.getVideoTracks()[0].onended=()=>showToast('Screen share ended')}catch{showToast('Screen sharing cancelled')}};
$('#leaveBtn').onclick=()=>{cameraStream?.getTracks().forEach(t=>t.stop());location.reload()};
$('#recordBtn').onclick=e=>{const b=e.currentTarget;b.classList.toggle('recording');if(b.classList.contains('recording')){b.querySelector('span').textContent='Recording';recordingTimer=setInterval(()=>b.querySelector('time').textContent=formatTime(++seconds),1000);showToast('Local session timer started')}else{clearInterval(recordingTimer);b.querySelector('span').textContent='Start recording';showToast('Recording stopped')}};
$('#reactionRow').onclick=e=>{if(e.target.tagName==='BUTTON')showToast(`${e.target.textContent} reaction sent to everyone`)};
$('#muteAllBtn').onclick=()=>{document.querySelectorAll('.participant').forEach(p=>p.classList.add('muted'));showToast('All participant microphones muted')};
$('#layoutBtn').onclick=e=>{const g=$('#participantGrid');g.classList.toggle('compact');e.currentTarget.textContent=g.classList.contains('compact')?'▦ Focus':'▦ Grid';document.querySelectorAll('.participant').forEach(p=>p.classList.remove('featured'));showToast('Room layout changed')};
$('#messageForm').onsubmit=e=>{e.preventDefault();const input=$('#messageInput');if(!input.value.trim())return;messages.push(['You',input.value.trim(),'#d9ff43']);input.value='';renderMessages();$('#messages').scrollTop=$('#messages').scrollHeight};
document.querySelectorAll('.tabs button').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.remove('active'));t.classList.add('active');showToast(`${t.textContent.trim()} view selected`)});
$('#settingsBtn').onclick=()=>$('#integrationDialog').showModal();
$('#integrationDialog').addEventListener('close',()=>{if($('#integrationDialog').returnValue==='default')showToast('Integration preferences saved for this demo')});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')$('#connectBtn').click()});
renderParticipants();renderMessages();
