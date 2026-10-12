export const DIFFICULTIES = Object.freeze({
  cozy:{name:'Cozy',bpm:90}, groove:{name:'Groove',bpm:110}, zoomies:{name:'Zoomies',bpm:128}
});
export const HIT_WINDOW = 160;
export const LEAD_IN = 2400;

export function createChart(difficulty='cozy',seed=1) {
  if(!Object.hasOwn(DIFFICULTIES,difficulty)) throw new Error('Unknown difficulty');
  const beat=60000/DIFFICULTIES[difficulty].bpm;
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const notes=[];
  for(let i=0;i<32;i++){
    const lane=i===0?0:Math.floor(random()*4),time=LEAD_IN+i*beat;
    notes.push({lane,time});
    if(difficulty==='zoomies' && i%8===6) notes.push({lane:(lane+2)%4,time});
    if((difficulty==='groove' && i%4===2) || (difficulty==='zoomies' && i%2===1)){
      notes.push({lane:(lane+1+Math.floor(random()*3))%4,time:time+beat/2});
    }
  }
  notes.sort((a,b)=>a.time-b.time || a.lane-b.lane);
  return {notes,beat,duration:LEAD_IN+32*beat+400};
}

export class BeatRound {
  constructor(difficulty='cozy',seed=1) {
    this.difficulty=difficulty;
    Object.assign(this,createChart(difficulty,seed));
    this.notes=this.notes.map(n=>({...n,judgment:null}));
    this.score=0;this.combo=0;this.bestCombo=0;this.hits=0;this.misses=0;this.strays=0;
  }
  advance(time) {
    let missed=0;
    for(const note of this.notes){
      if(!note.judgment && time>note.time+HIT_WINDOW){note.judgment='miss';this.misses++;this.combo=0;missed++;}
    }
    return missed;
  }
  hit(lane,time) {
    if(!Number.isInteger(lane) || lane<0 || lane>3 || !Number.isFinite(time) || time<LEAD_IN-HIT_WINDOW || time>this.duration) return null;
    this.advance(time);
    const note=this.notes.filter(n=>n.lane===lane && !n.judgment && Math.abs(n.time-time)<=HIT_WINDOW)
      .sort((a,b)=>Math.abs(a.time-time)-Math.abs(b.time-time))[0];
    if(!note){this.combo=0;this.strays++;this.score=Math.max(0,this.score-100);return {judgment:'stray',points:0};}
    const difference=Math.abs(note.time-time);
    const judgment=difference<=55?'perfect':difference<=100?'great':'good';
    const points={perfect:1000,great:700,good:400}[judgment];
    note.judgment=judgment;this.score+=points;this.combo++;this.hits++;this.bestCombo=Math.max(this.bestCombo,this.combo);
    return {judgment,points,note};
  }
  results() {
    const accuracy=Math.round(this.score/(this.notes.length*1000)*100);
    return {score:this.score,accuracy,bestCombo:this.bestCombo,hits:this.hits,misses:this.misses,
      notes:this.notes.length,grade:accuracy>=95?'S':accuracy>=85?'A':accuracy>=70?'B':accuracy>=50?'C':'Keep grooving'};
  }
}
