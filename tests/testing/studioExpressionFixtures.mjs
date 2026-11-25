import {studio} from './studioModules.mjs';
import {scoreModel} from './sheetEditorModules.mjs';
export const score=(steps,staffs)=>scoreModel.importScore(scoreModel.initialScore(),{bpm:120,key:'C',staffs:staffs??[{id:'main',clef:'treble',steps}]},'expressive');
const mainSteps=[{midi:60,duration:'quarter',tieToNext:[60]},{midi:60,duration:'quarter'},{midi:64,duration:'half',staccato:true}];
export const finalSteps=[{midi:60,pitches:[60,64,67],duration:'half',arpeggio:'down',tieToNext:[60,64]},{midi:60,pitches:[60,64,69],duration:'half'}];
export function expressiveDraft(){const draft=studio.emptyStudioDraft();draft.title='Expressive tune';draft.document.main=studio.studioScoreDocument(score(mainSteps),null);draft.document.final=studio.studioScoreDocument(score(finalSteps),null);return draft;}

