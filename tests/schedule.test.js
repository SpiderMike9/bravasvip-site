/* Schedule logic tests: node --test tests/schedule.test.js */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const S=require('../assets/bravas-schedule.js');
const live=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/flyers/flyers.json'),'utf8'));
const feed=extra=>Object.assign({},live,{flyers:extra||[]});
/* Instant for an Eastern wall-clock time; offsetHours is 5 in winter (EST), 4 in summer (EDT). */
const et=(y,mo,d,h,mi,offsetHours=5)=>Date.UTC(y,mo-1,d,h+offsetHours,mi||0);

test('all six regular days resolve to the weekly lineup and flyer', ()=>{
 const s=S.compile(feed());
 const want={'2026-11-23':['Members Monday','members-monday'],'2026-11-25':['Spoken Word Wednesday','spoken-word-wednesday'],'2026-11-26':['Throwback Thursday','throwback-thursday'],'2026-11-27':['Feel Good Friday','feel-good-friday'],'2026-11-28':['V.I.P. Saturday','vip-saturday'],'2026-11-29':['Sunday Funday Brunch','sunday-funday-brunch']};
 for(const [date,[title,file]] of Object.entries(want)){
  const d=S.resolveDay(s,date);
  assert.equal(d.open,true,date);assert.equal(d.title,title);assert.equal(d.source,'weekly');
  assert.equal(d.src,'/assets/flyers/weekly/'+file+'.webp');assert.equal(d.publishAt,'09:00');
  assert.equal(d.reserve,'https://tally.so/r/RWdAv4?date='+date);
 }
});

test('normal Tuesday is closed with no featured promotion', ()=>{
 const s=S.compile(feed());
 const snap=S.snapshot(s,et(2026,11,24,20,0),7);
 assert.equal(snap.today.weekday,'tuesday');assert.equal(snap.today.open,false);assert.equal(snap.today.title,'Closed');
 assert.equal(snap.featured,null);
});

test('publish time: hidden at 8:59 AM ET, featured at 9:00 AM ET', ()=>{
 const s=S.compile(feed());
 const before=S.snapshot(s,et(2026,11,23,8,59,5)+59000,7);
 assert.equal(before.today.title,'Members Monday');assert.equal(before.published,false);assert.equal(before.featured,null);
 const at=S.snapshot(s,et(2026,11,23,9,0),7);
 assert.equal(at.published,true);assert.equal(at.featured.title,'Members Monday');
});

test('midnight rollover: Monday flyer stops being today at 12:00 AM ET Tuesday', ()=>{
 const s=S.compile(feed());
 const late=S.snapshot(s,et(2026,11,23,23,59),7);assert.equal(late.featured.title,'Members Monday');
 const midnight=S.snapshot(s,et(2026,11,24,0,0),7);assert.equal(midnight.today.date,'2026-11-24');assert.equal(midnight.featured,null);
 const satLate=S.snapshot(s,et(2026,11,29,0,30),7);/* Saturday runs to 1 AM, but the date has rolled over */
 assert.equal(satLate.today.title,'Sunday Funday Brunch');assert.equal(satLate.featured,null);
});

test('special event replaces the regular day everywhere; no recurring flyer while waiting', ()=>{
 const s=S.compile(feed([{date:'2026-11-27',title:'Black Friday Soul Night',src:'/assets/flyers/weekly/vip-saturday.webp',publishAt:'12:00',time:'8 PM–1 AM',lead:'One night only.',reserve:'https://tally.so/r/RWdAv4?date=2026-11-27&event=soul'}]));
 const early=S.snapshot(s,et(2026,11,27,10,0),7);
 assert.equal(early.today.title,'Black Friday Soul Night');assert.equal(early.today.source,'special');
 assert.equal(early.featured,null,'recurring Feel Good Friday must not flash before the special publishes');
 const at=S.snapshot(s,et(2026,11,27,12,0),7);
 assert.equal(at.featured.title,'Black Friday Soul Night');assert.equal(at.featured.time,'8 PM–1 AM');
 assert.equal(at.featured.reserve,'https://tally.so/r/RWdAv4?date=2026-11-27&event=soul');
 /* earlier in the week, the calendar lists the special as upcoming on that date */
 const mon=S.snapshot(s,et(2026,11,23,12,0),14);
 assert.equal(mon.days.find(d=>d.date==='2026-11-27').title,'Black Friday Soul Night');
 /* following week returns to normal */
 assert.equal(S.resolveDay(s,'2026-12-04').title,'Feel Good Friday');
});

test('one-day closure suppresses the regular event and flyer; next week returns', ()=>{
 const s=S.compile(feed([{date:'2026-11-26',closed:true,title:'Closed for Thanksgiving'}]));
 const snap=S.snapshot(s,et(2026,11,26,15,0),7);
 assert.equal(snap.today.open,false);assert.equal(snap.today.title,'Closed for Thanksgiving');assert.equal(snap.featured,null);
 assert.equal(S.resolveDay(s,'2026-12-03').title,'Throwback Thursday');
 assert.equal(S.resolveDay(s,'2026-11-27').title,'Feel Good Friday');
});

test('Tuesday special requires "open": true', ()=>{
 const without=feed([{date:'2026-11-24',title:'Tuesday Takeover',src:'/assets/flyers/weekly/vip-saturday.webp'}]);
 const v=S.validate(without);assert.match(v.errors.join('\n'),/2026-11-24 is a Tuesday.*"open": true/);
 assert.equal(S.resolveDay(S.compile(without),'2026-11-24').open,false,'stays closed without the flag');
 const s=S.compile(feed([{date:'2026-11-24',open:true,title:'Tuesday Takeover',src:'/assets/flyers/weekly/vip-saturday.webp'}]));
 const snap=S.snapshot(s,et(2026,11,24,9,0),7);
 assert.equal(snap.featured.title,'Tuesday Takeover');
 assert.equal(S.resolveDay(s,'2026-12-01').open,false,'next Tuesday is closed again');
});

test('per-weekday and per-event publish times', ()=>{
 const data=feed([{date:'2026-11-28',title:'Late Drop',publishAt:'18:30',src:'/assets/flyers/weekly/vip-saturday.webp'}]);
 data.settings={defaultPublishTime:'10:00',publishTimes:{sunday:'07:15'}};
 const s=S.compile(data);
 assert.equal(S.resolveDay(s,'2026-11-23').publishAt,'10:00');
 assert.equal(S.resolveDay(s,'2026-11-29').publishAt,'07:15');
 assert.equal(S.snapshot(s,et(2026,11,29,7,14),1).published,false);
 assert.equal(S.snapshot(s,et(2026,11,29,7,15),1).published,true);
 assert.equal(S.snapshot(s,et(2026,11,28,18,29),1).published,false);
 assert.equal(S.snapshot(s,et(2026,11,28,18,30),1).published,true);
});

test('daylight saving: 9 AM Eastern is 13:00 UTC in summer, 14:00 UTC in winter', ()=>{
 const s=S.compile(feed());
 /* Monday 2026-03-09 is the day after DST starts (EDT, UTC-4) */
 assert.equal(S.snapshot(s,Date.UTC(2026,2,9,12,59),1).published,false);
 assert.equal(S.snapshot(s,Date.UTC(2026,2,9,13,0),1).published,true);
 /* Monday 2026-11-02 is the day after DST ends (EST, UTC-5) */
 assert.equal(S.snapshot(s,Date.UTC(2026,10,2,13,59),1).published,false);
 assert.equal(S.snapshot(s,Date.UTC(2026,10,2,14,0),1).published,true);
 /* Eastern midnight, not UTC midnight, decides the date */
 assert.equal(S.easternNow(Date.UTC(2026,10,24,3,0)).date,'2026-11-23');
 assert.equal(S.easternNow(Date.UTC(2026,10,24,5,0)).date,'2026-11-24');
});

test('validation reports duplicates, bad dates/times, and missing flyer files clearly', ()=>{
 const data=feed([
  {date:'2026-12-05',title:'A',src:'/assets/flyers/weekly/vip-saturday.webp'},
  {date:'2026-12-05',title:'B'},
  {date:'2026-02-30',title:'Bad date'},
  {date:'12/24/2026',title:'Wrong format'},
  {date:'2026-12-06',title:'Bad time',publishAt:'9am'},
  {date:'2026-12-07',title:'No file',src:'/assets/flyers/not-uploaded.webp'},
  {date:'2026-12-08',closed:true,open:true},
  {date:'2026-12-09',title:'Bad link',reserve:'tally.so/r/x'}
 ]);
 data.settings={defaultPublishTime:'25:00',publishTimes:{funday:'09:00'}};
 const {errors}=S.validate(data,{assetExists:src=>!src.includes('not-uploaded')});
 const all=errors.join('\n');
 assert.match(all,/Dated entry #2 \(date "2026-12-05", "B"\): duplicates the date in dated entry #1/);
 assert.match(all,/"2026-02-30" is not a real date/);
 assert.match(all,/"12\/24\/2026" is not a real date/);
 assert.match(all,/Dated entry #5 .*"publishAt" "9am" is not a valid 24-hour time/);
 assert.match(all,/flyer file is missing: \/assets\/flyers\/not-uploaded.webp/);
 assert.match(all,/cannot be both "closed": true and "open": true/);
 assert.match(all,/"reserve" "tally.so\/r\/x" must be a full https:\/\/ link/);
 assert.match(all,/settings.defaultPublishTime "25:00"/);
 assert.match(all,/settings.publishTimes has unknown day "funday"/);
 /* the first entry for a duplicated date still wins in the browser */
 assert.equal(S.resolveDay(S.compile(data),'2026-12-05').title,'A');
});

test('the shipped flyers.json has no schedule errors (asset presence is checked by scripts/validate-events.js)', ()=>{
 assert.deepEqual(S.validate(live).errors,[]);
});
