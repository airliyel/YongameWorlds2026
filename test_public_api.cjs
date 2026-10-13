const fs=require('fs'), vm=require('vm'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/Code.gs','utf8');
class Range {constructor(s,r,c,rs,cs){Object.assign(this,{s,r,c,rs,cs});}
  getValues(){return Array.from({length:this.rs},(_,i)=>Array.from({length:this.cs},(_,j)=>this.s.cell(this.r+i,this.c+j)));}
  getDisplayValues(){return this.getValues().map(row=>row.map(x=>x instanceof Date?x.toISOString() : String(x??'')));}
  getDisplayValue(){return this.getDisplayValues()[0][0];}
  getValue(){return this.getValues()[0][0];}
  setValues(rows){assert.equal(rows.length,this.rs);for(let i=0;i<this.rs;i++){assert.equal(rows[i].length,this.cs);for(let j=0;j<this.cs;j++)this.s.put(this.r+i,this.c+j,rows[i][j]);}return this;}
  setValue(v){return this.setValues([[v]]);} setNumberFormat(){return this;}setDataValidation(){return this;}setNote(){return this;}setBackground(){return this;}setFontWeight(){return this;}setFontColor(){return this;}setVerticalAlignment(){return this;}
  clearContent(){for(let i=0;i<this.rs;i++)for(let j=0;j<this.cs;j++)this.s.put(this.r+i,this.c+j,'');return this;}
  getSheet(){return this.s;} getRow(){return this.r;} getLastRow(){return this.r+this.rs-1;} getColumn(){return this.c;} getLastColumn(){return this.c+this.cs-1;}
}
function a1ToIndex(a){let n=0;for(const c of a)n=n*26+c.charCodeAt()-64;return n;}
class Sheet {constructor(name){this.name=name;this.rows=[];}getName(){return this.name;}cell(r,c){return this.rows[r-1]?.[c-1]??'';}
  put(r,c,v){while(this.rows.length<r)this.rows.push([]);while(this.rows[r-1].length<c)this.rows[r-1].push('');this.rows[r-1][c-1]=v;}
  getRange(...args){if(args.length===1){const m=/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(args[0]);if(!m)throw new Error('unsupported range '+args[0]);const [_,a,r,b,s]=m;return new Range(this,+r,a1ToIndex(a),+s-+r+1,a1ToIndex(b)-a1ToIndex(a)+1);}
    return new Range(this,args[0],args[1],args[2]??1,args[3]??1);
  }
  getDataRange(){return new Range(this,1,1,Math.max(1,this.getLastRow()),Math.max(1,...this.rows.map(x=>x.length)));}
  getLastRow(){let i=this.rows.length;while(i>0 && !this.rows[i-1].some(x=>x!=='' && x!==null && x!==undefined))i--;return i;}
  setRowHeight(){}setColumnWidth(){}setFrozenRows(){}appendRow(row){this.rows.push(row);}}
class SS{constructor(){this.m=new Map()}getSheetByName(n){return this.m.get(n)||null;}insertSheet(n){const s=new Sheet(n);this.m.set(n,s);return s;}getId(){return 'TEST_SPREADSHEET';}}
const ss=new SS();let props=new Map([['PICKEM_SPREADSHEET_ID','TEST_SPREADSHEET'],['WORLDS_PICKEM_BOT_SECRET','TEST_SECRET']]);const triggers=[];
const context={console,Map,Set,Date,Number,String,Array,Boolean,JSON,Math,Error,SpreadsheetApp:{getActiveSpreadsheet(){return ss;},openById(id){assert.equal(id,'TEST_SPREADSHEET');return ss;},flush(){},newDataValidation(){return{requireValueInList(){return this;},setAllowInvalid(){return this;},build(){return {}}}}},PropertiesService:{getScriptProperties(){return{getProperty(n){return props.get(n)},setProperty(n,v){props.set(n,v)}}}},LockService:{getScriptLock(){return{waitLock(){},releaseLock(){}}}},ScriptApp:{getProjectTriggers(){return triggers.slice()},deleteTrigger(t){triggers.splice(triggers.indexOf(t),1)},newTrigger(fn){return{forSpreadsheet(){return this;},onEdit(){return this;},create(){const t={getHandlerFunction(){return fn}};triggers.push(t);return t;}}}},ContentService:{createTextOutput(text){return{setMimeType(){return {text}}}},MimeType:{JSON:'JSON'}}};
vm.createContext(context);vm.runInContext(src,context);
const preds=ss.insertSheet('Predictions'), codes=ss.insertSheet('Codes'),settings=ss.insertSheet('Settings');
preds.put(1,1,'server_submitted_at');
const a=['','YG26-1111','Player A','KC','GEN|HLE|T1|DK|AL|BLG|TES|IG','GEN','BLG','GEN','T1','BLG','HLE','yes',' Faker ','3-1','yes','no','yes','yes','yes','no','yes','GEN',''];
const b=['','YG26-2222','Player B','C9','GEN|T1|C9|DK|BLG|TES|FUR|LOS','HLE','BLG','T1','GEN','GEN','DK','no','Chovy','3-0','no','yes','no','no','no','yes','no','T1',''];
assert.equal(a.length,23);assert.equal(b.length,23);
preds.getRange(2,1,2,23).setValues([a,b]);
const setup=context.setupScoringSheets();assert.equal(setup.participantCount,2);assert.equal(setup.confirmedPoints,0);assert.equal(triggers.length,1);
const res=ss.getSheetByName('Results');
const all=[['playinTeam','KC'],['swissTeams','GEN|HLE|T1|DK|AL|BLG|TES|IG'],['threeZeroTeams','GEN|BLG'],['champion','GEN'],['runnerUp','T1'],['semifinalLosers','BLG|HLE'],['pentakill','yes'],['finalMvp','FAKER'],['finalScore','3-1'],['fakerAhri','yes'],['uziKaisa','no'],['capsTristana','yes'],['backdoor','yes'],['baronSteal','yes'],['elderSteal','no'],['lckChampion','yes'],['bestLck','GEN']];
assert.equal(all.length,17);
all.forEach(([key,answer],i)=>{assert.equal(res.cell(i+2,1),key);res.put(i+2,3,answer);context.handleScoringEdit({range:res.getRange(i+2,3,1,1)});});
const scores=ss.getSheetByName('Scores'),details=ss.getSheetByName('ScoreDetails');
assert.equal(context.recalculateScores().confirmedPoints,80);
assert.equal(scores.cell(2,3),'Player A');assert.equal(scores.cell(2,4),80);assert.equal(scores.cell(2,5),80);
assert.equal(details.cell(2,3),80);assert.equal(details.cell(3,3),scores.cell(3,4));assert.ok(scores.cell(3,4)<80);
assert.equal(scores.cell(2,1),1);assert.equal(scores.cell(3,1),2);
// Invalid multi-answer should not erroneously award points. Change answer to bad string => pending.
res.put(3,3,'GEN|HLE');context.handleScoringEdit({range:res.getRange(3,3,1,1)});
assert.equal(res.cell(3,4),'PENDING');assert.equal(scores.cell(2,5),64);assert.equal(scores.cell(2,4),64);
assert.match(res.cell(3,7),/오류/);
// Remove one answer -> pending, then restore; totals fully recompute, no double-count.
res.put(3,3,'GEN|HLE|T1|DK|AL|BLG|TES|IG');context.handleScoringEdit({range:res.getRange(3,3,1,1)});
assert.equal(scores.cell(2,4),80);
context.setupScoringSheets();assert.equal(triggers.length,1);assert.equal(res.cell(3,3),'GEN|HLE|T1|DK|AL|BLG|TES|IG');assert.equal(scores.cell(2,4),80);
console.log('ALL TESTS PASSED: 17 keys, total=80, rank, pending, validation, preserved results, no duplicate triggers');

// Public API never reveals anything before submitting closed & both flags enabled.
context.setupPublicResultsSettings();
let privateResult=JSON.parse(context.doGet({parameter:{action:'public_results'}}).text);
assert.equal(privateResult.ok,false);assert.equal(privateResult.code,'NOT_PUBLIC');
assert.ok(!('players' in privateResult));
context.setSubmissionOpen(false);
privateResult=JSON.parse(context.doGet({parameter:{action:'public_results'}}).text);
assert.equal(privateResult.code,'NOT_PUBLIC');
context.closeSubmissionsAndPublishResults();
const publicResult=JSON.parse(context.doGet({parameter:{action:'public_results'}}).text);
assert.equal(publicResult.ok,true);
assert.equal(publicResult.players.length,2);
assert.equal(publicResult.questions.length,17);
assert.equal(publicResult.confirmedPoints,80);
assert.equal(publicResult.confirmedQuestions,17);
assert.equal(publicResult.players.find(p=>p.nickname==='Player A').score,80);
const playerA=publicResult.players.find(p=>p.nickname==='Player A');
assert.equal(playerA.predictions.playinTeam,'KC');
assert.deepEqual(playerA.predictions.swissTeams,['GEN','HLE','T1','DK','AL','BLG','TES','IG']);
assert.equal(playerA.points.champion,15);
assert.equal(playerA.points.finalScore,2);
assert.equal(publicResult.questions.find(q=>q.key==='threeZeroTeams').answer.join('|'),'GEN|BLG');
assert.ok(!JSON.stringify(publicResult).includes('YG26-'));
assert.ok(!JSON.stringify(publicResult).includes('TEST_SECRET'));
assert.ok(!JSON.stringify(publicResult).includes('discord'));
assert.ok(!JSON.stringify(publicResult).includes('TEST_SPREADSHEET'));
context.hidePublishedResults();
privateResult=JSON.parse(context.doGet({parameter:{action:'public_results'}}).text);
assert.equal(privateResult.code,'NOT_PUBLIC');
assert.ok(!('players' in privateResult));
context.closeSubmissionsAndPublishResults();
// editing confirmed result changes both Scores and API results.
res.put(5,3,'T1');context.handleScoringEdit({range:res.getRange(5,3,1,1)});
const afterEdit=JSON.parse(context.doGet({parameter:{action:'public_results'}}).text);
assert.equal(afterEdit.ok,true);
assert.equal(afterEdit.questions.find(q=>q.key==='champion').answer,'T1');
assert.equal(afterEdit.players.find(p=>p.nickname==='Player A').points.champion,0);
assert.equal(afterEdit.players.find(p=>p.nickname==='Player B').points.champion,15);
// fresh submission without recalculation is rejected as stale.
preds.getRange(4,1,1,23).setValues([[...a.slice(0,1),'YG26-3333','Player C',...a.slice(3)]]);
const stale=JSON.parse(context.doGet({parameter:{action:'public_results'}}).text);
assert.equal(stale.code,'SCORES_STALE');
console.log('PUBLIC API TESTS PASSED: private gates, released data, 17 questions, 80 points, no secrets, edited score, stale guard');
