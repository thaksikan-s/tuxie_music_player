const demoTrack = {id:'vey-lora-original',title:'Velvet Horizon',artist:'Tuxie Originals',album:'Quietly, Into Light',tone:'demo',kind:'demo',duration:64};
const starterTracks = [
  {id:'silver-hour',title:'Silver Hour',artist:'Tuxie Originals',album:'Soft Focus',tone:'violet',kind:'demo',duration:57},
  {id:'still-water',title:'Still Water',artist:'Tuxie Originals',album:'Slow Bloom',tone:'cyan',kind:'demo',duration:60},
  {id:'afterglow',title:'Afterglow, Again',artist:'Tuxie Originals',album:'Little Constellations',tone:'rose',kind:'demo',duration:54},
  {id:'golden-room',title:'A Golden Room',artist:'Tuxie Originals',album:'A Place to Land',tone:'amber',kind:'demo',duration:62},
  demoTrack
];
const EQ_BANDS=[60,170,350,1000,3500,10000];
const EQ_PRESETS={Flat:{bands:[0,0,0,0,0,0],outputGain:0},'Bass Boost':{bands:[7,5,3,0,0,0],outputGain:-3},Rock:{bands:[4,3,-1,2,4,5],outputGain:-3},Pop:{bands:[-1,2,5,3,-1,-2],outputGain:-2},Classical:{bands:[4,2,0,0,2,4],outputGain:-2},Jazz:{bands:[3,2,-1,1,3,4],outputGain:-2},Vocal:{bands:[-2,0,3,5,3,1],outputGain:-2}};
const audio=document.getElementById('audio-element');
const pageContent=document.getElementById('page-content');
const app={page:'home',current:null,tracks:[...starterTracks],queue:starterTracks.map(t=>t.id),favorites:new Set(JSON.parse(localStorage.getItem('vey-favorites')||'[]')),playlists:JSON.parse(localStorage.getItem('vey-playlists')||'[]'),recent:JSON.parse(localStorage.getItem('vey-recent')||'[]'),search:'',shuffle:false,repeatMode:'off',theme:localStorage.getItem('vey-theme')||'system',toastTimer:0,urls:new Map(),localHandles:new Map(),cloudSongs:[],cloud:{url:localStorage.getItem('vey-cloud-url')||'',key:localStorage.getItem('vey-cloud-key')||'',session:null,loading:false,error:''}};
// Kept locally so a USB log capture has useful context without collecting music
// files, credentials, or listening history outside this device.
app.diagnostics=JSON.parse(localStorage.getItem('tuxie-v2-diagnostics')||'[]');
function diagnostic(event,error){const message=String(error?.message||error||'').slice(0,180);app.diagnostics=[{time:new Date().toISOString(),event,message},...app.diagnostics].slice(0,40);try{localStorage.setItem('tuxie-v2-diagnostics',JSON.stringify(app.diagnostics))}catch(_){/* Best effort only. */}console.error(`[Tuxie v2] ${event}`,error||'')}
window.addEventListener('error',event=>diagnostic('webview-error',event.error||event.message));
window.addEventListener('unhandledrejection',event=>diagnostic('unhandled-rejection',event.reason));
app.resumeTime=0;
app.playbackSaveTimer=0;
app.native={enabled:Boolean(window.Capacitor?.isNativePlatform?.()&&/android/i.test(navigator.userAgent)),isPlaying:false,restorePlaying:false,position:0,duration:0,volume:audio.volume,volumeFixed:false,notificationDenied:localStorage.getItem('vey-notifications-denied')==='true',volumeTimer:0,pendingVolume:null,permissionRequired:false,pollTimer:0,refreshingState:false,lastPollError:'',lastEndedId:null,lastStateSave:0,lastPlaybackError:'',pageSize:200,nextOffset:0,totalCount:0,hasMore:false,scanning:false,scanInFlight:false,scanToken:0,scanTimer:0,cancelRequested:false,searchTracks:[],searchOffset:0,searchTotal:0,searchHasMore:false,searchToken:0,artworkObserver:null,artworkCache:new Map(),artworkRequests:new Set()};
function nativePlaybackCall(method,options={}){if(!app.native.enabled||typeof window.Capacitor?.nativePromise!=='function')return Promise.reject(new Error('Native Android playback is unavailable in this app build.'));return window.Capacitor.nativePromise('TuxiePlayback',method,options)}
function isCurrentTrackPlaying(){return app.current?.kind==='android'?app.native.isPlaying:!audio.paused}
function currentPlaybackPosition(){return app.current?.kind==='android'?app.native.position:audio.currentTime||app.resumeTime||0}
function currentPlaybackDuration(){return app.current?.kind==='android'?app.native.duration:audio.duration||app.current?.duration||0}
function paintRangeProgress(control,value){if(control)control.style.setProperty('--range-progress',`${Math.max(0,Math.min(100,Number(value)||0))}%`)}
function syncNativePlaybackModes(){
  if(!app.native.enabled)return;
  nativePlaybackCall('setModes',{repeatMode:app.repeatMode,shuffle:app.shuffle}).catch(error=>{
    console.error('Could not update native playback modes.',error);
    notify('Playback mode changes could not be applied on Android.');
  });
}
function syncNativeQueue(){
  if(!app.native.enabled||app.current?.kind!=='android')return;
  const seen=new Set();
  const queue=[app.current,...app.queue.map(getTrack).filter(track=>track?.kind==='android')]
    .filter(track=>track&&!seen.has(track.id)&&seen.add(track.id));
  nativePlaybackCall('updateQueue',{
    items:queue.map(track=>({id:track.id,uri:track.uri,title:track.title,artist:track.artist,album:track.album,artworkUri:track.artworkUri||''})),
    position:Math.round(app.native.position*1000)
  }).catch(error=>{
    console.error('Could not update the Android playback queue.',error);
    notify('The Android playback queue could not be updated.');
  });
}
function updateLibraryScanStatus(){const loaded=app.tracks.filter(track=>track.kind==='android').length;const message=app.native.cancelRequested?'Stopping library scan…':`Scanning your music… ${loaded}${app.native.totalCount?` of ${app.native.totalCount}`:''} songs found.`;for(const status of document.querySelectorAll('[data-scan-message]'))status.textContent=message}
async function scanAndroidLibrary(append=false,scanAll=false,scanToken=null){
  if(scanToken!==null&&scanToken!==app.native.scanToken)return false;
  if(!app.native.enabled||app.native.scanInFlight)return false;
  const activeToken=scanToken===null?++app.native.scanToken:scanToken;
  app.native.scanning=true;
  app.native.cancelRequested=false;
  app.native.scanInFlight=true;
  const offset=append?app.native.nextOffset:0;
  renderPage();
  try{
    const result=await nativePlaybackCall('scanLibrary',{offset,limit:app.native.pageSize});
    if(activeToken!==app.native.scanToken)return false;
    if(result.permissionRequired){app.native.permissionRequired=true;app.native.scanning=false;renderPage();return false}
    const nativeTracks=(result.tracks||[]).map(track=>({...track,tone:'demo'}));
    app.tracks=window.TuxieLibraryState.mergeDevicePage(app.tracks,nativeTracks,{append,queueIds:app.queue,currentId:app.current?.id});
    app.native.nextOffset=Math.max(offset,Number(result.nextOffset)||offset);
    app.native.totalCount=Math.max(0,Number(result.totalCount)||0);
    app.native.hasMore=result.hasMore===true;
    app.native.permissionRequired=false;
    if(scanAll&&app.native.hasMore&&activeToken===app.native.scanToken){
      if(append)updateLibraryScanStatus();else renderPage();
      app.native.scanTimer=window.setTimeout(()=>scanAndroidLibrary(true,true,activeToken),32);
    }else{
      app.native.scanning=false;
      renderPage();
    }
    return true;
  }catch(error){
    if(activeToken===app.native.scanToken){diagnostic('android-library-scan',error);app.native.scanning=false;renderPage();notify(error.message||'Android could not scan the music library.')}
    return false
  }finally{
    app.native.scanInFlight=false;
    if(activeToken!==app.native.scanToken){app.native.scanning=false;app.native.cancelRequested=false;renderPage()}
  }
}
function cancelAndroidLibraryScan(){
  if(!app.native.scanning&&!app.native.scanInFlight)return;
  app.native.scanToken++;
  clearTimeout(app.native.scanTimer);
  app.native.scanTimer=0;
  app.native.cancelRequested=true;
  updateLibraryScanStatus();
}
async function openAndroidAppSettings(){
  try{await nativePlaybackCall('openAppSettings')}
  catch(error){console.error('Could not open Android app settings.',error);notify(error.message||'Android app settings could not be opened.')}
}
async function requestAndroidMusicAccess(){
  try{
    const result=await nativePlaybackCall('requestAudioPermission');
    if(!result.granted){app.native.permissionRequired=true;renderPage();notify('Music access was not granted. Allow audio access in Android Settings, or choose individual files.');return}
    app.native.permissionRequired=false;
    await scanAndroidLibrary(false,true);
  }catch(error){console.error('Could not request Android music access.',error);notify(error.message||'Android music access could not be requested.')}
}
async function requestAndroidNotificationPermission(){
  try{
    const result=await nativePlaybackCall('requestNotificationPermission');
    app.native.notificationDenied=!result.granted;
    localStorage.setItem('vey-notifications-denied',String(app.native.notificationDenied));
    notify(result.granted?'Playback notifications are enabled.':'Notification permission was not granted; playback remains available.');
    renderPage();
  }catch(error){console.error('Could not request Android notification permission.',error);notify(error.message||'Android notification permission could not be requested.')}
}
async function openAndroidNotificationSettings(){
  try{await nativePlaybackCall('openNotificationSettings')}
  catch(error){console.error('Could not open Android notification settings.',error);notify(error.message||'Android notification settings could not be opened.')}
}
function updateNativePlaybackState(state){
  if(!state||typeof state!=='object')return;
  const playbackError=typeof state.playbackError==='string'?state.playbackError:'';
  if(playbackError&&playbackError!==app.native.lastPlaybackError){app.native.lastPlaybackError=playbackError;console.error('Android Media3 playback error:',playbackError);notify(`Could not play this track: ${playbackError}`)}
  else if(!playbackError)app.native.lastPlaybackError='';
  const id=typeof state.currentId==='string'?state.currentId:null;
  const next=id?app.tracks.find(track=>track.id===id):null;
  const trackChanged=Boolean(next&&app.current?.id!==next.id);
  const playingChanged=app.native.isPlaying!==Boolean(state.isPlaying);
  const modesChanged=(typeof state.shuffle==='boolean'&&app.shuffle!==state.shuffle)||(typeof state.repeatMode==='string'&&app.repeatMode!==state.repeatMode);
  if(next)app.current=next;
  app.native.isPlaying=Boolean(state.isPlaying);
  if(typeof state.shuffle==='boolean')app.shuffle=state.shuffle;
  if(['off','one','all'].includes(state.repeatMode))app.repeatMode=state.repeatMode;
  app.native.position=Math.max(0,Number(state.position)||0)/1000;
  app.native.duration=Math.max(0,Number(state.duration)||0)/1000;
  app.resumeTime=app.native.position;
  if(Array.isArray(state.queue)&&Number.isInteger(state.currentIndex)&&state.currentIndex>=0){
    app.queue=state.queue.slice(state.currentIndex+1).filter(queueId=>typeof queueId==='string'&&queueId!==id);
  }
  if(trackChanged){app.recent=[next.id,...app.recent.filter(recentId=>recentId!==next.id)].slice(0,12);persist();savePlaybackState()}
  if(trackChanged||playingChanged||modesChanged){renderMini();renderQueue();if(!document.getElementById('now-playing').classList.contains('hidden'))renderNowPlaying()}
  else syncProgress();
  if(state.ended&&app.current?.kind==='android'&&app.native.lastEndedId!==app.current.id){
    app.native.lastEndedId=app.current.id;
    if(app.repeatMode!=='one')nextTrack(1,true);
  }else if(!state.ended)app.native.lastEndedId=null;
}
async function refreshNativePlaybackState(){
  if(!app.native.enabled||document.hidden||app.native.refreshingState)return;
  app.native.refreshingState=true;
  try{
    const state=await nativePlaybackCall('getPlaybackSnapshot');
    app.native.lastPollError='';
    if(Number.isFinite(state.volume)){app.native.volume=state.volume;app.native.volumeFixed=Boolean(state.volumeFixed);for(const slider of [document.getElementById('volume-slider'),document.getElementById('now-volume-slider')])if(slider){slider.value=state.volume;slider.disabled=app.native.volumeFixed;slider.title=app.native.volumeFixed?'This audio device has fixed media volume.':'';paintRangeProgress(slider,state.volume*100)}}
    updateNativePlaybackState(state);
    if(app.current?.kind==='android'&&Date.now()-app.native.lastStateSave>=5000){app.native.lastStateSave=Date.now();savePlaybackState()}
  }catch(error){const message=error?.message||'Unknown native bridge error';if(message!==app.native.lastPollError){console.error('Native Android playback status could not be refreshed; polling will retry.',error);app.native.lastPollError=message}}
  finally{app.native.refreshingState=false}
}
function startNativePlaybackPolling(){if(!app.native.enabled||app.native.pollTimer)return;refreshNativePlaybackState();app.native.pollTimer=setInterval(refreshNativePlaybackState,1000)}
async function restoreNativePlayback(){const scanned=await scanAndroidLibrary(false,true);if(scanned){const savedIds=[app.pendingPlaybackTrackId,...app.queue].filter(id=>typeof id==='string'&&id.startsWith('android:'));if(savedIds.length){const result=await nativePlaybackCall('getTracks',{ids:[...new Set(savedIds)].slice(0,500)});const restored=new Map([...app.tracks,...(result.tracks||[]).map(track=>({...track,tone:'demo'}))].map(track=>[track.id,track]));app.tracks=[...restored.values()];app.current=app.pendingPlaybackTrackId?getTrack(app.pendingPlaybackTrackId)||null:app.current;app.pendingPlaybackTrackId=null}const state=await nativePlaybackCall('getPlaybackState');if(state.currentId)updateNativePlaybackState(state);else if(app.current?.kind==='android')await playNativeTrack(app.current,true,{position:app.resumeTime,autoplay:app.native.restorePlaying})}startNativePlaybackPolling()}
async function setCurrentPlaybackPosition(seconds){
  if(app.current?.kind==='android'){try{await nativePlaybackCall('seek',{position:Math.max(0,Math.round(seconds*1000))});app.native.position=Math.max(0,seconds);syncProgress();schedulePlaybackStateSave()}catch(error){console.error('Native Android seeking failed.',error);notify('The playback position could not be changed.')}return}
  if(Number.isFinite(audio.duration)){audio.currentTime=audio.duration?Math.max(0,Math.min(audio.duration,seconds)):0;app.resumeTime=audio.currentTime;syncProgress();syncLyrics(true);schedulePlaybackStateSave()}
}
async function setPlaybackVolume(value){
  const clamped=Math.max(0,Math.min(1,Number(value)||0));
  if(app.native.enabled){app.native.pendingVolume=clamped;app.native.volume=clamped;for(const slider of [document.getElementById('volume-slider'),document.getElementById('now-volume-slider')])if(slider){slider.value=clamped;paintRangeProgress(slider,clamped*100)}clearTimeout(app.native.volumeTimer);app.native.volumeTimer=setTimeout(async()=>{try{const state=await nativePlaybackCall('setSystemVolume',{value:app.native.pendingVolume});app.native.volume=state.value;app.native.volumeFixed=Boolean(state.fixed);for(const slider of [document.getElementById('volume-slider'),document.getElementById('now-volume-slider')])if(slider){slider.value=state.value;slider.disabled=app.native.volumeFixed;paintRangeProgress(slider,state.value*100)}schedulePlaybackStateSave()}catch(error){console.error('Android system media volume could not be changed.',error);notify('The phone media volume could not be changed.');refreshNativePlaybackState()}},90);return}
  audio.volume=clamped;paintRangeProgress(document.getElementById('volume-slider'),clamped*100);paintRangeProgress(document.getElementById('now-volume-slider'),clamped*100);schedulePlaybackStateSave();
}
function hydrateNativeArtwork(root=document){
  if(!app.native.enabled)return;
  if(!app.native.artworkObserver&&'IntersectionObserver'in window)app.native.artworkObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){app.native.artworkObserver.unobserve(entry.target);loadNativeArtwork(entry.target)}}),{rootMargin:'120px'});
  root.querySelectorAll('img[data-native-artwork]').forEach(image=>{
    const uri=image.dataset.nativeArtwork;
    if(app.native.artworkCache.has(uri)){image.src=app.native.artworkCache.get(uri);image.hidden=false;return}
    if(app.native.artworkObserver)app.native.artworkObserver.observe(image);
    else loadNativeArtwork(image);
  });
}
async function loadNativeArtwork(image){
  const uri=image.dataset.nativeArtwork;
  if(!uri)return;
  if(app.native.artworkCache.has(uri)){image.src=app.native.artworkCache.get(uri);image.hidden=false;return}
  if(app.native.artworkRequests.has(uri))return;
  app.native.artworkRequests.add(uri);
  try{
    const result=await nativePlaybackCall('getArtwork',{uri});
    if(result.data){const source=`data:image/jpeg;base64,${result.data}`;app.native.artworkCache.set(uri,source);const track=app.tracks.find(item=>item.artworkUri===uri);if(track){track.artworkUrl=source;if(app.current?.id===track.id)document.getElementById('now-playing').style.setProperty('--now-art-image',`url("${source}")`)}document.querySelectorAll('img[data-native-artwork]').forEach(candidate=>{if(candidate.dataset.nativeArtwork===uri){candidate.src=source;candidate.hidden=false}});if(app.native.artworkCache.size>48)app.native.artworkCache.delete(app.native.artworkCache.keys().next().value)}
  }catch(error){console.warn('Android album art is unavailable for this track.',error)}
  finally{app.native.artworkRequests.delete(uri)}
}
app.equalizer={enabled:true,preset:'Flat',bands:[0,0,0,0,0,0],outputGain:0};
app.audioGraph=null;
app.equalizerAvailable=null;
app.equalizerError='';
app.equalizerSaveTimer=0;
app.lyricsByTrack=new Map();
app.lyricsProviderUrl=localStorage.getItem('vey-lyrics-endpoint')||'';
app.lyricsProviderToken='';
app.lyricsDialogTrackId=null;
app.activeLyricIndex=-2;
app.pendingPlaybackTrackId=null;
let playRequestToken=0;
document.body.dataset.theme=['system','light','dark'].includes(app.theme)?app.theme:'system';
const audioExtensions=new Set(['.mp3','.m4a','.aac','.flac','.wav','.ogg','.opus','.wma']);
const fmt=s=>{if(!Number.isFinite(s)||s<0)return '0:00';return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`};
function shuffled(items){const result=[...items];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]]}return result}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function decodeText(bytes){if(!bytes.length)return '';const encoding=bytes[0];try{const label=encoding===1?'utf-16':encoding===2?'utf-16be':encoding===3?'utf-8':'windows-1252';return new TextDecoder(label).decode(bytes.slice(1)).replace(/\0/g,'').trim()}catch(error){console.warn('Skipped an unreadable audio metadata text field.',error);return ''}}
async function readAudioMetadata(file){const head=new Uint8Array(await file.slice(0,Math.min(file.size,2*1024*1024)).arrayBuffer()),meta={};if(head.length>=10&&head[0]===73&&head[1]===68&&head[2]===51){const version=head[3],end=Math.min(head.length,10+((head[6]&127)<<21)+((head[7]&127)<<14)+((head[8]&127)<<7)+(head[9]&127));let offset=10;while(offset+10<=end){const id=String.fromCharCode(...head.slice(offset,offset+4));if(!id.trim()||id.charCodeAt(0)===0)break;let size=version===4?((head[offset+4]&127)<<21)+((head[offset+5]&127)<<14)+((head[offset+6]&127)<<7)+(head[offset+7]&127):((head[offset+4]<<24)|(head[offset+5]<<16)|(head[offset+6]<<8)|head[offset+7])>>>0;if(size<=0||offset+10+size>end)break;const frame=head.subarray(offset+10,offset+10+size);if(['TIT2','TPE1','TALB','TRCK','TCON','TYER','TDRC'].includes(id)&&frame.length>1)meta[({TIT2:'title',TPE1:'artist',TALB:'album',TRCK:'trackNumber',TCON:'genre',TYER:'year',TDRC:'year'})[id]]=decodeText(frame);if(id==='APIC'&&frame.length>16){let mimeEnd=1;while(mimeEnd<frame.length&&frame[mimeEnd]!==0)mimeEnd++;const mime=String.fromCharCode(...frame.subarray(1,mimeEnd)),descriptionStart=mimeEnd+2,encoding=frame[0],doubleNull=encoding===1||encoding===2;let descriptionEnd=descriptionStart;for(;descriptionEnd<frame.length-1;descriptionEnd++)if(frame[descriptionEnd]===0&&(!doubleNull||frame[descriptionEnd+1]===0)){descriptionEnd+=doubleNull?2:1;break}const image=frame.slice(descriptionEnd);if(image.length>0&&image.length<=5*1024*1024){meta.artwork=new Blob([image],{type:mime.startsWith('image/')?mime:'image/jpeg'});meta.artworkUrl=URL.createObjectURL(meta.artwork)}}offset+=10+size}}if(file.size>=128){const tail=new Uint8Array(await file.slice(-128).arrayBuffer());if(String.fromCharCode(...tail.slice(0,3))==='TAG'){const decodeV1=bytes=>new TextDecoder('windows-1252').decode(bytes).replace(/\0/g,'').trim();meta.title||=decodeV1(tail.slice(3,33));meta.artist||=decodeV1(tail.slice(33,63));meta.album||=decodeV1(tail.slice(63,93));if(tail[125]===0&&tail[126])meta.trackNumber||=String(tail[126])}}return meta}
function fallbackTitle(fileName){return fileName.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim()||'Untitled track'}
function audioFingerprint(relativePath,file){const path=relativePath.replace(/\\/g,'/').toLowerCase(),canonical=path.includes('/')?path.slice(path.indexOf('/')+1):path;return `${canonical}|${file.size}|${file.lastModified}`}
function probeTrackDuration(track,url){const probe=new Audio();probe.preload='metadata';const timer=setTimeout(()=>{probe.removeAttribute('src');probe.load()},15000);probe.onloadedmetadata=()=>{clearTimeout(timer);track.duration=Number.isFinite(probe.duration)?probe.duration:0;for(const row of document.querySelectorAll('.track-row[data-track]'))if(row.dataset.track===track.id){const duration=row.querySelector('.track-duration');if(duration)duration.textContent=fmt(track.duration)}probe.removeAttribute('src');probe.load()};probe.onerror=()=>{clearTimeout(timer);probe.removeAttribute('src');probe.load()};probe.src=url}
async function optimizeArtwork(blob){try{const image=await createImageBitmap(blob),scale=Math.min(1,512/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d',{alpha:false}).drawImage(image,0,0,canvas.width,canvas.height);image.close();return await new Promise(resolve=>canvas.toBlob(result=>resolve(result||blob),'image/webp',.82))}catch(error){console.warn('Could not resize embedded album artwork; the original thumbnail will be kept.',error);return blob}}
function artwork(t,size='small',extra=''){return `<span class="artwork ${esc(t.tone||'demo')} ${size} ${extra}" aria-label="${esc(t.album||t.title)} cover art">${t.artworkUrl?`<img class="cover-image" src="${esc(t.artworkUrl)}" alt="">`:'<i class="orb"></i><i class="ring"></i><i class="art-line"></i><i class="art-spark"></i>'}</span>`}
function notify(message){const toast=document.getElementById('toast');toast.textContent=message;toast.classList.add('show');clearTimeout(app.toastTimer);app.toastTimer=setTimeout(()=>toast.classList.remove('show'),2700)}
function persist(){localStorage.setItem('vey-favorites',JSON.stringify([...app.favorites]));localStorage.setItem('vey-playlists',JSON.stringify(app.playlists));localStorage.setItem('vey-recent',JSON.stringify(app.recent))}
function openLibraryDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open('vey-library-v1',4);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('handles'))db.createObjectStore('handles');if(!db.objectStoreNames.contains('artwork'))db.createObjectStore('artwork');if(!db.objectStoreNames.contains('files'))db.createObjectStore('files');if(!db.objectStoreNames.contains('lyrics'))db.createObjectStore('lyrics')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function storeFileHandle(id,handle){const db=await openLibraryDb();await new Promise((resolve,reject)=>{const transaction=db.transaction('handles','readwrite');transaction.objectStore('handles').put(handle,id);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error)});db.close()}
async function storeFileHandles(entries){if(!entries.length)return;const db=await openLibraryDb();await new Promise((resolve,reject)=>{const transaction=db.transaction('handles','readwrite'),store=transaction.objectStore('handles');for(const [id,handle]of entries)store.put(handle,id);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error)});db.close()}
async function storeLocalArtwork(entries){if(!entries.length)return;const db=await openLibraryDb();await new Promise((resolve,reject)=>{const transaction=db.transaction('artwork','readwrite'),store=transaction.objectStore('artwork');for(const [id,blob]of entries)store.put(blob,id);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error)});db.close()}
async function storeImportedLocalData(handles,artwork,files=[]){if(!handles.length&&!artwork.length&&!files.length)return;const db=await openLibraryDb();try{await new Promise((resolve,reject)=>{const stores=[];if(handles.length)stores.push('handles');if(artwork.length)stores.push('artwork');if(files.length)stores.push('files');const transaction=db.transaction(stores,'readwrite');for(const [id,handle]of handles)transaction.objectStore('handles').put(handle,id);for(const [id,blob]of artwork)transaction.objectStore('artwork').put(blob,id);for(const [id,file]of files)transaction.objectStore('files').put(file,id);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error||new Error('The browser stopped saving imported files.'))})}finally{db.close()}}
async function readFileHandle(id){const db=await openLibraryDb();const handle=await new Promise((resolve,reject)=>{const request=db.transaction('handles').objectStore('handles').get(id);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error)});db.close();return handle}
async function readLocalFile(id){const db=await openLibraryDb();try{return await new Promise((resolve,reject)=>{const request=db.transaction('files').objectStore('files').get(id);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error)})}finally{db.close()}}
async function removeFileHandle(id){const db=await openLibraryDb();await new Promise((resolve,reject)=>{const transaction=db.transaction('handles','readwrite');transaction.objectStore('handles').delete(id);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error)});db.close()}
async function restoreLocalLibrary(){const rows=JSON.parse(localStorage.getItem('vey-local-library')||'[]');for(const row of rows){if(!app.tracks.some(t=>t.id===row.id))app.tracks.push(row)}if(rows.length){try{const db=await openLibraryDb();await new Promise((resolve,reject)=>{const request=db.transaction('handles').objectStore('handles').openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve();return}app.localHandles.set(cursor.key,cursor.value);cursor.continue()};request.onerror=()=>reject(request.error)});await new Promise((resolve,reject)=>{const request=db.transaction('artwork').objectStore('artwork').openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve();return}const track=getTrack(cursor.key);if(track)track.artworkUrl=URL.createObjectURL(cursor.value);cursor.continue()};request.onerror=()=>reject(request.error)});db.close()}catch(error){console.error('Could not reconnect saved audio files:',error);notify('Saved song details loaded, but local-file access is unavailable. Rescan your music folder.')}}renderPage()}
function saveLocalCatalog(){const local=app.tracks.filter(t=>t.kind==='local'&&(t.localFolder||t.fileBacked)).map(({id,title,artist,album,tone,duration,relativePath,size,lastModified,localFolder,fileBacked,fingerprint,folderName})=>({id,title,artist,album,tone,duration,relativePath,size,lastModified,localFolder,fileBacked,fingerprint,folderName,kind:'local'}));localStorage.setItem('vey-local-library',JSON.stringify(local))}
function getSession(){return app.cloud.session}
function cloudReady(){return false}
function storeSession(session){if(session?.access_token&&session.expires_in&&!session.expires_at)session.expires_at=Math.floor(Date.now()/1000)+session.expires_in;app.cloud.session=session;session?sessionStorage.setItem('vey-cloud-session',JSON.stringify(session)):sessionStorage.removeItem('vey-cloud-session')}
function configureCloudSession(){try{app.cloud.session=JSON.parse(sessionStorage.getItem('vey-cloud-session')||'null')}catch(error){sessionStorage.removeItem('vey-cloud-session');console.error('Saved cloud sign-in state was invalid and has been cleared.',error)}}
async function refreshCloudSession(){const session=getSession();if(!session?.refresh_token)return null;const response=await fetch(`${app.cloud.url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{'Content-Type':'application/json','apikey':app.cloud.key},body:JSON.stringify({refresh_token:session.refresh_token})});const data=await response.json();if(!response.ok){storeSession(null);throw new Error(data.msg||data.message||'Your sign-in expired. Please sign in again.')}storeSession(data);return data}
async function cloudApi(path,options={},retry=true){if(!app.cloud.url||!app.cloud.key)throw new Error('Connect a Supabase project in Settings first.');let session=getSession();if(session?.expires_at&&session.expires_at<Date.now()/1000+30)session=await refreshCloudSession();const headers=new Headers(options.headers||{});headers.set('apikey',app.cloud.key);if(session?.access_token)headers.set('Authorization',`Bearer ${session.access_token}`);if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');let response=await fetch(`${app.cloud.url}${path}`,{...options,headers,credentials:'omit'});if(response.status===401&&retry&&session?.refresh_token){await refreshCloudSession();return cloudApi(path,options,false)}const payload=await response.json().catch(()=>null);if(!response.ok)throw new Error(payload?.message||payload?.msg||payload?.error_description||`Cloud request failed (${response.status}).`);return payload}
async function cloudSignIn(email,password,signup=false){app.cloud.error='';const data=await cloudApi(`/auth/v1/${signup?'signup':'token?grant_type=password'}`,{method:'POST',headers:{apikey:app.cloud.key,'Content-Type':'application/json'},body:JSON.stringify({email,password})},false);if(data.access_token){storeSession(data);await fetchCloudCatalog();notify('Signed in to your private music catalogue.')}else notify('Check your email to finish confirming your new account.');renderPage()}
async function fetchCloudCatalog(){if(!getSession())throw new Error('Sign in to browse your private cloud catalogue.');app.cloud.loading=true;app.cloud.error='';renderPage();try{const pageSize=1000,rows=[];let offset=0,page;do{page=await cloudApi(`/rest/v1/songs?select=id,title,artist,album,duration_seconds,track_number,storage_key,rights_verified,streaming_authorized,download_allowed,artwork_storage_key&rights_verified=eq.true&streaming_authorized=eq.true&order=title.asc,id.asc&limit=${pageSize}&offset=${offset}`);if(!Array.isArray(page))throw new Error('The cloud catalogue returned an invalid response.');rows.push(...page);offset+=page.length}while(page.length===pageSize);const cloudTracks=rows.map(row=>({id:`cloud-${row.id}`,cloudId:row.id,title:row.title||'Untitled track',artist:row.artist||'Unknown artist',album:row.album||'Unknown album',duration:Number(row.duration_seconds)||0,trackNumber:row.track_number||'',tone:'cyan',kind:'cloud',storageKey:row.storage_key,downloadAllowed:row.download_allowed===true,artworkStorageKey:row.artwork_storage_key||null}));app.tracks=app.tracks.filter(t=>t.kind!=='cloud').concat(cloudTracks);app.cloudSongs=cloudTracks;app.cloud.loading=false;app.cloud.error='';renderPage()}catch(error){app.cloud.loading=false;app.cloud.error=error.message;renderPage();throw error}}
async function cloudAudioUrl(track){if(!cloudReady())throw new Error('Sign in again to stream this cloud track.');const bucket='music-library',encoded=track.storageKey.split('/').map(encodeURIComponent).join('/'),expiresIn=Math.min(3600,Math.max(1800,Math.ceil((track.duration||0)+300))),result=await cloudApi(`/storage/v1/object/sign/${bucket}/${encoded}`,{method:'POST',body:JSON.stringify({expiresIn})}),signedUrl=result?.signedURL||result?.signedUrl;if(!signedUrl)throw new Error('The private storage service did not provide a playback link.');const signed=signedUrl.startsWith('/')?`/storage/v1${signedUrl}`:signedUrl;return new URL(signed,`${app.cloud.url}/`).href}
async function downloadCloudTrack(track){if(!track||track.kind!=='cloud'||!track.downloadAllowed){notify('This track is not permitted for download.');return}try{const bucket='music-library',encoded=track.storageKey.split('/').map(encodeURIComponent).join('/'),filename=track.storageKey.split('/').pop(),result=await cloudApi(`/storage/v1/object/sign/${bucket}/${encoded}`,{method:'POST',body:JSON.stringify({expiresIn:60,download:filename})}),signedUrl=result?.signedURL||result?.signedUrl;if(!signedUrl)throw new Error('A download link could not be created.');const signed=signedUrl.startsWith('/')?`/storage/v1${signedUrl}`:signedUrl,url=new URL(signed,`${app.cloud.url}/`).href;showDialog(`<h2 id="dialog-title">Your download is ready.</h2><p>This link expires in one minute. The storage service applies its download headers; your browser will ask where to save the file.</p><a class="dialog-submit download-link" href="${esc(url)}" download="${esc(filename)}" rel="noreferrer">Save ${esc(track.title)}</a>`)}catch(error){console.error('Could not prepare the permitted cloud download:',error);notify(error.message)}}
function getTrack(id){return app.tracks.find(t=>t.id===id)}
function resolvePendingPlaybackTrack(){if(!app.pendingPlaybackTrackId)return;const track=getTrack(app.pendingPlaybackTrackId);if(!track)return;app.current=track;app.pendingPlaybackTrackId=null;renderMini();renderQueue()}
function savePlaybackState(){const position=currentPlaybackPosition();app.resumeTime=position;const state={trackId:app.current?.id||app.pendingPlaybackTrackId||null,position,queue:app.queue,shuffle:app.shuffle,repeatMode:app.repeatMode,volume:app.native.enabled?app.native.volume:audio.volume,isPlaying:isCurrentTrackPlaying()};try{localStorage.setItem('vey-playback',JSON.stringify(state))}catch(error){console.error('Could not save playback state to browser storage.',error);notify('Playback state could not be saved by this browser.')}}
function schedulePlaybackStateSave(){clearTimeout(app.playbackSaveTimer);app.playbackSaveTimer=setTimeout(savePlaybackState,700)}
function restorePlaybackState(){try{const state=JSON.parse(localStorage.getItem('vey-playback')||'null');if(!state||typeof state!=='object')return;const currentId=typeof state.trackId==='string'?state.trackId:null;app.queue=Array.isArray(state.queue)?[...new Set(state.queue.filter(id=>typeof id==='string'&&id!==currentId))]:app.queue;app.shuffle=state.shuffle===true;app.repeatMode=['off','all','one'].includes(state.repeatMode)?state.repeatMode:'off';app.current=currentId?getTrack(currentId)||null:null;app.pendingPlaybackTrackId=app.current?null:currentId;app.resumeTime=Number.isFinite(state.position)&&state.position>0?state.position:0;app.native.position=app.resumeTime;app.native.restorePlaying=state.isPlaying===true;if(Number.isFinite(state.volume)){const volume=Math.min(1,Math.max(0,state.volume));if(app.native.enabled)app.native.volume=volume;else audio.volume=volume}document.getElementById('volume-slider').value=app.native.enabled?app.native.volume:audio.volume;renderMini();renderQueue()}catch(error){console.error('Could not restore saved playback state.',error);localStorage.removeItem('vey-playback');notify('Saved playback state was damaged and has been cleared.')}}
function restoreEqualizerSettings(){try{const state=JSON.parse(localStorage.getItem('vey-equalizer')||'null');if(!state||typeof state!=='object')return;app.equalizer.enabled=state.enabled!==false;app.equalizer.preset=Object.prototype.hasOwnProperty.call(EQ_PRESETS,state.preset)||state.preset==='Custom'?state.preset:'Flat';app.equalizer.bands=EQ_BANDS.map((_,index)=>Number.isFinite(state.bands?.[index])?Math.max(-12,Math.min(12,state.bands[index])):0);app.equalizer.outputGain=Number.isFinite(state.outputGain)?Math.max(-12,Math.min(6,state.outputGain)):0}catch(error){console.error('Could not restore equaliser settings.',error);localStorage.removeItem('vey-equalizer');notify('Saved equaliser settings were damaged and have been reset.')}}
function persistEqualizerSettings(){clearTimeout(app.equalizerSaveTimer);app.equalizerSaveTimer=setTimeout(()=>{try{localStorage.setItem('vey-equalizer',JSON.stringify(app.equalizer))}catch(error){console.error('Could not save equaliser settings.',error);notify('Equaliser settings could not be saved by this browser.')}},300)}
function applyEqualizer(){const graph=app.audioGraph;if(!graph)return;const now=graph.context.currentTime,enabled=app.equalizer.enabled;graph.preamp.gain.setTargetAtTime(enabled?10**(app.equalizer.outputGain/20):1,now,.02);graph.filters.forEach((filter,index)=>filter.gain.setTargetAtTime(enabled?app.equalizer.bands[index]:0,now,.02))}
async function ensureAudioGraph(){const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass){app.equalizerAvailable=false;app.equalizerError='This browser does not provide the Web Audio API required for real equaliser processing.';return false}let graph=app.audioGraph;if(!graph){let context,source;try{context=new AudioContextClass();const preamp=context.createGain(),filters=EQ_BANDS.map(frequency=>{const filter=context.createBiquadFilter();filter.type='peaking';filter.frequency.value=frequency;filter.Q.value=1;return filter});source=context.createMediaElementSource(audio);source.connect(preamp);preamp.connect(filters[0]);filters.forEach((filter,index)=>{if(index<filters.length-1)filter.connect(filters[index+1])});filters[filters.length-1].connect(context.destination);graph={context,source,preamp,filters};app.audioGraph=graph;applyEqualizer()}catch(error){if(source&&context){try{source.disconnect();source.connect(context.destination)}catch(fallbackError){console.error('Could not restore direct audio output after equaliser setup failed.',fallbackError)}}app.equalizerAvailable=false;app.equalizerError='The browser could not connect the equaliser to audio playback.';console.error('Could not create the Web Audio equaliser graph.',error);return false}}try{if(graph.context.state==='suspended')await graph.context.resume();if(graph.context.state!=='running')throw new Error(`Audio context state is ${graph.context.state}.`);app.equalizerAvailable=true;app.equalizerError='';applyEqualizer();return true}catch(error){app.equalizerAvailable=false;app.equalizerError='The browser suspended or blocked audio processing. Press Play again or use a browser that permits Web Audio.';console.error('Could not resume the Web Audio equaliser context.',error);return false}}
function equalizerMarkup(){const presetOptions=[...Object.keys(EQ_PRESETS),'Custom'].map(name=>`<option value="${name}" ${name===app.equalizer.preset?'selected':''}>${name}</option>`).join(''),bands=EQ_BANDS.map((frequency,index)=>`<label class="eq-band"><span>${frequency>=1000?`${frequency/1000} kHz`:`${frequency} Hz`}</span><input type="range" min="-12" max="12" step="0.5" value="${app.equalizer.bands[index]}" data-eq-band="${index}" aria-label="${frequency} hertz gain"><output data-eq-value="${index}">${app.equalizer.bands[index]>0?'+':''}${app.equalizer.bands[index]} dB</output></label>`).join('');return `<h2 id="dialog-title">Shape your sound.</h2><p>Six-band equalisation is processed in this browser with the Web Audio API. Device and background support may vary.</p><div id="eq-status" class="settings-hint" role="status">Connecting audio processing…</div><fieldset id="eq-controls" disabled><div class="eq-toolbar"><label class="eq-enable"><input id="eq-enabled" type="checkbox" ${app.equalizer.enabled?'checked':''}> Equaliser on</label><label class="eq-preset-label" for="eq-preset">Preset</label><select id="eq-preset">${presetOptions}</select></div><div class="eq-band-grid">${bands}</div><label class="eq-output-gain" for="eq-output">Output gain <output id="eq-output-value">${app.equalizer.outputGain>0?'+':''}${app.equalizer.outputGain} dB</output><input id="eq-output" type="range" min="-12" max="6" step="0.5" value="${app.equalizer.outputGain}"></label><button class="dialog-submit eq-reset" id="eq-reset" type="button">Reset to Flat</button></fieldset>`}
function updateEqualizerStatus(){const status=document.getElementById('eq-status'),controls=document.getElementById('eq-controls');if(!status||!controls)return;controls.disabled=app.equalizerAvailable!==true;status.textContent=app.equalizerAvailable?`Active in this browser${app.audioGraph?.context.state==='running'?' · audio processing connected':' · waiting for playback'}.`:(app.equalizerError||'The browser equaliser is unavailable. Playback remains unprocessed.')}
async function openEqualizer(){showDialog(equalizerMarkup());document.querySelector('.dialog-card').classList.add('eq-dialog-card');const available=await ensureAudioGraph();updateEqualizerStatus();if(!available)notify('Equaliser controls are unavailable because browser audio processing could not start.')}
function updateEqualizerControls(){const body=document.getElementById('dialog-body');const preset=body.querySelector('#eq-preset');if(preset)preset.value=app.equalizer.preset;app.equalizer.bands.forEach((gain,index)=>{const slider=body.querySelector(`[data-eq-band="${index}"]`),output=body.querySelector(`[data-eq-value="${index}"]`);if(slider)slider.value=gain;if(output)output.textContent=`${gain>0?'+':''}${gain} dB`});const output=body.querySelector('#eq-output'),outputValue=body.querySelector('#eq-output-value'),enabled=body.querySelector('#eq-enabled');if(output)output.value=app.equalizer.outputGain;if(outputValue)outputValue.textContent=`${app.equalizer.outputGain>0?'+':''}${app.equalizer.outputGain} dB`;if(enabled)enabled.checked=app.equalizer.enabled}
function setEqualizerPreset(name){const preset=EQ_PRESETS[name];if(!preset)return;app.equalizer.preset=name;app.equalizer.enabled=true;app.equalizer.bands=[...preset.bands];app.equalizer.outputGain=preset.outputGain;applyEqualizer();updateEqualizerControls();persistEqualizerSettings()}
function parseTimedLyrics(text){const lines=[],source=String(text).replace(/^\uFEFF/,'').split(/\r?\n/),offsetMatch=String(text).match(/\[offset\s*:\s*([+-]?\d+)\]/i),offset=offsetMatch?Number(offsetMatch[1]):0,timestamp=/\[(\d+):([0-5]?\d)(?:[.:](\d{1,3}))?\]/g;for(const line of source){const matches=[...line.matchAll(timestamp)];if(!matches.length)continue;const lyric=line.replace(timestamp,'').replace(/\[[^\]]+\]/g,'').trim();if(!lyric)continue;for(const match of matches){const fraction=match[3]||'',fractionMs=fraction?Number(fraction)*([100,10,1][fraction.length-1]):0,timeMs=Math.max(0,Number(match[1])*60000+Number(match[2])*1000+fractionMs+offset);lines.push({time:timeMs/1000,text:lyric})}}return lines.sort((a,b)=>a.time-b.time)}
async function storeLocalLyrics(trackId,record){const db=await openLibraryDb();try{await new Promise((resolve,reject)=>{const transaction=db.transaction('lyrics','readwrite');transaction.objectStore('lyrics').put(record,trackId);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error||new Error('The browser stopped saving the lyrics file.'))})}finally{db.close()}}
async function restoreLocalLyrics(){const db=await openLibraryDb();try{await new Promise((resolve,reject)=>{const request=db.transaction('lyrics').objectStore('lyrics').openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve();return}const record=cursor.value;if(record&&typeof record.text==='string'){const lines=parseTimedLyrics(record.text);if(lines.length)app.lyricsByTrack.set(cursor.key,{...record,lines})}cursor.continue()};request.onerror=()=>reject(request.error)})}finally{db.close()}}
function updateLyricsDialog(){const track=app.current,heading=document.querySelector('[data-lyrics-title]'),empty=document.getElementById('lyrics-empty'),scroll=document.getElementById('lyrics-scroll'),source=document.getElementById('lyrics-source');if(!track||!heading||!empty||!scroll)return;const record=app.lyricsByTrack.get(track.id),lines=record?.lines||[];app.lyricsDialogTrackId=track.id;app.activeLyricIndex=-2;heading.textContent=`Lyrics · ${track.title}`;empty.hidden=lines.length>0;scroll.innerHTML=lines.map((line,index)=>`<p class="lyric-line" data-lyric-index="${index}">${esc(line.text)}</p>`).join('');source.textContent=record?.source==='provider'?'From your configured provider.':'From a local .lrc file.';source.hidden=!record}
function syncLyrics(forceScroll=false){if(!document.getElementById('lyrics-scroll'))return;if(app.lyricsDialogTrackId!==app.current?.id)updateLyricsDialog();const record=app.current&&app.lyricsByTrack.get(app.current.id),lines=record?.lines||[],time=audio.currentTime||app.resumeTime||0;let low=0,high=lines.length-1,index=-1;while(low<=high){const middle=(low+high)>>1;if(lines[middle].time<=time){index=middle;low=middle+1}else high=middle-1}if(index===app.activeLyricIndex&&!forceScroll)return;const scroll=document.getElementById('lyrics-scroll');scroll?.querySelector('.lyric-line.active')?.classList.remove('active');app.activeLyricIndex=index;if(index<0)return;const active=scroll?.querySelector(`[data-lyric-index="${index}"]`);active?.classList.add('active');if(active&&(forceScroll||index>=0))active.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
function openLyrics(){if(!app.current){notify('Choose a song before opening its lyrics.');return}showDialog(`<h2 id="dialog-title" data-lyrics-title>Lyrics · ${esc(app.current.title)}</h2><p>Tuxie displays only timed lyrics you provide or retrieve from your configured authorised source. It never generates lyrics.</p><div class="lyrics-actions"><button class="secondary-button" type="button" id="load-lyrics">Load .lrc file</button><button class="secondary-button" type="button" id="fetch-lyrics" ${app.lyricsProviderUrl?'':'disabled'}>Find with provider</button></div><p id="lyrics-source" class="settings-hint" hidden></p><div id="lyrics-empty" class="empty-state">No timed lyrics are saved for this song. Load a .lrc file, or configure an authorised provider in Settings.</div><div id="lyrics-scroll" class="lyrics-scroll"></div>`);document.querySelector('.dialog-card').classList.add('lyrics-dialog-card');updateLyricsDialog();syncLyrics(true)}
async function loadLyricsFile(file){if(!app.current){notify('Play or select a song before loading lyrics.');return}if(!file.name.toLowerCase().endsWith('.lrc')){notify('Choose a timed .lrc lyrics file.');return}const text=await file.text(),lines=parseTimedLyrics(text);if(!lines.length){notify('No timed lyric lines were found in this .lrc file. The existing lyrics were left unchanged.');return}const record={text,fileName:file.name,source:'local',lines};app.lyricsByTrack.set(app.current.id,record);try{await storeLocalLyrics(app.current.id,{text,fileName:file.name,source:'local'});notify(`Timed lyrics loaded for ${app.current.title}.`)}catch(error){console.error('Could not save the local lyrics file.',error);notify('Lyrics loaded for this session, but the browser could not save them for next time.')}updateLyricsDialog();syncLyrics(true)}
async function fetchProviderLyrics(){const track=app.current;if(!track){notify('Choose a song before looking for lyrics.');return}if(!app.lyricsProviderUrl){notify('Configure an authorised lyrics endpoint in Settings first.');return}try{const url=new URL(app.lyricsProviderUrl);if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')throw new Error('Use your provider’s HTTPS endpoint.');url.searchParams.set('title',track.title);url.searchParams.set('artist',track.artist);url.searchParams.set('album',track.album||'');url.searchParams.set('duration',String(Math.round(audio.duration||track.duration||0)));const headers={Accept:'application/json'};if(app.lyricsProviderToken)headers.Authorization=`Bearer ${app.lyricsProviderToken}`;const response=await fetch(url,{headers,credentials:'omit',cache:'no-store',redirect:'error'});if(!response.ok)throw new Error(response.status===404?'The lyrics provider found no matching timed lyrics.':`Lyrics provider request failed (${response.status}).`);const result=await response.json(),text=typeof result?.syncedLyrics==='string'?result.syncedLyrics:typeof result?.lrc==='string'?result.lrc:'';const lines=parseTimedLyrics(text);if(!lines.length)throw new Error('The provider returned no timed lyrics. The app will not invent or display unsynchronised text.');app.lyricsByTrack.set(track.id,{text,lines,source:'provider'});updateLyricsDialog();syncLyrics(true);notify('Timed lyrics loaded from your configured provider.')}catch(error){console.error('Could not retrieve authorised provider lyrics:',error);notify(error.message||'The lyrics provider could not be reached. Check its endpoint and browser CORS settings.')}}
function renderSidebar(){document.getElementById('sidebar-playlists').innerHTML=app.playlists.map(p=>`<button class="playlist-link" data-playlist="${esc(p.id)}">${esc(p.name)}</button>`).join('')}
function setPage(name){app.page=name;document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===name));renderPage();window.scrollTo({top:0,behavior:'smooth'})}
async function playableLocalTrack(track){let url=app.urls.get(track.id);if(url)return url;let handle=app.localHandles.get(track.id);if(!handle&&track.localFolder){handle=await readFileHandle(track.id);if(handle)app.localHandles.set(track.id,handle)}if(handle){try{let permission=await handle.queryPermission({mode:'read'});if(permission!=='granted')permission=await handle.requestPermission({mode:'read'});if(permission==='granted'){const file=await handle.getFile();url=URL.createObjectURL(file);app.urls.set(track.id,url);if(!track.duration){track.duration=await new Promise(resolve=>{const probe=new Audio();probe.preload='metadata';probe.onloadedmetadata=()=>resolve(probe.duration||0);probe.onerror=()=>resolve(0);probe.src=url;setTimeout(()=>resolve(0),5000)})}return url}}catch(error){console.warn(`Could not reconnect ${track.title} through its saved file handle.`,error)}}const file=await readLocalFile(track.id);if(file){url=URL.createObjectURL(file);app.urls.set(track.id,url);return url}if(track.url)return track.url;if(handle)throw new Error('Permission to read this selected audio file was not granted. Reconnect your music folder in Settings.');throw new Error('This local audio file is unavailable. Select it again from its original folder.')}
async function gatherAudioHandles(directory,prefix='',result=[],errors=[],onFound=()=>{}){try{for await(const entry of directory.values()){const path=prefix?`${prefix}/${entry.name}`:entry.name;try{if(entry.kind==='directory'){await gatherAudioHandles(entry,path,result,errors,onFound)}else if(audioExtensions.has(`.${entry.name.split('.').pop().toLowerCase()}`)){result.push({handle:entry,path});onFound(path,result.length)}}catch(error){errors.push(`${path}: ${error.message||'could not be read'}`)}}}catch(error){errors.push(`${prefix||directory.name}: ${error.message||'could not be opened'}`)}return result}
async function selectMusicFolder(){
  if(!window.showDirectoryPicker){document.getElementById('folder-input').click();notify('Choose your music folder in the file picker.');return}
  let root;
  try{root=await window.showDirectoryPicker({id:'vey-music-folder',mode:'read',startIn:'music'})}
  catch(error){if(error.name==='AbortError')return;console.error('Could not open the music folder picker:',error);notify('This browser could not open the music folder. Try choosing audio files instead.');return}
  showDialog(`<h2 id="dialog-title">Scanning your music.</h2><p>Reading audio tags on this device only. Your files will not be uploaded.</p><progress id="scan-progress" max="1" value="0"></progress><p id="scan-status" class="settings-hint">Looking inside ${esc(root.name)}…</p>`);
  try{
    const scanErrors=[],fileErrors=[];
    const entries=await gatherAudioHandles(root,'',[],scanErrors,(path,count)=>{const status=document.getElementById('scan-status');if(status)status.textContent=`Searching ${path} · ${count} supported audio files found`});
    if(!entries.length){closeDialog();notify('No supported audio files were found in that folder.');return}
    const duplicates=new Set(app.tracks.filter(t=>t.fingerprint).map(t=>t.fingerprint));
    const handlesToStore=[],artworkToStore=[],tracksToAdd=[];
    let imported=0,skipped=0,failed=0;
    for(let i=0;i<entries.length;i++){
      const {handle,path}=entries[i];
      try{
        const file=await handle.getFile(),fingerprint=audioFingerprint(`${root.name}/${path}`,file);
        if(duplicates.has(fingerprint)){skipped++}
        else {
        const tags=await readAudioMetadata(file),id=`local-${fingerprint}`;
        const track={id,title:tags.title||fallbackTitle(handle.name),artist:tags.artist||'Unknown artist',album:tags.album||'Unknown album',trackNumber:tags.trackNumber||'',year:tags.year||'',tone:['cyan','rose','amber','violet'][app.tracks.length%4],kind:'local',duration:0,relativePath:path,size:file.size,lastModified:file.lastModified,fingerprint,localFolder:true,folderName:root.name,artworkUrl:''};
        if(tags.artwork){const cover=await optimizeArtwork(tags.artwork);if(tags.artworkUrl)URL.revokeObjectURL(tags.artworkUrl);track.artworkUrl=URL.createObjectURL(cover);artworkToStore.push([id,cover])}
        tracksToAdd.push(track);
        duplicates.add(fingerprint);
        handlesToStore.push([id,handle]);
        imported++;
        }
      }catch(error){failed++;fileErrors.push(`${path}: ${error.message||'could not be read'}`);console.warn(`Could not read ${path} during the local scan.`,error)}
      const progress=document.getElementById('scan-progress'),status=document.getElementById('scan-status');
      if(progress)progress.value=(i+1)/entries.length;
      if(status)status.textContent=`Scanned ${i+1} of ${entries.length} audio files · ${imported} added`;
      if(i%6===5)await new Promise(requestAnimationFrame);
    }
    await storeImportedLocalData(handlesToStore,artworkToStore);
    app.tracks.push(...tracksToAdd);
    app.localHandles=new Map([...app.localHandles,...handlesToStore]);
    try{saveLocalCatalog()}catch(error){app.tracks=app.tracks.filter(track=>!tracksToAdd.includes(track));throw error}
    const issues=[...scanErrors,...fileErrors];
    if(issues.length){document.getElementById('dialog-body').innerHTML=`<h2 id="dialog-title">Import finished with errors.</h2><p>${imported} added · ${skipped} duplicates · ${issues.length} file or folder errors.</p><ul class="settings-hint">${issues.slice(0,8).map(issue=>`<li>${esc(issue)}</li>`).join('')}</ul>${issues.length>8?`<p class="settings-hint">And ${issues.length-8} more; details are available in the browser console.</p>`:''}<button class="dialog-submit" type="button" id="folder-import-done">Done</button>`;document.getElementById('folder-import-done').addEventListener('click',closeDialog)}
    else closeDialog();
    renderPage();
    if(issues.length)console.warn('Some folders or files could not be imported:',issues);
    notify(`${imported} songs added${skipped?`; ${skipped} already in your library`:''}${issues.length?`; ${issues.length} file or folder errors`:''}. Select the same folder again to rescan.`);
  }catch(error){closeDialog();renderPage();console.error('Could not scan or save the selected music folder:',error);notify('The folder could not be fully scanned. No audio was uploaded; try again or import individual files.')}
}
function trackRows(tracks){if(!tracks.length)return `<div class="empty-state">Nothing here just yet. Import a song or start with a Tuxie original.<button data-action="import">Bring in a song</button><button data-action="select-music-folder">Choose music folder</button></div>`;return `<div class="track-list">${tracks.map((t,i)=>`<div class="track-row" data-track="${esc(t.id)}"><span class="track-index">${String(i+1).padStart(2,'0')}</span>${artwork(t)}<div class="track-info"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></div><span class="track-album">${esc(t.album||'On this device')}</span><span class="track-duration">${fmt(t.duration)}</span><button class="more-button" data-queue="${esc(t.id)}" aria-label="Add ${esc(t.title)} to queue">＋</button><button class="heart-button ${app.favorites.has(t.id)?'favorited':''}" data-favorite="${esc(t.id)}" aria-label="${app.favorites.has(t.id)?'Remove from':'Add to'} favorites">${app.favorites.has(t.id)?'♥':'♡'}</button></div>`).join('')}</div>`}
function renderHome(){const hour=new Date().getHours(),greeting=hour<12?'Good morning.':hour<18?'Good afternoon.':'Good evening.',date=new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(new Date()).toUpperCase();return `<div class="welcome-line">${date} <span>✦</span> A LITTLE SPACE FOR YOU</div><h1>${greeting}</h1><p class="page-subtitle">Let the day settle. Your next favorite moment is right here.</p><article class="hero-card"><div class="hero-content"><span class="eyebrow">A VEYLORA ORIGINAL · MADE FOR THIS MOMENT</span><h2>Find your softer<br>side.</h2><p>Warm notes. Open skies. Nowhere else to be.</p><button class="hero-play" data-play="${demoTrack.id}"><span>▶</span> Play a little calm</button></div>${artwork(demoTrack,'large','hero-art')}</article><div class="section-heading"><h2>Made for your mood</h2><button data-page="library">Explore library&nbsp; ↗</button></div><div class="mix-grid">${starterTracks.slice(0,4).map((t,i)=>`<button class="mix-card" data-play="${t.id}">${artwork(t,'medium')}<strong>${['Soft Focus','Slow Bloom','Little Constellations','A Place to Land'][i]}</strong><small>Originals for the in-between</small></button>`).join('')}</div><div class="section-heading"><h2>Recently played</h2><button data-page="library">See all</button></div>${trackRows(app.recent.map(getTrack).filter(Boolean).slice(0,5))}`}
function renderSearch(){const q=app.search.trim().toLowerCase();const found=q?app.tracks.filter(t=>`${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q)):[];return `<h1>Find your sound.</h1><p class="page-subtitle">A song, an artist, or a feeling you can't quite name.</p><label class="search-box"><span>⌕</span><input id="search-input" value="${esc(app.search)}" placeholder="Search your music..." autocomplete="off" aria-label="Search songs"></label>${q?`<div class="section-heading"><h2>${found.length} ${found.length===1?'song':'songs'} found</h2></div>${trackRows(found)}`:`<div class="section-heading"><h2>Start somewhere lovely</h2></div><div class="mix-grid">${starterTracks.slice(0,4).map(t=>`<button class="mix-card" data-play="${t.id}">${artwork(t,'medium')}<strong>${esc(t.album)}</strong><small>Tuxie Originals</small></button>`).join('')}</div>`}`}
function renderLibrary(){const favs=app.tracks.filter(t=>app.favorites.has(t.id));return `<h1>Your library.</h1><p class="page-subtitle">Everything you love, together in one quiet place.</p><div class="section-heading"><h2>Your favorites <span style="color:#858193;font-size:11px">· ${favs.length}</span></h2></div>${trackRows(favs)}<div class="section-heading"><h2>All music <span style="color:#858193;font-size:11px">· ${app.tracks.length}</span></h2><button data-action="import">＋ Import</button></div>${trackRows(app.tracks)}<div class="section-heading"><h2>Playlists</h2><button data-action="create-playlist">＋ Create playlist</button></div>${app.playlists.length?app.playlists.map(p=>`<div class="queue-item" data-playlist="${esc(p.id)}">${artwork({tone:'violet',title:p.name},'small')}<div class="queue-info"><strong>${esc(p.name)}</strong><small>${p.tracks.length} ${p.tracks.length===1?'song':'songs'}</small></div></div>`).join(''):`<div class="empty-state">Your playlists are yours to make.<button data-action="create-playlist">Create your first playlist</button></div>`}`}
function renderPlaylist(id){const p=app.playlists.find(x=>x.id===id);if(!p){setPage('library');return ''}const tracks=p.tracks.map(getTrack).filter(Boolean);return `<div class="playlist-banner">${artwork({tone:'violet',title:p.name},'large')}<div><span class="eyebrow">YOUR PLAYLIST</span><h1>${esc(p.name)}</h1><p class="page-subtitle">${tracks.length} ${tracks.length===1?'song':'songs'} · Curated by you</p><button class="hero-play" data-playlist-play="${esc(p.id)}" ${tracks.length?'':'disabled'}>▶ &nbsp;Play playlist</button></div></div><div class="section-heading"><h2>In this playlist</h2><button data-action="add-to-playlist" data-id="${esc(p.id)}">＋ Add playing song</button></div>${trackRows(tracks)}`}
function groupTracks(field){const groups=new Map();for(const t of app.tracks){const label=(t[field]||'Unknown').trim()||'Unknown';if(!groups.has(label))groups.set(label,[]);groups.get(label).push(t)}return [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0]))}
function renderAlbums(){const groups=groupTracks('album');return `<h1>Albums.</h1><p class="page-subtitle">Follow the whole story, from the first note to the last.</p>${groups.length?`<div class="mix-grid collection-grid">${groups.map(([name,tracks])=>`<button class="mix-card" data-group="album" data-name="${esc(name)}">${artwork(tracks[0],'medium')}<strong>${esc(name)}</strong><small>${esc(tracks[0].artist||'Unknown artist')} · ${tracks.length} ${tracks.length===1?'song':'songs'}</small></button>`).join('')}</div>`:'<div class="empty-state">Import music to start your album collection.</div>'}`}
function renderArtists(){const groups=groupTracks('artist');return `<h1>Artists.</h1><p class="page-subtitle">Meet the artists behind your favourite songs.</p>${groups.length?`<div class="mix-grid collection-grid">${groups.map(([name,tracks])=>`<button class="mix-card artist-card" data-group="artist" data-name="${esc(name)}">${artwork(tracks[0],'medium')}<strong>${esc(name)}</strong><small>${tracks.length} ${tracks.length===1?'song':'songs'} · ${new Set(tracks.map(t=>t.album)).size} albums</small></button>`).join('')}</div>`:'<div class="empty-state">Import music to meet the artists in your collection.</div>'}`}
function renderGroupDetail(){const tracks=app.selectedGroup?app.tracks.filter(t=>t[app.selectedGroup.type]===app.selectedGroup.name):[];return `<button class="text-link" data-page="${app.selectedGroup?.type==='artist'?'artists':'albums'}">‹ Back to ${app.selectedGroup?.type==='artist'?'artists':'albums'}</button><div class="section-heading"><div><span class="eyebrow">${app.selectedGroup?.type==='artist'?'ARTIST':'ALBUM'}</span><h1>${esc(app.selectedGroup?.name||'Your collection')}</h1></div><button data-group-play>▶ Play ${app.selectedGroup?.type==='artist'?'artist':'album'}</button></div>${trackRows(tracks)}`}
function renderQueuePage(){const tracks=app.queue.map(getTrack).filter(Boolean);return `<h1>Up next.</h1><p class="page-subtitle">Your queue stays here while you explore.</p>${tracks.length?`<div class="track-list">${tracks.map((t,i)=>`<div class="track-row" data-queue-track="${esc(t.id)}"><span class="track-index">${String(i+1).padStart(2,'0')}</span>${artwork(t)}<div class="track-info"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></div><span class="track-duration">${fmt(t.duration)}</span><button class="more-button" data-remove-queue="${esc(t.id)}" aria-label="Remove ${esc(t.title)} from queue">×</button></div>`).join('')}</div><div class="section-heading"><button data-action="clear-queue">Clear queue</button></div>`:`<div class="empty-state">Your queue is empty. Play an album or a song to get started.</div>`}`}
function renderDownloads(){const local=app.tracks.filter(t=>t.localFolder),permitted=app.tracks.filter(t=>t.kind==='cloud'&&t.downloadAllowed);return `<h1>Downloads.</h1><p class="page-subtitle">Local-folder songs stay in their original device folders. Cloud copies are available only where permission was granted.</p><div class="section-heading"><h2>On this device · ${local.length}</h2></div>${local.length?trackRows(local):'<div class="empty-state">No local music folder is connected. Select your folder from Settings; Tuxie will not copy or upload your files.</div>'}<div class="section-heading"><h2>Permitted cloud copies · ${permitted.length}</h2></div>${permitted.length?`<div class="track-list">${permitted.map(t=>`<div class="track-row"><span class="track-index">↧</span>${artwork(t)}<div class="track-info"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></div><span class="track-album">${esc(t.album)}</span><span class="track-duration">${fmt(t.duration)}</span><button class="more-button" data-download="${esc(t.id)}" aria-label="Save ${esc(t.title)} to this device">↧</button></div>`).join('')}</div>`:'<div class="empty-state">There are no cloud tracks explicitly permitted for download.</div>'}`}
function renderSettings(){return `<h1>Your settings.</h1><p class="page-subtitle">A listening space that feels like yours.</p><section class="settings-card"><span class="eyebrow">APPEARANCE</span><h2>Choose your light.</h2><p>Match your device, or settle into a theme.</p><label class="settings-control"><span>Theme</span><select id="theme-select" aria-label="Colour theme"><option value="system">Follow device</option><option value="dark">Dark</option><option value="light">Light</option></select></label></section><section class="settings-card"><span class="eyebrow">YOUR MUSIC</span><h2>Bring your collection.</h2><p>Scan your selected music folder, including supported subfolders. Your files stay on this device.</p><button class="hero-play" data-action="select-music-folder">Choose music folder</button><button class="secondary-button" data-action="import">Choose audio files</button><p class="settings-hint">${app.tracks.filter(t=>t.localFolder||t.kind==='local').length} local songs in this browser's library.</p></section><section class="settings-card"><span class="eyebrow">TIMED LYRICS</span><h2>Connect an authorised source.</h2><p>Provider endpoint contract: HTTPS GET with title, artist, album, and duration query parameters; JSON must return timed LRC text in a <code>syncedLyrics</code> or <code>lrc</code> string. The endpoint must allow browser CORS.</p><div class="settings-form"><label>Provider endpoint<input id="lyrics-provider-url" type="url" autocomplete="url" placeholder="https://your-authorised-provider.example/lyrics" value="${esc(app.lyricsProviderUrl)}"></label><label>Optional browser/public token<input id="lyrics-provider-token" type="password" autocomplete="off" placeholder="Never paste a private service secret"></label><button class="hero-play" id="save-lyrics-provider" type="button">Save lyrics source</button></div><p class="settings-hint">The endpoint URL is saved in this browser; an optional token is held only in page memory until reload. Browser-visible tokens are not secrets: use only provider-approved public credentials or your own secure proxy. Tuxie does not choose a lyrics provider or invent lyrics.</p></section><section class="settings-card"><span class="eyebrow">PRIVATE CLOUD LIBRARY</span><h2>Listen across your devices.</h2><p>Connect your own Supabase project. Only rights-cleared tracks in its private catalogue are shown.</p>${renderCloudSettings()}</section>`}
function renderCloudSettings(){const configured=Boolean(app.cloud.url&&app.cloud.key),session=getSession();if(!configured)return `<form data-form="cloud-config" class="settings-form"><label>Supabase project URL<input name="url" type="url" placeholder="https://your-project.supabase.co" required></label><label>Public anon/publishable key<input name="key" type="password" autocomplete="off" placeholder="sb_publishable_…" required></label><p class="settings-hint">Enter the public key only. Never enter a service-role key here.</p><button class="hero-play" type="submit">Connect my project</button></form>`;return `${app.cloud.error?`<p class="error-note">${esc(app.cloud.error)}</p>`:''}${session?`<p class="settings-hint">Signed in as ${esc(session.user?.email||'your account')} · private library connected.</p><div class="settings-buttons"><button class="secondary-button" data-action="refresh-cloud">${app.cloud.loading?'Loading catalogue…':'Refresh cloud catalogue'}</button><button class="secondary-button" data-action="cloud-sign-out">Sign out</button></div>`:`<form data-form="cloud-sign-in" class="settings-form"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required minlength="8"></label><div class="settings-buttons"><button class="hero-play" type="submit">Sign in</button><button class="secondary-button" type="button" data-action="cloud-sign-up">Create account</button></div></form><button class="text-link cloud-config-reset" data-action="disconnect-cloud">Remove saved project settings</button>`}`}
function renderPage(){resolvePendingPlaybackTrack();renderSidebar();const pages={home:renderHome,discover:()=>`<h1>Discover.</h1><p class="page-subtitle">Browse authorized cloud tracks alongside your private music collection.</p><div class="section-heading"><h2>Tuxie originals</h2></div><div class="mix-grid">${starterTracks.slice(0,4).map(t=>`<button class="mix-card" data-play="${t.id}">${artwork(t,'medium')}<strong>${esc(t.album)}</strong><small>${esc(t.artist)}</small></button>`).join('')}</div>${app.cloudSongs.length?`<div class="section-heading"><h2>Your rights-cleared cloud catalogue</h2></div>${trackRows(app.cloudSongs)}`:`<div class="empty-state">Connect and sign in to a private music catalogue you are authorized to stream.</div>`}`,search:renderSearch,library:renderLibrary,albums:renderAlbums,artists:renderArtists,favorites:()=>`<h1>Favourites.</h1><p class="page-subtitle">The songs you keep coming back to.</p>${trackRows(app.tracks.filter(t=>app.favorites.has(t.id)))}`,recent:()=>`<h1>Recently played.</h1><p class="page-subtitle">Pick up where you left off.</p>${trackRows(app.recent.map(getTrack).filter(Boolean))}`,queue:renderQueuePage,downloads:renderDownloads,settings:renderSettings,about:()=>`<h1>About Tuxie.</h1><p class="page-subtitle">A quieter place to listen.</p><section class="settings-card"><span class="eyebrow">THE MUSIC IS YOURS</span><h2>Local by default.</h2><p>Tuxie plays original browser-synthesized demos and audio you choose from this device. Private cloud streaming requires your Supabase project, sign-in, storage policies, and explicit distribution rights.</p><p class="settings-hint">Browser features and real-device/background playback vary by platform and must be tested before distribution.</p></section>`};pageContent.innerHTML=app.page==='playlist-detail'?renderGroupDetail():app.page.startsWith('playlist-')?renderPlaylist(app.page.slice(9)):pages[app.page]?pages[app.page]():renderLibrary();const themeSelect=document.getElementById('theme-select');if(themeSelect)themeSelect.value=app.theme;renderQueue();renderMini()}
function renderQueue(){const tracks=app.queue.map(getTrack).filter(t=>t&&t.id!==app.current?.id);document.getElementById('queue-count').textContent=`${tracks.length} ${tracks.length===1?'track':'tracks'}`;document.getElementById('queue-list').innerHTML=tracks.length?tracks.map(t=>`<div class="queue-item" data-queue-track="${esc(t.id)}">${artwork(t)}<span class="queue-info"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></span><span class="queue-duration">${fmt(t.duration)}</span></div>`).join(''):'<div class="empty-state">Your queue is clear.</div>'}
function renderMini(){const t=app.current;document.getElementById('mini-track').innerHTML=t?`${artwork(t)}<span class="mini-info"><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></span>`:`${artwork(demoTrack)}<span class="mini-info"><strong>Choose a song</strong><small>It's your moment.</small></span>`;document.getElementById('play-button').textContent=audio.paused?'▶':'Ⅱ';document.getElementById('player-favorite').textContent=t&&app.favorites.has(t.id)?'♥':'♡';document.getElementById('player-favorite').classList.toggle('favorited',!!t&&app.favorites.has(t.id));const repeatButton=document.getElementById('repeat-button');repeatButton.classList.toggle('selected',app.repeatMode!=='off');repeatButton.textContent=app.repeatMode==='one'?'↻1':'↻';repeatButton.setAttribute('aria-label',app.repeatMode==='one'?'Repeat this song':app.repeatMode==='all'?'Repeat queue':'Enable repeat');document.getElementById('shuffle-button').classList.toggle('selected',app.shuffle);if(navigator.mediaSession)navigator.mediaSession.playbackState=audio.paused?'paused':'playing';syncProgress();if(!document.getElementById('now-playing').classList.contains('hidden'))renderNowPlaying()}
function syncProgress(){const d=currentPlaybackDuration(),c=currentPlaybackPosition(),progress=d?Math.max(0,Math.min(100,c/d*100)):0,slider=document.getElementById('seek-slider');document.getElementById('current-time').textContent=fmt(c);document.getElementById('total-time').textContent=fmt(d);if(document.activeElement!==slider)slider.value=progress;paintRangeProgress(slider,progress);document.getElementById('mini-player').style.setProperty('--mini-progress',`${progress}%`);const overlay=document.getElementById('now-playing');if(!overlay.classList.contains('hidden')){const cur=overlay.querySelector('#now-current'),total=overlay.querySelector('#now-total'),seek=overlay.querySelector('#now-seek');if(cur)cur.textContent=fmt(c);if(total)total.textContent=fmt(d);if(seek&&document.activeElement!==seek)seek.value=progress;paintRangeProgress(seek,progress)}}
function waveData(t){const rate=16000,seconds=t.duration,samples=Math.floor(rate*seconds),buffer=new ArrayBuffer(44+samples*2),view=new DataView(buffer);const write=(o,s)=>[...s].forEach((c,i)=>view.setUint8(o+i,c.charCodeAt(0)));write(0,'RIFF');view.setUint32(4,36+samples*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,samples*2,true);const out=new Int16Array(buffer,44),base=t.tone==='cyan'?174:t.tone==='rose'?220:t.tone==='amber'?196:t.tone==='violet'?164:196;const chord=[1,1.25,1.5,2];for(let i=0;i<samples;i++){const time=i/rate,fade=Math.min(1,time/1.4,(seconds-time)/2),beat=time%2.4,thump=Math.exp(-beat*8)*Math.sin(2*Math.PI*(base*.51)*time)*.16,bed=Math.sin(2*Math.PI*base*time)*.16;let notes=0;for(let n=0;n<chord.length;n++)notes+=Math.sin(2*Math.PI*base*chord[n]*time+(n*.33))*.042;const shimmer=Math.sin(2*Math.PI*base*4*time)*.009*Math.sin(time*1.3);out[i]=Math.max(-32767,Math.min(32767,(bed+notes+thump+shimmer)*fade*32767))}return URL.createObjectURL(new Blob([buffer],{type:'audio/wav'}))}
async function playNativeTrack(track,preserveQueue=false,restore=null){
  if(!track||track.kind!=='android'){notify('Choose a song from your Android music library.');return}
  const sameTrack=app.current?.id===track.id;
  try{
    if(sameTrack&&!restore){await nativePlaybackCall('toggle');await refreshNativePlaybackState();return}
    audio.pause();audio.removeAttribute('src');audio.load();
    if(!preserveQueue){
      const index=app.tracks.findIndex(item=>item.id===track.id);
      app.queue=(index<0?app.tracks.filter(item=>item.id!==track.id):[...app.tracks.slice(index+1),...app.tracks.slice(0,index)]).map(item=>item.id);
      if(app.shuffle)app.queue=shuffled(app.queue);
    }
    const position=restore&&Number.isFinite(restore.position)?Math.max(0,restore.position):0;
    const autoplay=restore?restore.autoplay===true:true;
    app.current=track;app.resumeTime=position;app.native.position=position;app.native.duration=track.duration||0;app.native.isPlaying=autoplay;
    syncLyrics(true);
    const seen=new Set([track.id]),queue=[track,...app.queue.map(getTrack).filter(item=>item?.kind==='android'&&!seen.has(item.id)&&seen.add(item.id))];
    await nativePlaybackCall('playQueue',{items:queue.map(item=>({id:item.id,uri:item.uri,title:item.title,artist:item.artist,album:item.album,artworkUri:item.artworkUri||''})),index:0,position:Math.round(position*1000),play:autoplay});
    await nativePlaybackCall('setModes',{repeatMode:app.repeatMode,shuffle:app.shuffle});
    app.recent=[track.id,...app.recent.filter(id=>id!==track.id)].slice(0,12);
    persist();saveLocalCatalog();savePlaybackState();renderMini();renderQueue();renderPage();startNativePlaybackPolling();
  }catch(error){
    app.native.isPlaying=false;app.current=null;app.resumeTime=0;
    renderMini();renderQueue();savePlaybackState();
    diagnostic('native-playback-start',error);
    notify(error.message||'Android could not play this track. The file may have been removed or may use an unsupported format.');
  }
}
async function playTrack(t,preserveQueue=false){
  if(!t){notify('Add songs to your playlist to start listening.');return}
  if(t.kind==='android'){await playNativeTrack(t,preserveQueue);return}
  const audioGraphPromise=ensureAudioGraph();
  const sameTrack=app.current?.id===t.id||app.pendingPlaybackTrackId===t.id;
  if(sameTrack&&audio.getAttribute('src')){
    try{if(audio.paused){await audioGraphPromise;await audio.play()}else audio.pause();return}
    catch(error){notify('Playback could not resume. Check the audio file and try again.');console.error('Could not resume the current track.',error);return}
  }
  const request=++playRequestToken,resumeAt=sameTrack?app.resumeTime:0;
  app.pendingPlaybackTrackId=null;
  try{
    audio.pause();audio.removeAttribute('src');audio.load();
    if(!preserveQueue&&!sameTrack){const index=app.tracks.findIndex(track=>track.id===t.id),following=index>=0?[...app.tracks.slice(index+1),...app.tracks.slice(0,index)]:app.tracks.filter(track=>track.id!==t.id);app.queue=following.map(track=>track.id);if(app.shuffle)app.queue=shuffled(app.queue)}
    app.current=t;
    syncLyrics(true);
    if(!sameTrack)app.resumeTime=0;
    if(navigator.mediaSession&&'MediaMetadata'in window){try{navigator.mediaSession.metadata=new MediaMetadata({title:t.title,artist:t.artist,album:t.album||'Tuxie Music'})}catch(error){console.warn('The browser could not set media metadata.',error)}}
    let source;
    if(t.kind==='local')source=await playableLocalTrack(t);
    else if(t.kind==='cloud')source=await cloudAudioUrl(t);
    else{if(!app.urls.has(t.id))app.urls.set(t.id,waveData(t));source=app.urls.get(t.id)}
    if(request!==playRequestToken)return;
    if(t.kind==='cloud')audio.crossOrigin='anonymous';else audio.removeAttribute('crossorigin');
    audio.src=source;
    audio.currentTime=0;
    if(resumeAt>0){
      await new Promise(resolve=>{if(audio.readyState>=1){resolve();return}const done=()=>{audio.removeEventListener('loadedmetadata',done);audio.removeEventListener('error',done);clearTimeout(timer);resolve()};const timer=setTimeout(done,5000);audio.addEventListener('loadedmetadata',done,{once:true});audio.addEventListener('error',done,{once:true})});
      if(request!==playRequestToken)return;
      if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=Math.min(resumeAt,Math.max(0,audio.duration-0.1));
    }
    await audioGraphPromise;
    await audio.play();
    if(request!==playRequestToken)return;
    app.resumeTime=0;
    if(preserveQueue)app.queue=app.queue.filter(id=>id!==t.id);
    if(Number.isFinite(audio.duration)&&audio.duration>0)t.duration=audio.duration;
    app.recent=[t.id,...app.recent.filter(id=>id!==t.id)].slice(0,12);
    persist();saveLocalCatalog();savePlaybackState();renderMini();renderQueue();renderPage();
  }catch(error){
    if(request!==playRequestToken)return;
    app.current=null;app.resumeTime=0;audio.pause();audio.removeAttribute('src');audio.load();
    renderMini();renderQueue();savePlaybackState();
    const reason=audio.error?.code===3?'This audio file could not be decoded by the browser.':audio.error?.code===4?'This audio format is not supported by the browser.':error.message;
    notify(t.kind==='local'?reason||'This file could not be played. Try another audio file.':t.kind==='cloud'?reason||'This cloud track could not be played.':'Audio could not start. Tap play again to retry.');
    console.error('Playback failed:',error);
  }
}
function toggleFavorite(id){if(!id)return;if(app.favorites.has(id))app.favorites.delete(id);else app.favorites.add(id);persist();renderPage();if(!document.getElementById('now-playing').classList.contains('hidden'))renderNowPlaying()}
function showDialog(content){document.querySelector('.dialog-card').classList.remove('eq-dialog-card','lyrics-dialog-card');document.getElementById('dialog-body').innerHTML=content;document.getElementById('dialog-layer').hidden=false;document.getElementById('dialog-body').querySelector('input,select')?.focus()}
function closeDialog(){document.getElementById('dialog-layer').hidden=true}
function createPlaylist(){showDialog(`<h2 id="dialog-title">A new playlist.</h2><p>Give this little collection a name of its own.</p><form data-form="create-playlist"><label for="playlist-name">Playlist name</label><input id="playlist-name" name="name" maxlength="60" placeholder="Sunday afternoon, slow mornings..." required><button class="dialog-submit" type="submit">Create playlist</button></form>`)}
function showPlaylistChooser(id=''){if(!app.current){notify('Play a song first, then add it to your playlist.');return}if(!app.playlists.length){notify('Create a playlist in Your library first.');return}const options=app.playlists.map(p=>`<option value="${esc(p.id)}" ${p.id===id?'selected':''}>${esc(p.name)}</option>`).join('');showDialog(`<h2 id="dialog-title">Save this song.</h2><p>Choose where “${esc(app.current.title)}” should live.</p><form data-form="choose-playlist"><label for="playlist-choice">Your playlists</label><select id="playlist-choice" name="playlist">${options}</select><button class="dialog-submit" type="submit">Add to playlist</button></form>`)}
function addToPlaylist(id){const p=app.playlists.find(x=>x.id===id);if(!p)return;if(!app.current){notify('Play a song first, then add it to your playlist.');return}if(!p.tracks.includes(app.current.id))p.tracks.push(app.current.id);persist();renderPage();notify(`Added to ${p.name}.`)}
function renderNowPlaying(){const t=app.current||demoTrack;document.getElementById('now-playing').innerHTML=`<button class="now-close" id="close-now" aria-label="Close player">×</button><div class="now-inner"><div class="now-art-frame">${artwork(t,'large')}</div><div class="now-details"><span class="eyebrow">NOW PLAYING · YOUR VEYLORA SESSION</span><h2>${esc(t.title)}</h2><p>${esc(t.artist)} &nbsp;·&nbsp; ${esc(t.album||'On this device')}</p><div class="timeline"><span id="now-current">${fmt(audio.currentTime||app.resumeTime)}</span><input id="now-seek" type="range" min="0" max="100" value="0" aria-label="Seek"><span id="now-total">${fmt(audio.duration||t.duration)}</span></div><div class="transport"><button class="player-icon ${app.shuffle?'selected':''}" data-action="shuffle" aria-label="Shuffle">⤨</button><button class="player-icon" data-action="previous" aria-label="Previous track">|‹</button><button class="play-button" data-action="play" aria-label="Play">${audio.paused?'▶':'Ⅱ'}</button><button class="player-icon" data-action="next" aria-label="Next track">›|</button><button class="player-icon ${app.repeatMode!=='off'?'selected':''}" data-action="repeat" aria-label="${app.repeatMode==='one'?'Repeat this song':app.repeatMode==='all'?'Repeat queue':'Enable repeat'}">${app.repeatMode==='one'?'↻1':'↻'}</button></div><div class="now-extras"><button data-favorite="${esc(t.id)}">${app.favorites.has(t.id)?'♥':'♡'} &nbsp;${app.favorites.has(t.id)?'In your favorites':'Add to favorites'}</button><button data-equalizer>◒ &nbsp;Equaliser</button><button data-lyrics>♫ &nbsp;Lyrics</button><button data-action="add-to-playlist">＋ &nbsp;Add to playlist</button></div></div></div>`}
function openNow(){renderNowPlaying();const el=document.getElementById('now-playing');el.classList.remove('hidden');el.setAttribute('aria-hidden','false');syncProgress();syncLyrics(true)}
function closeNow(){const el=document.getElementById('now-playing');el.classList.add('hidden');el.setAttribute('aria-hidden','true')}
function registerMediaSessionActions(){
  if(!navigator.mediaSession)return;
  const nativeCommand=(method,options)=>nativePlaybackCall(method,options).then(refreshNativePlaybackState).catch(error=>console.warn(`Native media action ${method} failed.`,error));
  const actions={
    play:()=>app.current?.kind==='android'?nativeCommand('toggle'):app.current?playTrack(app.current):playTrack(demoTrack),
    pause:()=>app.current?.kind==='android'?nativeCommand('pause'):audio.pause(),
    previoustrack:()=>nextTrack(-1),
    nexttrack:()=>nextTrack(),
    seekto:details=>{if(Number.isFinite(details.seekTime))setCurrentPlaybackPosition(details.seekTime)},
    seekbackward:details=>setCurrentPlaybackPosition(Math.max(0,currentPlaybackPosition()-(details.seekOffset||10))),
    seekforward:details=>setCurrentPlaybackPosition(Math.min(currentPlaybackDuration()||Infinity,currentPlaybackPosition()+(details.seekOffset||10)))
  };
  for(const [name,handler]of Object.entries(actions))try{navigator.mediaSession.setActionHandler(name,handler)}catch(error){console.warn(`The ${name} media control is unavailable in this browser.`,error)}
}
async function importFiles(files){
  const selected=[...files],duplicates=new Set(app.tracks.filter(track=>track.fingerprint).map(track=>track.fingerprint)),tracks=[],fileEntries=[],artworkEntries=[],issues=[];
  let rejected=0,duplicatesSkipped=0,imported=0,totalBytes=0;
  showDialog(`<h2 id="dialog-title">Importing your music.</h2><p>Reading files on this device. Nothing is uploaded.</p><progress id="scan-progress" max="${Math.max(1,selected.length)}" value="0"></progress><p id="scan-status" class="settings-hint">Preparing ${selected.length} selected files…</p>`);
  for(let index=0;index<selected.length;index++){
    const file=selected[index],relativePath=file.webkitRelativePath||file.name;
    try{
      if(!audioExtensions.has(`.${file.name.split('.').pop().toLowerCase()}`)){rejected++}
      else{
        const fingerprint=audioFingerprint(relativePath,file);
        if(duplicates.has(fingerprint)){rejected++;duplicatesSkipped++}
        else{
          const tags=await readAudioMetadata(file),id=`local-${fingerprint}`,url=URL.createObjectURL(file);
          const track={id,title:tags.title||fallbackTitle(file.name),artist:tags.artist||'Unknown artist',album:tags.album||'Unknown album',trackNumber:tags.trackNumber||'',year:tags.year||'',tone:['cyan','rose','amber','violet'][(app.tracks.length+tracks.length)%4],kind:'local',url,duration:0,artworkUrl:'',relativePath,size:file.size,lastModified:file.lastModified,fingerprint,fileBacked:false,localFolder:false};
          probeTrackDuration(track,url);
          app.urls.set(id,url);
          if(tags.artwork){const cover=await optimizeArtwork(tags.artwork);if(tags.artworkUrl)URL.revokeObjectURL(tags.artworkUrl);track.artworkUrl=URL.createObjectURL(cover);artworkEntries.push([id,cover])}
          tracks.push(track);fileEntries.push([id,file]);duplicates.add(fingerprint);totalBytes+=file.size;imported++;
        }
      }
    }catch(error){rejected++;issues.push(`${relativePath}: ${error.message||'could not be read'}`);console.warn(`Could not import ${relativePath}.`,error)}
    const progress=document.getElementById('scan-progress'),status=document.getElementById('scan-status');
    if(progress)progress.value=index+1;
    if(status)status.textContent=`Processed ${index+1} of ${selected.length} · ${imported} added · ${rejected} skipped`;
    if(index%5===4)await new Promise(requestAnimationFrame);
  }
  let persisted=false,persistenceError='';
  if(imported){
    try{
      const estimate=await navigator.storage?.estimate?.();
      const free=estimate?.quota&&estimate?.usage!==undefined?estimate.quota-estimate.usage:Infinity;
      if(totalBytes+16*1024*1024>free)throw new Error('There is not enough browser storage for a persistent copy of these files.');
      await storeImportedLocalData([],artworkEntries,fileEntries);
      tracks.forEach(track=>track.fileBacked=true);
      app.tracks.push(...tracks);
      try{saveLocalCatalog();persisted=true}
      catch(error){tracks.forEach(track=>track.fileBacked=false);app.tracks=app.tracks.filter(track=>!tracks.includes(track));app.tracks.push(...tracks);persistenceError=`Imported for this session, but the library details could not be saved: ${error.message||'browser storage error'}`;console.error('Could not save imported library metadata.',error)}
    }catch(error){
      persistenceError=`Imported for this session only; persistent browser storage was unavailable (${error.message||'storage error'}).`;
      app.tracks.push(...tracks);
      console.warn('Could not persist selected audio files; keeping them available for this session.',error);
    }
  }
  renderPage();
  const summary=`${imported} added · ${duplicatesSkipped} duplicates · ${rejected-duplicatesSkipped} unsupported or unreadable${persisted?' · saved on this device':''}${persistenceError?` · ${persistenceError}`:''}`;
  if(issues.length||persistenceError){
    const details=[...issues,...(persistenceError?[persistenceError]:[])];
    showDialog(`<h2 id="dialog-title">Import finished.</h2><p>${esc(summary)}</p>${details.length?`<ul class="settings-hint">${details.slice(0,8).map(issue=>`<li>${esc(issue)}</li>`).join('')}</ul>`:''}<button class="dialog-submit" type="button" id="import-done">Done</button>`);
    document.getElementById('import-done').addEventListener('click',closeDialog);
  }else closeDialog();
  notify(imported?`${imported} ${imported===1?'song':'songs'} added${persisted?' and saved on this device':''}${rejected?`; ${duplicatesSkipped} duplicates and ${rejected-duplicatesSkipped} unsupported or unreadable files skipped`:''}.`:duplicatesSkipped===selected.length?'All selected songs are already in your library.':`No new supported audio files were imported; ${rejected} unsupported or unreadable files were skipped.`);
}
function nextTrack(direction=1,automatic=false){
  if(app.current?.kind==='android'){
    if(direction<0&&app.native.position>3){setCurrentPlaybackPosition(0);return}
    if(direction<0){const previousId=app.recent.find(id=>id!==app.current?.id&&getTrack(id));const previous=getTrack(previousId);if(previous)playNativeTrack(previous,true);else if(!automatic)notify('There is no previous song in this listening session.');return}
    if(app.queue.length){const next=getTrack(app.queue[0]);if(next){app.queue=app.queue.slice(1);playNativeTrack(next,true);return}}
    if(app.repeatMode==='all'){const remaining=app.tracks.filter(track=>track.kind==='android'&&track.id!==app.current?.id);const next=remaining[Math.floor(Math.random()*remaining.length)];if(next){playNativeTrack(next,true);return}}
    if(automatic){setCurrentPlaybackPosition(0);nativePlaybackCall('pause').catch(error=>console.error('Could not pause the completed native track.',error))}
    else notify('Your queue is empty. Add another song to continue.');
    return;
  }
  if(direction<0){
    if(audio.currentTime>3){audio.currentTime=0;app.resumeTime=0;syncProgress();savePlaybackState();return}
    const previousId=app.recent.find(id=>id!==app.current?.id&&getTrack(id));
    const previous=getTrack(previousId);
    if(previous)playTrack(previous,true);else if(!automatic)notify('There is no previous song in this listening session.');
    return;
  }
  if(!app.queue.length&&app.repeatMode==='all'&&app.current?.kind==='local'&&app.tracks.filter(track=>track.kind==='local').length===1){
    audio.currentTime=0;
    app.resumeTime=0;
    audio.play().catch(error=>{console.error('Could not repeat the only local song in the queue.',error);notify('This song could not be replayed.')});
    savePlaybackState();
    renderMini();
    return;
  }
  if(!app.queue.length&&app.repeatMode==='all'){
    app.queue=app.tracks.filter(track=>track.id!==app.current?.id).map(track=>track.id);
    if(app.shuffle)app.queue=shuffled(app.queue);
  }
  if(!app.queue.length){
    if(automatic&&app.current){audio.currentTime=0;app.resumeTime=0;syncProgress();savePlaybackState()}
    else if(!automatic)notify('Your queue is empty. Play a song to start a new queue.');
    return;
  }
  const index=app.shuffle?Math.floor(Math.random()*app.queue.length):0,next=getTrack(app.queue[index]);
  if(next)playTrack(next,true);
}
function action(el){const a=el.dataset.action;if(a==='import'){document.getElementById('file-input').click()}else if(a==='scan-device-library'){requestAndroidMusicAccess()}else if(a==='cancel-device-library-scan'){cancelAndroidLibraryScan()}else if(a==='open-app-settings'){openAndroidAppSettings()}else if(a==='request-notifications'){requestAndroidNotificationPermission()}else if(a==='open-notification-settings'){openAndroidNotificationSettings()}else if(a==='load-more-device-library'){scanAndroidLibrary(true)}else if(a==='load-more-search'){window.loadMoreTuxieSearch?.()}else if(a==='show-more-tracks'){app.visibleTrackLimit=(app.visibleTrackLimit||60)+60;renderPage()}else if(a==='select-music-folder'){selectMusicFolder()}else if(a==='create-playlist'){createPlaylist()}else if(a==='add-to-playlist'){showPlaylistChooser(el.dataset.id||'')}else if(a==='clear-queue'){app.queue=[];syncNativeQueue();renderPage();notify('Your queue is clear.')}else if(a==='refresh-cloud'){fetchCloudCatalog().then(()=>notify('Cloud catalogue refreshed.')).catch(error=>{console.error('Cloud catalogue refresh failed:',error);notify(error.message)})}else if(a==='cloud-sign-up'){const form=pageContent.querySelector('[data-form="cloud-sign-in"]');if(form){const values=new FormData(form);const email=values.get('email')?.toString().trim(),password=values.get('password')?.toString();if(!email||!password){notify('Enter an email address and password to create your account.');return}cloudSignIn(email,password,true).catch(error=>{app.cloud.error=error.message;renderPage();console.error('Cloud account creation failed:',error);notify(error.message)})}}else if(a==='cloud-sign-out'){storeSession(null);app.cloudSongs=[];app.tracks=app.tracks.filter(t=>t.kind!=='cloud');if(app.current?.kind==='cloud'){audio.pause();app.current=null}renderPage();notify('Signed out of your cloud account.')}else if(a==='disconnect-cloud'){storeSession(null);localStorage.removeItem('vey-cloud-url');localStorage.removeItem('vey-cloud-key');app.cloud.url='';app.cloud.key='';app.cloudSongs=[];app.tracks=app.tracks.filter(t=>t.kind!=='cloud');renderPage();notify('Saved cloud project settings removed.')}else if(a==='play'){if(app.current)playTrack(app.current);else playTrack(demoTrack)}else if(a==='next'){nextTrack()}else if(a==='previous'){nextTrack(-1)}else if(a==='shuffle'){app.shuffle=!app.shuffle;if(app.shuffle)app.queue=shuffled(app.queue);syncNativePlaybackModes();syncNativeQueue();renderMini()}else if(a==='repeat'){app.repeatMode=app.repeatMode==='off'?'all':app.repeatMode==='all'?'one':'off';syncNativePlaybackModes();renderMini()}}
pageContent.addEventListener('click',e=>{
  const fav=e.target.closest('[data-favorite]');if(fav){e.stopPropagation();toggleFavorite(fav.dataset.favorite);return}
  const nav=e.target.closest('[data-page]');if(nav){setPage(nav.dataset.page);return}
  const queueAdd=e.target.closest('[data-queue]');if(queueAdd){if(!app.queue.includes(queueAdd.dataset.queue)&&app.current?.id!==queueAdd.dataset.queue)app.queue.push(queueAdd.dataset.queue);syncNativeQueue();renderQueue();savePlaybackState();notify('Added to your queue.');return}
  const download=e.target.closest('[data-download]');if(download){downloadCloudTrack(getTrack(download.dataset.download));return}
  const queueMove=e.target.closest('[data-queue-move]');if(queueMove){const index=app.queue.indexOf(queueMove.dataset.queueMove),next=index+Number(queueMove.dataset.direction);if(index>=0&&next>=0&&next<app.queue.length){[app.queue[index],app.queue[next]]=[app.queue[next],app.queue[index]];syncNativeQueue();savePlaybackState();renderPage()}return}
  const remove=e.target.closest('[data-remove-queue]');if(remove){app.queue=app.queue.filter(id=>id!==remove.dataset.removeQueue);syncNativeQueue();renderPage();savePlaybackState();return}
  const group=e.target.closest('[data-group]');if(group){app.selectedGroup={type:group.dataset.group,name:group.dataset.name};app.page='playlist-detail';renderPage();return}
  if(e.target.closest('[data-group-play]')){const tracks=app.selectedGroup?app.tracks.filter(t=>t[app.selectedGroup.type]===app.selectedGroup.name):[];app.queue=tracks.slice(1).map(t=>t.id);if(tracks[0])playTrack(tracks[0],true);return}
  const playlistPlay=e.target.closest('[data-playlist-play]');if(playlistPlay){const p=app.playlists.find(x=>x.id===playlistPlay.dataset.playlistPlay),tracks=p?.tracks.map(getTrack).filter(Boolean)||[];if(tracks.length){app.queue=tracks.map(t=>t.id);if(app.shuffle)app.queue=shuffled(app.queue);playTrack(getTrack(app.queue[0]),true)}else notify('Add songs to this playlist before playing it.');return}
  const queueTrack=e.target.closest('[data-queue-track]');if(queueTrack){const id=queueTrack.dataset.queueTrack,index=app.queue.indexOf(id),t=getTrack(id);if(t){app.queue=index<0?[]:app.queue.slice(index+1);savePlaybackState();playTrack(t,true)}return}
  const play=e.target.closest('[data-play]');if(play){const t=getTrack(play.dataset.play);if(t)playTrack(t);return}
  const track=e.target.closest('[data-track]');if(track){const t=getTrack(track.dataset.track);if(app.page.startsWith('playlist-')&&app.page!=='playlist-detail'){const p=app.playlists.find(x=>x.id===app.page.slice(9)),index=p?.tracks.indexOf(t?.id)??-1;app.queue=index<0?[]:p.tracks.slice(index+1)}if(app.page==='playlist-detail'&&app.selectedGroup){const tracks=app.tracks.filter(item=>item[app.selectedGroup.type]===app.selectedGroup.name),index=tracks.findIndex(item=>item.id===t?.id);app.queue=index<0?[]:tracks.slice(index+1).map(item=>item.id)}if(t)playTrack(t,app.page.startsWith('playlist-'));return}
  const pl=e.target.closest('[data-playlist]');if(pl){app.page=`playlist-${pl.dataset.playlist}`;renderPage();return}
  const act=e.target.closest('[data-action]');if(act)action(act)
});
document.getElementById('sidebar-playlists').addEventListener('click',e=>{const p=e.target.closest('[data-playlist]');if(p){app.page=`playlist-${p.dataset.playlist}`;renderPage()}});
document.querySelector('.primary-nav').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)setPage(b.dataset.page)});
document.querySelector('.mobile-nav').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)setPage(b.dataset.page);if(e.target.closest('#mobile-import'))document.getElementById('file-input').click()});
document.getElementById('create-playlist').addEventListener('click',createPlaylist);
document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();setPage('home')});
document.getElementById('import-button').addEventListener('click',selectMusicFolder);
document.getElementById('rail-import').addEventListener('click',selectMusicFolder);
document.getElementById('profile-settings').addEventListener('click',()=>setPage('settings'));
document.getElementById('open-settings').addEventListener('click',()=>setPage('settings'));
document.getElementById('file-input').addEventListener('change',e=>{if(e.target.files.length)importFiles([...e.target.files]);e.target.value=''});
document.getElementById('lyrics-input').addEventListener('change',e=>{const file=e.target.files[0];if(file)loadLyricsFile(file).catch(error=>{console.error('Could not read the selected .lrc file.',error);notify('This lyrics file could not be read. Choose another .lrc file.')});e.target.value=''});
document.getElementById('folder-input').addEventListener('change',e=>{if(e.target.files.length)importFiles([...e.target.files]);e.target.value=''});
document.addEventListener('change',e=>{if(e.target.id==='theme-select'){app.theme=e.target.value;document.body.dataset.theme=app.theme;localStorage.setItem('vey-theme',app.theme)}});
document.getElementById('play-button').addEventListener('click',()=>app.current?playTrack(app.current):playTrack(demoTrack));
document.getElementById('next-button').addEventListener('click',()=>nextTrack());
document.getElementById('previous-button').addEventListener('click',()=>nextTrack(-1));
document.getElementById('shuffle-button').addEventListener('click',()=>{app.shuffle=!app.shuffle;if(app.shuffle)app.queue=shuffled(app.queue);syncNativePlaybackModes();syncNativeQueue();renderMini();savePlaybackState()});
document.getElementById('queue-shuffle').addEventListener('click',()=>{app.shuffle=!app.shuffle;if(app.shuffle)app.queue=shuffled(app.queue);syncNativePlaybackModes();syncNativeQueue();renderMini();savePlaybackState();notify(app.shuffle?'Shuffle is on.':'Shuffle is off.')});
document.getElementById('repeat-button').addEventListener('click',()=>{action({dataset:{action:'repeat'}});savePlaybackState()});
document.getElementById('player-favorite').addEventListener('click',()=>toggleFavorite(app.current?.id));
document.getElementById('expand-player').addEventListener('click',openNow);
document.getElementById('mini-track').addEventListener('click',openNow);
document.getElementById('mini-track').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();openNow()}});
document.getElementById('now-playing').addEventListener('click',e=>{if(e.target.closest('#close-now'))closeNow();else if(e.target.closest('[data-favorite]'))toggleFavorite(e.target.closest('[data-favorite]').dataset.favorite);else if(e.target.closest('[data-equalizer]')){e.stopPropagation();openEqualizer()}else if(e.target.closest('[data-lyrics]')){e.stopPropagation();openLyrics()}else if(e.target.closest('[data-action]')){e.stopPropagation();action(e.target.closest('[data-action]'));savePlaybackState()}});
document.getElementById('seek-slider').addEventListener('input',e=>{const duration=currentPlaybackDuration();if(duration){if(app.current?.kind==='android'){app.native.position=duration*(+e.target.value/100);syncProgress()}else setCurrentPlaybackPosition(duration*(+e.target.value/100))}});
document.getElementById('seek-slider').addEventListener('change',e=>{if(app.current?.kind==='android'){const duration=currentPlaybackDuration();if(duration)setCurrentPlaybackPosition(duration*(+e.target.value/100))}});
document.getElementById('now-playing').addEventListener('input',e=>{if(e.target.id==='now-seek'){const duration=currentPlaybackDuration();if(duration){if(app.current?.kind==='android'){app.native.position=duration*(+e.target.value/100);syncProgress()}else setCurrentPlaybackPosition(duration*(+e.target.value/100))}}});
document.getElementById('now-playing').addEventListener('change',e=>{if(e.target.id==='now-seek'&&app.current?.kind==='android'){const duration=currentPlaybackDuration();if(duration)setCurrentPlaybackPosition(duration*(+e.target.value/100))}});
document.getElementById('volume-slider').addEventListener('input',e=>{setPlaybackVolume(+e.target.value)});
audio.volume=.8;paintRangeProgress(document.getElementById('volume-slider'),audio.volume*100);let lastPlaybackSave=0;audio.addEventListener('timeupdate',()=>{syncProgress();syncLyrics();if(Date.now()-lastPlaybackSave>5000){lastPlaybackSave=Date.now();savePlaybackState()}});audio.addEventListener('durationchange',syncProgress);audio.addEventListener('seeked',()=>syncLyrics(true));audio.addEventListener('play',()=>{renderMini();syncLyrics(true);schedulePlaybackStateSave()});audio.addEventListener('pause',()=>{renderMini();schedulePlaybackStateSave()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(app.playbackSaveTimer);savePlaybackState();clearInterval(app.native.pollTimer);app.native.pollTimer=0}else startNativePlaybackPolling()});
window.addEventListener('pagehide',()=>{clearTimeout(app.playbackSaveTimer);savePlaybackState();clearInterval(app.native.pollTimer);app.native.pollTimer=0});
audio.addEventListener('ended',()=>{if(app.repeatMode==='one'&&app.current){audio.currentTime=0;audio.play().catch(e=>{console.error('Repeat playback failed:',e);notify('Could not replay this song.')})}else{renderMini();nextTrack(1,true)}});
registerMediaSessionActions();
pageContent.addEventListener('input',e=>{if(e.target.id==='search-input'){app.search=e.target.value;app.visibleTrackLimit=60;clearTimeout(app.searchTimer);app.searchTimer=setTimeout(()=>window.refreshTuxieSearch?.(),140)}});
document.getElementById('clear-queue').addEventListener('click',()=>{app.queue=[];syncNativeQueue();renderQueue();savePlaybackState();notify('Your queue is clear.')});
document.getElementById('go-back').addEventListener('click',()=>setPage('home'));
document.getElementById('go-forward').addEventListener('click',()=>setPage('library'));
document.getElementById('dialog-body').addEventListener('submit',e=>{e.preventDefault();if(e.target.dataset.form==='create-playlist'){const name=new FormData(e.target).get('name')?.toString().trim();if(!name)return;const p={id:`playlist-${Date.now()}`,name:name.slice(0,60),tracks:[]};app.playlists.push(p);persist();closeDialog();app.page=`playlist-${p.id}`;renderPage();notify('Your playlist is ready. Add songs whenever you like.')}else if(e.target.dataset.form==='choose-playlist'){const id=new FormData(e.target).get('playlist')?.toString();closeDialog();if(id)addToPlaylist(id)}});
document.getElementById('dialog-body').addEventListener('input',e=>{const target=e.target;if(target.id==='eq-enabled')app.equalizer.enabled=target.checked;else if(target.dataset.eqBand!==undefined){const index=Number(target.dataset.eqBand);if(index<0||index>=EQ_BANDS.length)return;app.equalizer.bands[index]=Number(target.value);app.equalizer.preset='Custom'}else if(target.id==='eq-output'){app.equalizer.outputGain=Number(target.value);app.equalizer.preset='Custom'}else return;applyEqualizer();updateEqualizerControls();persistEqualizerSettings()});
document.getElementById('dialog-body').addEventListener('change',e=>{if(e.target.id==='eq-preset')setEqualizerPreset(e.target.value)});
document.getElementById('dialog-body').addEventListener('click',e=>{if(e.target.closest('#eq-reset'))setEqualizerPreset('Flat');else if(e.target.closest('#load-lyrics'))document.getElementById('lyrics-input').click();else if(e.target.closest('#fetch-lyrics'))fetchProviderLyrics()});
pageContent.addEventListener('click',e=>{if(!e.target.closest('#save-lyrics-provider'))return;const endpoint=pageContent.querySelector('#lyrics-provider-url').value.trim(),token=pageContent.querySelector('#lyrics-provider-token').value.trim();try{if(endpoint){const url=new URL(endpoint);if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')throw new Error('Use your provider’s HTTPS endpoint.');if(url.username||url.password||url.search||url.hash)throw new Error('Enter an endpoint URL without credentials, query parameters, or a fragment.');app.lyricsProviderUrl=url.href.replace(/\/$/,'');localStorage.setItem('vey-lyrics-endpoint',app.lyricsProviderUrl)}else{app.lyricsProviderUrl='';localStorage.removeItem('vey-lyrics-endpoint')}app.lyricsProviderToken=endpoint?token:'';renderPage();notify(endpoint?'Lyrics endpoint saved; its optional token is held only until this page reloads.':'Lyrics endpoint cleared.')}catch(error){console.error('Could not save the lyrics provider settings.',error);notify(error.message||'Lyrics provider settings could not be saved.')}});
pageContent.addEventListener('submit',e=>{const form=e.target.closest('form[data-form]');if(!form)return;e.preventDefault();const values=new FormData(form);if(form.dataset.form==='cloud-config'){let url,key;try{url=new URL(values.get('url').toString().trim());key=values.get('key').toString().trim();if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')throw new Error('Use your project’s HTTPS URL.');if(!key)throw new Error('Enter your project’s public anon/publishable key.');app.cloud.url=url.origin;app.cloud.key=key;localStorage.setItem('vey-cloud-url',app.cloud.url);localStorage.setItem('vey-cloud-key',key);app.cloud.error='';renderPage();notify('Project connected. Sign in to load its private catalogue.')}catch(error){notify(error.message)}}else if(form.dataset.form==='cloud-sign-in'){const email=values.get('email').toString().trim(),password=values.get('password').toString();if(password.length<8){notify('Enter your account password.');return}storeSession(null);cloudSignIn(email,password).catch(error=>{app.cloud.error=error.message;renderPage();console.error('Cloud sign-in failed:',error);notify(error.message)})}});
document.getElementById('dialog-close').addEventListener('click',closeDialog);
document.getElementById('dialog-layer').addEventListener('click',e=>{if(e.target.id==='dialog-layer')closeDialog()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!document.getElementById('dialog-layer').hidden)closeDialog();else closeNow()}if((e.code==='Space')&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();app.current?playTrack(app.current):playTrack(demoTrack)}});
configureCloudSession();
restoreEqualizerSettings();
renderPage();
if(cloudReady())fetchCloudCatalog().catch(error=>{console.error('Could not restore the signed-in cloud catalogue:',error);notify('Your saved cloud session could not be refreshed. Check Settings and sign in again.')});
restoreLocalLibrary().then(async()=>{try{await restoreLocalLyrics()}catch(error){console.error('Could not restore saved local lyrics:',error);notify('Your music library loaded, but saved lyrics could not be restored.')}restorePlaybackState();if(app.native.enabled)await restoreNativePlayback();renderMini();renderQueue()}).catch(error=>{console.error('Could not restore the saved Tuxie library:',error);notify('Your saved local library could not be restored. Choose your music folder again.');restorePlaybackState();if(app.native.enabled)restoreNativePlayback().catch(nativeError=>{console.error('Could not restore Android playback after library recovery.',nativeError);notify('Android playback state could not be restored. Rescan your music library.')} );renderMini();renderQueue()});
