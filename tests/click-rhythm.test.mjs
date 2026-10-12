import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BeatRound,createChart,DIFFICULTIES,HIT_WINDOW,LEAD_IN} from '../click-rhythm-core.js';
import {SONGS} from '../click-rhythm-songs.js';

test('song arrangements have usable pitches, distinct hooks, and a complete backing progression',()=>{
  assert.equal(Object.keys(SONGS).length,3);
  for(const song of Object.values(SONGS)){
    assert.ok(song.name && song.credit);assert.equal(song.bass.length,8);
    assert.ok(song.hook.length>=16 && song.hook.length<=64);
    assert.ok(song.hook.every(pitch=>Number.isFinite(pitch) && pitch>=0));
    assert.ok(song.bass.every(pitch=>Number.isFinite(pitch) && pitch>0));
  }
  assert.notDeepEqual(SONGS.joy.hook,SONGS.elise.hook);
});

test('charts are reproducible, fit four keys, and grow in difficulty',()=>{
  let previousCount=0;
  for(const difficulty of Object.keys(DIFFICULTIES)){
    const chart=createChart(difficulty,1234);
    assert.deepEqual(chart,createChart(difficulty,1234));
    assert.notDeepEqual(chart.notes,createChart(difficulty,4321).notes);
    assert.ok(chart.notes.length>previousCount);previousCount=chart.notes.length;
    assert.ok(chart.duration>17000 && chart.duration<26000);
    for(const note of chart.notes){assert.ok(note.lane>=0 && note.lane<4);assert.ok(note.time>=LEAD_IN && note.time+HIT_WINDOW<chart.duration)}
    assert.equal(chart.notes[0].lane,0);
  }
  assert.throws(()=>createChart('__proto__'));
});
test('timing windows score perfect, great and good hits accurately',()=>{
  for(const [offset,judgment,points] of [[0,'perfect',1000],[55,'perfect',1000],[-55,'perfect',1000],
    [56,'great',700],[100,'great',700],[101,'good',400],[160,'good',400],[-160,'good',400]]){
    const round=new BeatRound();const note=round.notes[0];
    const result=round.hit(note.lane,note.time+offset);
    assert.equal(result.judgment,judgment);assert.equal(round.score,points);assert.equal(round.hits,1);assert.equal(round.combo,1);
  }
});
test('late notes miss once; empty taps reset combos without negative scores',()=>{
  const round=new BeatRound();const [first,second]=round.notes;
  round.hit(first.lane,first.time);assert.equal(round.advance(second.time+HIT_WINDOW+1),1);
  assert.equal(round.advance(second.time+HIT_WINDOW+1),0);assert.equal(round.misses,1);assert.equal(round.combo,0);
  for(let i=0;i<20;i++)round.hit((second.lane+1)%4,second.time+HIT_WINDOW+1);
  assert.equal(round.score,0);assert.equal(round.bestCombo,1);
});
test('a judged note cannot award points twice and invalid input cannot alter a round',()=>{
  const round=new BeatRound();const note=round.notes[0];
  for(const [lane,time] of [[-1,note.time],[4,note.time],[.5,note.time],[0,NaN],[0,-1],[0,round.duration+1]])assert.equal(round.hit(lane,time),null);
  assert.equal(round.score,0);assert.equal(round.strays,0);
  round.hit(note.lane,note.time);round.hit(note.lane,note.time);
  assert.equal(round.hits,1);assert.equal(round.score,900);assert.equal(round.combo,0);
});
test('perfect play including simultaneous notes gives 100 percent; unplayed rounds give zero',()=>{
  for(const difficulty of Object.keys(DIFFICULTIES)){
    const round=new BeatRound(difficulty,8);
    for(const note of round.notes)round.hit(note.lane,note.time);
    round.advance(round.duration);
    const result=round.results();assert.equal(result.accuracy,100);assert.equal(result.grade,'S');
    assert.equal(result.bestCombo,round.notes.length);assert.equal(result.hits,result.notes);assert.equal(result.misses,0);
    const missed=new BeatRound(difficulty);missed.advance(missed.duration);
    assert.equal(missed.results().accuracy,0);assert.equal(missed.misses,missed.notes.length);
  }
});
