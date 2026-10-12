const pitches={C4:261.63,E4:329.63,Fs4:369.99,Gs4:415.3,A4:440,B4:493.88,C5:523.25,D5:587.33,Ds5:622.25,E5:659.25,F5:698.46,G5:783.99,A5:880};
const melody=names=>names.map(name=>name?pitches[name]:0);
const quarters=names=>melody(names.flatMap(name=>[name,null]));
// These are new synthesized arrangements of public-domain compositions, not recordings.
export const SONGS=Object.freeze({
  pocket:{name:'Pocket Groove',credit:'Original ClickerLab track',hook:melody(['E5',null,'E5','G5','A5',null,'G5','E5','C5',null,'D5','E5',null,'D5','C5',null]),bass:[110,110,87.31,87.31,130.81,130.81,98,98]},
  joy:{name:'Ode to Joy',credit:'Beethoven · new game arrangement',hook:quarters(['E5','E5','F5','G5','G5','F5','E5','D5','C5','C5','D5','E5','E5','D5','D5',null,'E5','E5','F5','G5','G5','F5','E5','D5','C5','C5','D5','E5','D5','C5','C5',null]),bass:[130.81,98,130.81,98,130.81,98,98,130.81]},
  elise:{name:'Für Elise',credit:'Beethoven · new game arrangement',hook:melody(['E5','Ds5','E5','Ds5','E5','B4','D5','C5','A4',null,'C4','E4','A4','B4',null,'E4','Gs4','B4','C5',null,'E4','E5','Ds5','E5','Ds5','E5','B4','D5','C5','A4',null,null]),bass:[110,110,82.41,82.41,110,110,82.41,110]}
});
