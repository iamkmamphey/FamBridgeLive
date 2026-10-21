const $=selector=>document.querySelector(selector);
function applyTheme(theme,save=true){document.documentElement.dataset.theme=theme;if(save)localStorage.setItem('fambridge-theme',theme);const button=$('#guestThemeToggle');if(button){const light=theme==='light';button.querySelector('.theme-icon').textContent=light?'☾':'☀';button.querySelector('.theme-label').textContent=light?'Dark':'Light';button.setAttribute('aria-label',light?'Switch to dark theme':'Switch to light theme');button.title=button.getAttribute('aria-label')}}
applyTheme(localStorage.getItem('fambridge-theme')||'dark');
const roomId=new URLSearchParams(location.search).get('room');
let signal,peer,dataChannel,localStream,joining=false;
let boardColor='#101410',boardSize=5,boardHistory=[],boardDrawing=false,lastBoardPoint=null;
function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(el._id);el._id=setTimeout(()=>el.classList.remove('show'),2400)}
function setStatus(text){$('#guestStatus').innerHTML=`<i></i> ${text}`}
function showReaction(emoji){const el=document.createElement('div');el.className='reaction-burst';el.textContent=emoji;document.body.append(el);setTimeout(()=>el.remove(),1500)}
function addMessage(sender,text,own=false){$('#guestMessages .empty-view')?.remove();const row=document.createElement('div');row.className=`message ${own?'you':''}`;row.innerHTML=`<div><div class="message-head"><b></b><time>now</time></div><p></p></div>`;row.querySelector('b').textContent=sender;row.querySelector('p').textContent=text;$('#guestMessages').append(row);$('#guestMessages').scrollTop=$('#guestMessages').scrollHeight}
function renderPeople(people){$('#guestPeopleCount').textContent=people.length;$('#guestPeople').innerHTML=people.map(person=>`<div class="guest-person"><span class="message-avatar" style="--avatar:${person.color}">${person.initials}</span><span><b>${person.name}</b><small>● ${person.source}</small></span></div>`).join('');const host=people.find(person=>person.source==='Host');if(host)$('#guestHostNameplate').textContent=`${host.name} · Host`}
async function joinRoom(){
  if(joining||!roomId)return;joining=true;
  try{
    localStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});$('#localVideo').srcObject=localStream;
    $('#joinBtn').disabled=true;$('#joinBtn').textContent='Connecting…';$('#guestCameraBtn').disabled=false;$('#guestMicBtn').disabled=false;
    signal=new BroadcastChannel(`livebridge-${roomId}`);signal.onmessage=handleSignal;signal.postMessage({type:'guest-ready'});setStatus('Connecting');
  }catch{joining=false;$('#joinBtn').disabled=false;$('#joinBtn').textContent='Allow camera & join';setStatus('Permission needed');toast('Allow camera and microphone access to join')}
}
async function handleSignal({data}){
  if(data.type==='offer'){
    peer?.close();peer=new RTCPeerConnection({iceServers:[]});localStream.getTracks().forEach(track=>peer.addTrack(track,localStream));
    peer.onicecandidate=e=>e.candidate&&signal.postMessage({type:'ice',candidate:e.candidate});
    peer.ontrack=e=>{$('#remoteVideo').srcObject=e.streams[0];$('#remoteEmpty').style.display='none'};
    peer.ondatachannel=e=>{dataChannel=e.channel;dataChannel.onopen=()=>{$('#joinBtn').textContent='Connected';setStatus('Connected');toast('You joined automatically — video, audio, and chat are live')};dataChannel.onmessage=event=>{let message;try{message=JSON.parse(event.data)}catch{message={type:'chat',text:event.data}}if(message.type==='chat')addMessage('Host',message.text)}};
    peer.onconnectionstatechange=()=>setStatus(peer.connectionState);
    await peer.setRemoteDescription(data.offer);await peer.setLocalDescription(await peer.createAnswer());signal.postMessage({type:'answer',answer:peer.localDescription});return;
  }
  if(data.type==='ice'&&data.candidate&&peer){await peer.addIceCandidate(data.candidate).catch(()=>{});return}
  if(data.type==='people'){renderPeople(data.people);return}
  if(data.type==='reaction'){showReaction(data.emoji);toast(`Host reacted ${data.emoji}`);return}
  if(data.type==='board-stroke'){boardHistory.push(data.segment);drawBoardSegment(data.segment);return}
  if(data.type==='board-state'){boardHistory=data.history||[];redrawBoard();return}
  if(data.type==='board-clear'){clearBoard(false);return}
  if(data.type==='shared-media'){showSharedMedia(data);return}
  if(data.type==='kicked'){peer?.close();localStream?.getTracks().forEach(track=>track.stop());setStatus('Removed by host');$('#joinBtn').textContent='Removed from room';toast('The host removed you from the room')}
}
function sendData(payload){if(dataChannel?.readyState==='open')dataChannel.send(JSON.stringify(payload))}
function showSharedMedia(payload){const target=$('#guestMediaPlayer');target.innerHTML='';let media;if(payload.blob){media=document.createElement(payload.blob.type.startsWith('audio/')?'audio':'video');media.src=URL.createObjectURL(payload.blob)}else if(/\.(mp4|webm|mov|m4v)(\?|$)/i.test(payload.url)){media=document.createElement('video');media.src=payload.url}else if(/\.(mp3|wav|m4a|ogg)(\?|$)/i.test(payload.url)){media=document.createElement('audio');media.src=payload.url}else{media=document.createElement('iframe');media.src=payload.url;media.allow='autoplay; fullscreen';media.referrerPolicy='no-referrer'}if(media.tagName!=='IFRAME'){media.controls=true;media.autoplay=true}target.append(media);$('#guestSharedMedia').hidden=false;media.play?.().catch(()=>{});toast('The host shared media with the room')}
function setupWhiteboard(){const canvas=$('#guestWhiteboardCanvas'),ctx=canvas.getContext('2d');const resize=()=>{const rect=canvas.getBoundingClientRect(),ratio=devicePixelRatio||1;canvas.width=rect.width*ratio;canvas.height=rect.height*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.lineCap='round';boardHistory.forEach(drawBoardSegment)};new ResizeObserver(resize).observe(canvas);const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}};canvas.onpointerdown=e=>{boardDrawing=true;lastBoardPoint=point(e);canvas.setPointerCapture(e.pointerId)};canvas.onpointermove=e=>{if(!boardDrawing)return;const next=point(e),segment={from:lastBoardPoint,to:next,color:boardColor,size:boardSize};boardHistory.push(segment);drawBoardSegment(segment);signal?.postMessage({type:'board-stroke',segment});lastBoardPoint=next};canvas.onpointerup=()=>boardDrawing=false}
function drawBoardSegment(segment){const canvas=$('#guestWhiteboardCanvas');if(!canvas)return;const r=canvas.getBoundingClientRect(),ctx=canvas.getContext('2d');ctx.beginPath();ctx.strokeStyle=segment.color;ctx.lineWidth=segment.size;ctx.lineCap='round';ctx.moveTo(segment.from.x*r.width,segment.from.y*r.height);ctx.lineTo(segment.to.x*r.width,segment.to.y*r.height);ctx.stroke()}
function redrawBoard(){const canvas=$('#guestWhiteboardCanvas');canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);boardHistory.forEach(drawBoardSegment)}
function clearBoard(broadcast=true){boardHistory=[];const canvas=$('#guestWhiteboardCanvas');canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);if(broadcast)signal?.postMessage({type:'board-clear'})}
$('#joinBtn').onclick=joinRoom;
$('#guestThemeToggle').onclick=()=>applyTheme(document.documentElement.dataset.theme==='light'?'dark':'light');
$('#guestCameraBtn').onclick=e=>{e.currentTarget.classList.toggle('active');localStream?.getVideoTracks().forEach(track=>track.enabled=e.currentTarget.classList.contains('active'))};
$('#guestMicBtn').onclick=e=>{e.currentTarget.classList.toggle('active');localStream?.getAudioTracks().forEach(track=>track.enabled=e.currentTarget.classList.contains('active'))};
$('#guestMessageForm').onsubmit=e=>{e.preventDefault();const input=$('#guestMessageInput'),text=input.value.trim();if(!text)return;if(dataChannel?.readyState!=='open'){toast('Room chat is still connecting');return}sendData({type:'chat',text});addMessage('You',text,true);input.value=''};
$('#guestReactionRow').onclick=e=>{if(e.target.tagName==='BUTTON'){showReaction(e.target.textContent);signal?.postMessage({type:'reaction',emoji:e.target.textContent})}};
$('#guestWhiteboardBtn').onclick=()=>$('#guestWhiteboardDialog').showModal();$('#closeGuestBoard').onclick=()=>$('#guestWhiteboardDialog').close();$('#guestClearBoard').onclick=()=>clearBoard(true);
document.querySelectorAll('#guestWhiteboardDialog .color-swatch').forEach(button=>button.onclick=()=>{document.querySelectorAll('#guestWhiteboardDialog .color-swatch').forEach(x=>x.classList.remove('active'));button.classList.add('active');boardColor=button.dataset.color});
$('#guestPenSize').oninput=e=>boardSize=Number(e.target.value);$('#closeGuestMedia').onclick=()=>{$('#guestSharedMedia').hidden=true;$('#guestMediaPlayer').innerHTML=''};
setupWhiteboard();
window.addEventListener('storage',e=>{if(e.key==='fambridge-theme'&&e.newValue)applyTheme(e.newValue,false)});
if(!roomId){$('#joinBtn').disabled=true;$('#joinBtn').textContent='Invalid guest link';setStatus('Missing room')}else joinRoom();
