import {BeatRound,DIFFICULTIES,LEAD_IN} from './cat-beat-core.js';

const $=id=>document.getElementById(id);
const COLORS={White:'#eee4dd',Red:'#f2b2a5',Blue:'#bcd9ed',Yellow:'#f1dc9c',Green:'#bfdcc1'};
const KEY_NAMES=['D','F','J','K'];
const pads=[...document.querySelectorAll('[data-pad]')],lanes=[...document.querySelectorAll('.beat-lane')];
const cats=[8,9,1,4],colors=['White','Red','Blue','Yellow'];
const STORAGE='clickerlab_cat_beat_scores_v1';
let switchStyle='Clicky',sound=true,round=null,state='ready',origin=0,pausedAt=0,frameId=0;
let nextBeat=0,feedbackUntil=0,pickerLane=0,audio=null,master=null,starting=false;
let audioTransition=Promise.resolve();
const padTimers=[];
function readBests(){
  const bests={};
  try{const saved=JSON.parse(localStorage.getItem(STORAGE));
    for(const key of Object.keys(DIFFICULTIES)) if(Number.isInteger(saved?.[key]) && saved[key]>=0 && saved[key]<=1000000) bests[key]=saved[key];
  }catch{}
  return bests;
}
let bests=readBests();
function setStatus(text){$('beat-status').textContent=text;}
function updateBest(){$('beat-best').textContent=(bests[$('beat-difficulty').value] || 0).toLocaleString();}
function updateBuild(){
  const query=new URLSearchParams({from:'cat-beat',keys:cats.join(','),switch:switchStyle,lights:colors.join(',')});
  $('beat-build').href=`build.html?${query}`;
  $('beat-result-build').href=`build.html?${query}`;
}
function updateCats(){
  pads.forEach((pad,i)=>{
    pad.querySelector('img').src=`keycap-${cats[i]}.png`;
    pad.style.setProperty('--glow',COLORS[colors[i]]);lanes[i].style.setProperty('--glow',COLORS[colors[i]]);
    const choice=document.querySelector(`[data-cat-choice="${i}"]`);
    if(choice) choice.querySelector('img').src=`keycap-${cats[i]}.png`;
  });
  updateBuild();
}
async function ensureAudio(){
  if(!sound)return;
  try{
    if(!audio){
      const Audio=window.AudioContext || window.webkitAudioContext;
      if(!Audio)return;
      audio=new Audio();master=audio.createGain();master.connect(audio.destination);setVolume();
    }
    await audioTransition;
    if(audio.state==='suspended')await audio.resume();
  }catch{const failed=audio;audio=null;master=null;failed?.close().catch(()=>{});}
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
  oscillator.onended=()=>{oscillator.disconnect();envelope.disconnect();};
}
function clickSound(lane){
  if(!audio || audio.state!=='running')return;
  const at=audio.currentTime;
  if(switchStyle==='Clicky')tone(at,1500+lane*200,.045,'square',.07,550);
  else tone(at,320+lane*45,.07,'triangle',.25,100);
}
const MELODY=[440,523.25,659.25,523.25,392,523.25,587.33,523.25,440,659.25,783.99,659.25,392,587.33,523.25,392];
function music(elapsed){
  while(nextBeat<32 && LEAD_IN+nextBeat*round.beat<=elapsed+100){
    const index=nextBeat++,time=LEAD_IN+index*round.beat;
    if(!audio || !sound || time<elapsed-100)continue;
    const at=audio.currentTime+Math.max(0,(time-elapsed)/1000);
    tone(at,index%2===0?110:185,.12,'triangle',.3,index%2===0?40:80);
    tone(at,MELODY[index%16],.18,'sine',.12);
    tone(at+round.beat/2000,2200,.025,'triangle',.035);
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
  const approach=1800,hitY=$('beat-stage').clientHeight-32;
  round.notes.forEach(note=>{
    const until=note.time-elapsed;
    note.element.hidden=Boolean(note.judgment) || until>approach;
    if(!note.element.hidden)note.element.style.transform=`translateY(${hitY-until/approach*hitY-14}px)`;
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
  starting=true;$('beat-start').disabled=true;$('beat-again').disabled=true;$('beat-restart').disabled=true;
  try{
    await ensureAudio();
    const seed=window.crypto?.getRandomValues?crypto.getRandomValues(new Uint32Array(1))[0]:Math.floor(Math.random()*4294967296);
    round=new BeatRound($('beat-difficulty').value,seed);nextBeat=0;feedbackUntil=0;
    lanes.forEach(lane=>lane.replaceChildren());
    round.notes.forEach(note=>{const element=document.createElement('span');element.className='beat-note';element.textContent='♪';element.hidden=true;lanes[note.lane].appendChild(element);note.element=element;});
    $('beat-settings').disabled=true;$('beat-results').hidden=true;$('beat-start').hidden=true;
    $('beat-pause').hidden=false;$('beat-restart').hidden=false;$('beat-pause').textContent='Pause';
    $('beat-feedback').textContent='';state='playing';origin=performance.now();updateHUD();
    $('game-title').scrollIntoView({block:'start',behavior:'auto'});
    setStatus(sound && !audio?'Audio is unavailable. You can still play visually: tap as notes reach the line.':'Round started. Tap D, F, J, K or the cat pads when notes reach the line.');animate();
    if(document.hidden)pause();
  }finally{starting=false;$('beat-start').disabled=false;$('beat-again').disabled=false;$('beat-restart').disabled=false;}
}
function pause(){
  if(state!=='playing')return;
  pausedAt=performance.now()-origin;state='paused';cancelAnimationFrame(frameId);
  if(audio?.state==='running')audioTransition=audio.suspend().catch(()=>{});
  $('beat-pause').textContent='Resume';showOverlay('Take a breather','Your round is paused. Resume when you’re ready.','Ⅱ');
  $('beat-feedback').textContent='';setStatus('Paused. Your score and notes are saved until you resume.');
}
async function resume(){
  if(state!=='paused' || starting)return;
  starting=true;
  try{await ensureAudio();origin=performance.now()-pausedAt;state='playing';$('beat-pause').textContent='Pause';setStatus('Round resumed.');animate();if(document.hidden)pause();}
  finally{starting=false;}
}
function finish(){
  state='finished';cancelAnimationFrame(frameId);
  if(audio?.state==='running')audioTransition=audio.suspend().catch(()=>{});
  $('beat-settings').disabled=false;$('beat-start').hidden=false;$('beat-start').textContent='Play again';
  $('beat-pause').hidden=true;$('beat-restart').hidden=true;$('beat-feedback').textContent='';
  const result=round.results(),difficulty=round.difficulty;
  bests=readBests();const personalBest=result.score>(bests[difficulty] || 0);
  if(personalBest){bests[difficulty]=result.score;try{localStorage.setItem(STORAGE,JSON.stringify(bests));}catch{}}
  updateBest();showOverlay('That’s a wrap!',`${result.score.toLocaleString()} points · ${result.accuracy}% accuracy`,'✦');
  $('beat-result-badge').textContent=personalBest?'New personal best':'Round complete';
  $('beat-results-title').textContent=result.grade==='Keep grooving'?'Keep grooving!':`Grade ${result.grade} · Nice rhythm!`;
  $('beat-result-summary').textContent=`${result.score.toLocaleString()} points · ${result.accuracy}% accuracy · Best combo ${result.bestCombo} · ${result.hits}/${result.notes} notes hit`;
  $('beat-results').hidden=false;$('beat-share').textContent='Copy my score';
  setStatus(`Round complete. ${result.score} points, ${result.accuracy}% accuracy. Play again or build your clicker.`);
  $('beat-results-title').focus();
}
function tap(lane){
  pads[lane].classList.add('pressed');clearTimeout(padTimers[lane]);padTimers[lane]=setTimeout(()=>pads[lane].classList.remove('pressed'),110);
  if(state==='paused')return;
  if(state==='playing'){
    clickSound(lane);const result=round.hit(lane,performance.now()-origin);
    if(result){feedback({perfect:'Purrfect!',great:'Great!',good:'Good!',stray:'Follow the beat'}[result.judgment],result.judgment);updateHUD();}
  }else ensureAudio().then(()=>clickSound(lane));
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
$('beat-difficulty').addEventListener('change',updateBest);
document.querySelectorAll('[data-switch-style]').forEach(button=>button.addEventListener('click',()=>{
  switchStyle=button.dataset.switchStyle;document.querySelectorAll('[data-switch-style]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  updateBuild();ensureAudio().then(()=>clickSound(0));
}));
for(let i=0;i<4;i++){
  const container=document.createElement('div');container.className='beat-custom-key';
  const button=document.createElement('button');button.type='button';button.className='beat-cat-choice';button.dataset.catChoice=i;button.setAttribute('aria-label',`Choose keycap for key ${KEY_NAMES[i]}`);
  const img=document.createElement('img');img.alt='';const name=document.createElement('span');name.textContent=KEY_NAMES[i];button.append(img,name);
  button.addEventListener('click',()=>{pickerLane=i;$('beat-picker-title').textContent=`Choose a cat for ${KEY_NAMES[i]}`;
    document.querySelectorAll('[data-picker-cat]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.pickerCat)===cats[i])));$('beat-picker').showModal();});
  const label=document.createElement('label');label.textContent=`${KEY_NAMES[i]} light`;const select=document.createElement('select');select.setAttribute('aria-label',`Light color for key ${KEY_NAMES[i]}`);
  for(const color of Object.keys(COLORS)){const option=new Option(color,color);option.selected=colors[i]===color;select.add(option);}
  select.addEventListener('change',()=>{colors[i]=select.value;updateCats();});label.appendChild(select);container.append(button,label);$('beat-customize').appendChild(container);
}
for(let id=1;id<=11;id++){
  const button=document.createElement('button');button.type='button';button.dataset.pickerCat=id;
  const img=document.createElement('img');img.src=`keycap-${id}.png`;img.alt=`Keycap ${id}`;const label=document.createElement('span');label.textContent=`Keycap ${id}`;
  button.append(img,label);button.addEventListener('click',()=>{cats[pickerLane]=id;updateCats();$('beat-picker').close();});$('beat-picker-grid').appendChild(button);
}
$('beat-picker-close').addEventListener('click',()=>$('beat-picker').close());
$('beat-picker').addEventListener('close',()=>document.querySelector(`[data-cat-choice="${pickerLane}"]`).focus());
$('beat-picker').addEventListener('click',event=>{if(event.target===$('beat-picker')){const r=$('beat-picker').getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)$('beat-picker').close();}});
$('beat-share').addEventListener('click',async()=>{
  const result=round?.results();if(!result)return;
  const text=`I scored ${result.score.toLocaleString()} on Cat Beat (${DIFFICULTIES[round.difficulty].name})! ${result.accuracy}% accuracy, ${result.bestCombo} combo. Play: https://clickerlabstore.com/cat-beat.html`;
  try{await navigator.clipboard.writeText(text);$('beat-share').textContent='Copied!';setStatus('Score copied. Share it with a friend!');}
  catch{setStatus(text);}
});
window.addEventListener('storage',event=>{if(event.key===STORAGE){bests=readBests();updateBest();}});
updateCats();updateBest();$('beat-start').disabled=false;$('beat-start').textContent='Let’s play';
setStatus('Ready when you are. Try tapping the cat keys, then start a round.');
