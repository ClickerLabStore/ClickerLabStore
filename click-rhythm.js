import {BeatRound,DIFFICULTIES,LEAD_IN} from './click-rhythm-core.js?v=2';
import {SONGS} from './click-rhythm-songs.js?v=3';

const $=id=>document.getElementById(id);
const KEY_NAMES=['D','F','J','K'];
const pads=[...document.querySelectorAll('[data-pad]')],lanes=[...document.querySelectorAll('.beat-lane')];
const cats=[8,9,1,4];
// Neutral edge colors sampled from each original keycap photo.
const KEYCAP_BACKGROUNDS=['#f2efea','#f8f7f3','#f1eeea','#ede7e0','#f3f0ec','#f5f3f1','#f6f4f1','#f5f3f1','#f6f3f1','#f3f0ee','#f6f4f2'];
function setKeycapPhoto(element,id){
  element.querySelector('img').src=`keycap-${id}.png`;
  element.style.setProperty('--keycap-background',KEYCAP_BACKGROUNDS[id-1]);
}
const STORAGE='clickerlab_click_rhythm_scores_v1';
let switchStyle='Clicky',sound=true,round=null,state='ready',origin=0,pausedAt=0,frameId=0;
let nextBeat=0,feedbackUntil=0,pickerLane=0,audio=null,master=null,starting=false,clickBuffer=null;
let audioTransition=Promise.resolve();
let previewTimer=0;
let transportGeneration=0;
const voices=new Set();
let recordings={},recordingContext=null,recordingDecode=null;
// Preload short clicks from the owner's videos; no third-party player.
const recordingData=Object.fromEntries(['Clicky','Creamy'].map(style=>[style,
  fetch(`${style.toLowerCase()}-click.wav?v=6`,{signal:AbortSignal.timeout(3000)})
    .then(response=>response.ok?response.arrayBuffer():null).catch(()=>null)]));
const padTimers=[];
function readBests(){
  const bests={};
  try{const saved=JSON.parse(localStorage.getItem(STORAGE));
    for(const song of Object.keys(SONGS))for(const pace of Object.keys(DIFFICULTIES)){
      const key=`${song}:${pace}`,value=saved?.[key] ?? (song==='pocket'?saved?.[pace]:undefined);
      if(Number.isInteger(value) && value>=0 && value<=1000000)bests[key]=value;
    }
  }catch{}
  return bests;
}
let bests=readBests();
function setStatus(text){$('beat-status').textContent=text;}
function updateBest(){$('beat-best').textContent=(bests[`${$('beat-song').value}:${$('beat-difficulty').value}`] || 0).toLocaleString();}
function updateBuild(){
  const query=new URLSearchParams({from:'click-rhythm',keys:cats.join(','),switch:switchStyle});
  $('beat-build').href=`build.html?${query}`;
  $('beat-result-build').href=`build.html?${query}`;
}
function updateCats(){
  pads.forEach((pad,i)=>{
    setKeycapPhoto(pad,cats[i]);
    const choice=document.querySelector(`[data-cat-choice="${i}"]`);
    if(choice) setKeycapPhoto(choice,cats[i]);
  });
  round?.notes.forEach(note=>{if(note.element)setKeycapPhoto(note.element,cats[note.lane]);});
  updateBuild();
}
async function ensureAudio(){
  if(!sound)return;
  try{
    if(!audio){
      const Audio=window.AudioContext || window.webkitAudioContext;
      if(!Audio)return;
      audio=new Audio();master=audio.createGain();
      const limiter=audio.createDynamicsCompressor();limiter.threshold.value=-6;limiter.knee.value=3;
      limiter.ratio.value=12;limiter.attack.value=.001;limiter.release.value=.08;
      master.connect(limiter);limiter.connect(audio.destination);setVolume();
    }
    await audioTransition;
    if(audio.state==='suspended')await audio.resume();
    if(recordingContext!==audio){
      recordingContext=audio;const context=audio;
      recordings={};
      recordingDecode=Promise.all(Object.entries(recordingData).map(([style,dataPromise])=>
        dataPromise.then(data=>data?context.decodeAudioData(data.slice(0)):null)
          .then(buffer=>{if(audio===context && buffer)recordings[style]=buffer;}).catch(()=>{})));
    }
    await recordingDecode;
  }catch{const failed=audio;audio=null;master=null;clickBuffer=null;failed?.close().catch(()=>{});}
}
function setVolume(){if(master)master.gain.setValueAtTime(sound?Number($('beat-volume').value)/100:0,audio.currentTime);}
function tone(at,frequency,length,type,gain,endFrequency){
  if(!audio || audio.state!=='running' || !sound)return;
  const oscillator=audio.createOscillator(),envelope=audio.createGain();
  oscillator.type=type;oscillator.frequency.setValueAtTime(frequency,at);
  if(endFrequency)oscillator.frequency.exponentialRampToValueAtTime(endFrequency,at+length);
  envelope.gain.setValueAtTime(.001,at);envelope.gain.exponentialRampToValueAtTime(gain,at+.004);
  envelope.gain.exponentialRampToValueAtTime(.001,at+length);
  oscillator.connect(envelope);envelope.connect(master);oscillator.start(at);oscillator.stop(at+length+.01);
  voices.add(oscillator);oscillator.onended=()=>{voices.delete(oscillator);oscillator.disconnect();envelope.disconnect();};
}
function stopVoices(){for(const voice of voices){try{voice.stop();}catch{}}voices.clear();}
function clickSound(lane){
  if(!audio || audio.state!=='running' || !sound)return;
  const at=audio.currentTime;
  if(recordings[switchStyle]){
    const source=audio.createBufferSource(),gain=audio.createGain();
    source.buffer=recordings[switchStyle];gain.gain.value=.7;
    source.connect(gain);gain.connect(master);voices.add(source);source.start(at);
    source.onended=()=>{voices.delete(source);source.disconnect();gain.disconnect();};
    return;
  }
  // Short filtered noise transients resemble a switch click, rather than a beep.
  if(!clickBuffer){
    clickBuffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*.09),audio.sampleRate);
    const samples=clickBuffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
  }
  const clicky=switchStyle==='Clicky';
  function transient(offset,length,frequency,volume){
    const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain(),start=at+offset;
    source.buffer=clickBuffer;filter.type=clicky?'highpass':'lowpass';filter.frequency.value=frequency;filter.Q.value=.55;
    gain.gain.setValueAtTime(.001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.001);
    gain.gain.exponentialRampToValueAtTime(.001,start+length);
    source.connect(filter);filter.connect(gain);gain.connect(master);source.start(start);source.stop(start+length);
    voices.add(source);source.onended=()=>{voices.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};
  }
  if(clicky){transient(0,.018,2400,.24);transient(.028,.023,1500,.14);tone(at,450,.035,'triangle',.12,130);}
  else {transient(0,.045,420,.55);transient(.032,.04,300,.2);tone(at,125,.065,'sine',.36,55);tone(at,245,.03,'triangle',.1,90);}
}
async function previewClick(lane=0){
  clearTimeout(previewTimer);await ensureAudio();clickSound(lane);
  if(state!=='playing')previewTimer=setTimeout(()=>{if(state!=='playing' && !starting){stopVoices();if(audio?.state==='running')audioTransition=audio.suspend().catch(()=>{});}},220);
}
function music(elapsed){
  while(nextBeat<64 && LEAD_IN+nextBeat*round.beat/2<=elapsed+100){
    const index=nextBeat++,time=LEAD_IN+index*round.beat/2;
    if(!audio || !sound || time<elapsed-100)continue;
    const at=audio.currentTime+Math.max(0,(time-elapsed)/1000);
    const song=SONGS[round.song],beat=Math.floor(index/2),bar=Math.floor(beat/4),bass=song.bass[bar];
    if(index%2===0){
      tone(at,beat%2===0?115:220,.1,'triangle',.32,beat%2===0?42:90);
      tone(at,bass,.16,'triangle',.24);
    }else if(beat%4===3)tone(at,bass*2,.1,'triangle',.13);
    tone(at,3500,.022,'triangle',.025);
    const pitch=song.hook[index%song.hook.length];
    if(pitch){tone(at,pitch,.12,'triangle',.11);tone(at,pitch*2,.08,'sine',.035);}
  }
}
function showOverlay(title,copy,icon='♫'){
  $('beat-overlay').hidden=false;$('beat-overlay-title').textContent=title;$('beat-overlay-copy').textContent=copy;
  document.querySelector('.beat-overlay-icon').textContent=icon;
}
function feedback(text,judgment=''){
  $('beat-feedback').textContent=text;$('beat-feedback').dataset.judgment=judgment;feedbackUntil=performance.now()+550;
}
function updateHUD(){
  $('beat-score').textContent=round.score.toLocaleString();$('beat-combo').textContent=round.combo;
}
function draw(elapsed){
  const stage=$('beat-stage').getBoundingClientRect(),target=pads[0].querySelector('img').getBoundingClientRect();
  const approach=1800,hitY=target.top-stage.top+target.height/2;
  round.notes.forEach(note=>{
    const until=note.time-elapsed;
    note.element.hidden=Boolean(note.judgment) || until>approach;
    if(!note.element.hidden){const height=note.element.offsetHeight;note.element.style.transform=`translateY(${hitY-until/approach*(hitY+height)-height/2}px)`;}
  });
  const progress=Math.min(100,Math.max(0,(elapsed-LEAD_IN)/(round.duration-LEAD_IN)*100));
  $('beat-progress-fill').style.width=`${progress}%`;
  document.querySelector('.beat-progress').setAttribute('aria-valuenow',String(Math.round(progress)));
}
function animate(){
  if(state!=='playing')return;
  const elapsed=performance.now()-origin;
  if(elapsed<LEAD_IN-600)showOverlay(String(Math.ceil((LEAD_IN-elapsed)/800)),'Get ready. First note: D','♪');
  else $('beat-overlay').hidden=true;
  if(round.advance(elapsed)){feedback('Miss');updateHUD();}
  if(performance.now()>feedbackUntil)$('beat-feedback').textContent='';
  draw(elapsed);music(elapsed);
  if(elapsed>=round.duration){finish();return;}
  frameId=requestAnimationFrame(animate);
}
async function start(){
  if(starting || state==='playing')return;
  const generation=++transportGeneration;
  starting=true;$('beat-start').disabled=true;$('beat-again').disabled=true;$('beat-restart').disabled=true;
  try{
    await ensureAudio();
    if(generation!==transportGeneration)return;
    clearTimeout(previewTimer);stopVoices();
    const seed=window.crypto?.getRandomValues?crypto.getRandomValues(new Uint32Array(1))[0]:Math.floor(Math.random()*4294967296);
    round=new BeatRound($('beat-difficulty').value,seed);round.song=$('beat-song').value;nextBeat=0;feedbackUntil=0;
    lanes.forEach(lane=>lane.replaceChildren());
    round.notes.forEach(note=>{const element=document.createElement('span');element.className='beat-note';const image=document.createElement('img');image.alt='';element.appendChild(image);setKeycapPhoto(element,cats[note.lane]);element.hidden=true;lanes[note.lane].appendChild(element);note.element=element;});
    $('beat-results').hidden=true;$('beat-start').hidden=true;
    $('beat-pause').hidden=false;$('beat-restart').hidden=false;$('beat-pause').textContent='Pause';
    $('beat-feedback').textContent='';state='playing';origin=performance.now();updateHUD();
    $('game-title').scrollIntoView({block:'start',behavior:'auto'});
    setStatus(sound && !audio?'Audio is unavailable. You can still play visually: catch the falling keycaps.':'Catch each falling keycap on its matching key. Use D, F, J, K or touch.');animate();
    if(document.hidden)pause();
  }finally{starting=false;$('beat-start').disabled=false;$('beat-again').disabled=false;$('beat-restart').disabled=false;}
}
function pause(){
  if(state!=='playing')return;
  pausedAt=performance.now()-origin;state='paused';cancelAnimationFrame(frameId);
  clearTimeout(previewTimer);stopVoices();
  if(audio?.state==='running')audioTransition=audio.suspend().catch(()=>{});
  $('beat-pause').textContent='Resume';showOverlay('Take a breather','Your round is paused. Resume when you’re ready.','Ⅱ');
  $('beat-feedback').textContent='';setStatus('Paused. Your score and keycaps are saved until you resume.');
}
async function resume(){
  if(state!=='paused' || starting)return;
  const generation=transportGeneration;
  starting=true;
  try{await ensureAudio();if(generation!==transportGeneration)return;clearTimeout(previewTimer);stopVoices();nextBeat=Math.max(0,Math.ceil((pausedAt-LEAD_IN)/(round.beat/2)));origin=performance.now()-pausedAt;state='playing';$('beat-pause').textContent='Pause';setStatus('Round resumed.');animate();if(document.hidden)pause();}
  finally{starting=false;}
}
function finish(){
  state='finished';cancelAnimationFrame(frameId);
  if(audio?.state==='running')audioTransition=audio.suspend().catch(()=>{});
  $('beat-settings').disabled=false;$('beat-start').hidden=false;$('beat-start').textContent='Play again';
  $('beat-pause').hidden=true;$('beat-restart').hidden=true;$('beat-feedback').textContent='';
  const result=round.results(),key=`${round.song}:${round.difficulty}`;
  bests=readBests();const personalBest=result.score>(bests[key] || 0);
  if(personalBest){bests[key]=result.score;try{localStorage.setItem(STORAGE,JSON.stringify(bests));}catch{}}
  updateBest();showOverlay('That’s a wrap!',`${result.score.toLocaleString()} points · ${result.accuracy}% accuracy`,'✦');
  $('beat-result-badge').textContent=personalBest?'New personal best':'Round complete';
  $('beat-results-title').textContent=result.grade==='Keep grooving'?'Keep grooving!':`Grade ${result.grade} · Nice rhythm!`;
  $('beat-result-summary').textContent=`${result.score.toLocaleString()} points · ${result.accuracy}% accuracy · Best combo ${result.bestCombo} · ${result.hits}/${result.notes} keycaps caught`;
  $('beat-results').hidden=false;$('beat-share').textContent='Copy my score';
  setStatus(`Round complete. ${result.score} points, ${result.accuracy}% accuracy. Play again or build your clicker.`);
  $('beat-results-title').focus();
}
function tap(lane){
  pads[lane].classList.add('pressed');clearTimeout(padTimers[lane]);padTimers[lane]=setTimeout(()=>pads[lane].classList.remove('pressed'),110);
  if(state==='paused')return;
  if(state==='playing'){
    clickSound(lane);const result=round.hit(lane,performance.now()-origin);
    if(result){feedback({perfect:'Perfect!',great:'Great!',good:'Good!',stray:'Wait for the keycap'}[result.judgment],result.judgment);updateHUD();}
  }else previewClick(lane);
}
pads.forEach((pad,i)=>{
  pad.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse' && event.button!==0)return;event.preventDefault();tap(i);});
  pad.addEventListener('click',event=>{if(event.detail===0)tap(i);});
});
document.addEventListener('keydown',event=>{
  if(event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input,select,textarea,[contenteditable="true"]') || $('beat-picker').open)return;
  if(event.key==='Escape'){if(state==='playing'){event.preventDefault();pause();}return;}
  const lane=KEY_NAMES.indexOf(event.key.toUpperCase());
  if(lane>=0){event.preventDefault();if(!event.repeat)tap(lane);}
});
$('beat-start').addEventListener('click',start);$('beat-again').addEventListener('click',start);
$('beat-restart').addEventListener('click',()=>{pause();state='ready';start();});
$('beat-pause').addEventListener('click',()=>state==='paused'?resume():pause());
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
window.addEventListener('blur',pause);
['cart-button','search-button'].forEach(id=>$(id)?.addEventListener('click',pause));
$('beat-sound').addEventListener('click',async()=>{
  sound=!sound;$('beat-sound').textContent=sound?'Sound on':'Sound off';$('beat-sound').setAttribute('aria-pressed',String(sound));
  if(sound && state!=='paused')await ensureAudio();setVolume();
});
$('beat-volume').addEventListener('input',setVolume);
function resetForSettings(){
  transportGeneration++;pause();clearTimeout(previewTimer);stopVoices();
  if(audio?.state==='running')audioTransition=audio.suspend().catch(()=>{});
  state='ready';round=null;cancelAnimationFrame(frameId);$('beat-feedback').textContent='';
  $('beat-settings').disabled=false;lanes.forEach(lane=>lane.replaceChildren());
  $('beat-score').textContent='0';$('beat-combo').textContent='0';$('beat-progress-fill').style.width='0';
  document.querySelector('.beat-progress').setAttribute('aria-valuenow','0');
  $('beat-results').hidden=true;$('beat-start').hidden=false;$('beat-start').textContent='Let’s play';
  $('beat-pause').hidden=true;$('beat-restart').hidden=true;
  $('game-title').textContent=SONGS[$('beat-song').value].name;$('beat-song-credit').textContent=SONGS[$('beat-song').value].credit;
  updateBest();showOverlay('Ready to catch?', 'Click when a falling keycap overlaps its matching key.');
  setStatus('Song or pace changed. Start a fresh round when you’re ready.');
}
$('beat-difficulty').addEventListener('change',resetForSettings);
$('beat-song').addEventListener('change',resetForSettings);
document.querySelectorAll('[data-switch-style]').forEach(button=>button.addEventListener('click',()=>{
  switchStyle=button.dataset.switchStyle;document.querySelectorAll('[data-switch-style]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  updateBuild();previewClick();setStatus(`${switchStyle} selected.${!sound?' Sound is off; turn it on to hear a sample.':Number($('beat-volume').value)===0?' Volume is zero; raise it to hear a sample.':' Tap a key to try it.'}`);
}));
for(let i=0;i<4;i++){
  const container=document.createElement('div');container.className='beat-custom-key';
  const button=document.createElement('button');button.type='button';button.className='beat-cat-choice';button.dataset.catChoice=i;button.setAttribute('aria-label',`Choose keycap for key ${KEY_NAMES[i]}`);
  const img=document.createElement('img');img.alt='';const name=document.createElement('span');name.textContent=KEY_NAMES[i];button.append(img,name);
  button.addEventListener('click',()=>{pause();pickerLane=i;$('beat-picker-title').textContent=`Choose a keycap for ${KEY_NAMES[i]}`;
    document.querySelectorAll('[data-picker-cat]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.pickerCat)===cats[i])));$('beat-picker').showModal();});
  container.appendChild(button);$('beat-customize').appendChild(container);
}
for(let id=1;id<=11;id++){
  const button=document.createElement('button');button.type='button';button.dataset.pickerCat=id;
  const img=document.createElement('img');img.src=`keycap-${id}.png`;img.alt=`Keycap ${id}`;const label=document.createElement('span');label.textContent=`Keycap ${id}`;
  button.append(img,label);setKeycapPhoto(button,id);button.addEventListener('click',()=>{cats[pickerLane]=id;updateCats();$('beat-picker').close();});$('beat-picker-grid').appendChild(button);
}
$('beat-picker-close').addEventListener('click',()=>$('beat-picker').close());
$('beat-picker').addEventListener('close',()=>document.querySelector(`[data-cat-choice="${pickerLane}"]`).focus());
$('beat-picker').addEventListener('click',event=>{if(event.target===$('beat-picker')){const r=$('beat-picker').getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)$('beat-picker').close();}});
$('beat-share').addEventListener('click',async()=>{
  const result=round?.results();if(!result)return;
  const text=`I scored ${result.score.toLocaleString()} on Click Rhythm (${SONGS[round.song].name}, ${DIFFICULTIES[round.difficulty].name})! ${result.accuracy}% accuracy, ${result.bestCombo} combo. Play: https://clickerlabstore.com/click-rhythm.html`;
  try{await navigator.clipboard.writeText(text);$('beat-share').textContent='Copied!';setStatus('Score copied. Share it with a friend!');}
  catch{setStatus(text);}
});
window.addEventListener('storage',event=>{if(event.key===STORAGE){bests=readBests();updateBest();}});
updateCats();updateBest();$('beat-start').disabled=false;$('beat-start').textContent='Let’s play';
setStatus('Ready when you are. Try tapping the cat keys, then start a round.');
