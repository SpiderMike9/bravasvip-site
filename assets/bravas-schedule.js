/* BRAVAS schedule engine.
   Resolves the weekly lineup plus dated overrides from /assets/flyers/flyers.json.
   All dates, weekdays and publish times use America/New_York (DST handled by Intl).
   Shared by the browser (window.BravasSchedule) and Node (scripts/validate-events.js, tests). */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;else root.BravasSchedule=api;
})(typeof self!=='undefined'?self:this,function(){
 'use strict';
 const TIME_ZONE='America/New_York';
 const WEEKDAYS=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
 const DEFAULT_PUBLISH='09:00';
 const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
 const TIME_RE=/^([01]\d|2[0-3]):([0-5]\d)$/;
 const SRC_RE=/^\/assets\/flyers\/(?:[a-zA-Z0-9_-][a-zA-Z0-9._-]*\/)*[a-zA-Z0-9_-][a-zA-Z0-9._-]*\.(png|jpe?g|webp)$/i;
 const DEFAULT_RESERVE='https://tally.so/r/RWdAv4';

 const parts=new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 /* Current Eastern date (YYYY-MM-DD) and minutes since local midnight for a UTC instant. */
 function easternNow(ms){
  const p={};parts.formatToParts(new Date(ms)).forEach(x=>{p[x.type]=x.value;});
  return {date:p.year+'-'+p.month+'-'+p.day,minutes:(+p.hour%24)*60+(+p.minute)};
 }
 function isRealDate(s){
  if(typeof s!=='string'||!DATE_RE.test(s))return false;
  const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;
 }
 const weekdayOf=s=>WEEKDAYS[new Date(s+'T12:00:00Z').getUTCDay()];
 function addDays(s,n){const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
 const toMinutes=t=>{const m=TIME_RE.exec(t);return m?(+m[1])*60+(+m[2]):null;};
 function timeLabel(t){const m=toMinutes(t);if(m===null)return '';const h=Math.floor(m/60),mm=m%60;return ((h%12)||12)+':'+String(mm).padStart(2,'0')+' '+(h<12?'AM':'PM');}
 const safeSrc=src=>typeof src==='string'&&SRC_RE.test(src)&&!src.includes('..');
 function safeReserve(url,date){
  if(typeof url==='string'){try{const u=new URL(url);if(u.protocol==='https:')return u.href;}catch(_){}}
  return DEFAULT_RESERVE+'?date='+date;
 }
 const has=(o,k)=>o&&Object.prototype.hasOwnProperty.call(o,k)&&o[k]!==undefined&&o[k]!==null&&o[k]!=='';
 const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);

 /* Validate the whole feed. Returns {errors:[...], skip:Set(indexes of dated entries to ignore)}.
    opts.assetExists(src) -> boolean lets Node check that flyer files are in the repo. */
 function validate(data,opts){
  opts=opts||{};const errors=[],skip=new Set();
  const exists=typeof opts.assetExists==='function'?opts.assetExists:null;
  const err=m=>errors.push(m);
  if(!data||typeof data!=='object'){err('flyers.json must contain a JSON object.');return {errors,skip};}
  const settings=data.settings||{};
  if(has(settings,'defaultPublishTime')&&toMinutes(settings.defaultPublishTime)===null)err('settings.defaultPublishTime "'+settings.defaultPublishTime+'" is not a valid 24-hour time. Use HH:MM, for example "09:00" or "14:30".');
  const per=settings.publishTimes||{};
  if(typeof per!=='object'||Array.isArray(per))err('settings.publishTimes must be an object such as {"sunday": "08:00"}.');
  else Object.keys(per).forEach(k=>{
   if(!WEEKDAYS.includes(k))err('settings.publishTimes has unknown day "'+k+'". Use lowercase day names: '+WEEKDAYS.join(', ')+'.');
   else if(toMinutes(per[k])===null)err('settings.publishTimes.'+k+' "'+per[k]+'" is not a valid 24-hour time. Use HH:MM, for example "09:00".');
  });
  const weekly=data.weekly;
  if(!weekly||typeof weekly!=='object')err('"weekly" is missing. It must list all seven days, monday through sunday.');
  else WEEKDAYS.forEach(day=>{
   const w=weekly[day];const where='weekly.'+day;
   if(!w||typeof w!=='object'){err(where+' is missing. Add it, or use {"closed": true} for a closed day.');return;}
   if(w.closed===true)return;
   if(!has(w,'title'))err(where+' needs a "title".');
   if(has(w,'src')&&!safeSrc(w.src))err(where+' "src" "'+w.src+'" must be a path like /assets/flyers/weekly/name.webp (png, jpg or webp).');
   else if(has(w,'src')&&exists&&!exists(w.src))err(where+' flyer file is missing: '+w.src+' (upload this file to the repo, or fix the path).');
   if(has(w,'publishAt')&&toMinutes(w.publishAt)===null)err(where+' "publishAt" "'+w.publishAt+'" is not a valid 24-hour time. Use HH:MM.');
  });
  const list=data.flyers;
  if(!Array.isArray(list)){err('"flyers" must be a list [ ... ] of dated entries (it can be empty: []).');return {errors,skip};}
  const firstByDate={};
  list.forEach((f,i)=>{
   const label='Dated entry #'+(i+1)+(f&&f.date?' (date "'+f.date+'"'+(f.title?', "'+f.title+'"':'')+')':'');
   const bad=m=>{err(label+': '+m);skip.add(i);};
   if(!f||typeof f!=='object'){bad('must be an object { ... }.');return;}
   if(!has(f,'date')){bad('is missing "date". Use "YYYY-MM-DD", for example "2026-12-24".');return;}
   if(!isRealDate(f.date)){bad('"'+f.date+'" is not a real date. Use "YYYY-MM-DD", for example "2026-12-24".');return;}
   if(Object.prototype.hasOwnProperty.call(firstByDate,f.date)){bad('duplicates the date in dated entry #'+(firstByDate[f.date]+1)+'. Keep one entry per date (only the first one is used).');return;}
   firstByDate[f.date]=i;
   if(f.closed!==undefined&&typeof f.closed!=='boolean')bad('"closed" must be true or false (no quotes).');
   if(f.open!==undefined&&typeof f.open!=='boolean')bad('"open" must be true or false (no quotes).');
   if(f.closed===true&&f.open===true)bad('cannot be both "closed": true and "open": true. Remove one.');
   if(f.closed===true)return;
   if(!has(f,'title'))bad('needs a "title" (or add "closed": true to close that date).');
   if(weekdayOf(f.date)==='tuesday'&&f.open!==true)bad(f.date+' is a Tuesday, and BRAVAS is closed Tuesdays by default. Add "open": true to open for this special event.');
   if(has(f,'src')&&!safeSrc(f.src))bad('"src" "'+f.src+'" must be a path like /assets/flyers/my-event-2026-12-24.webp (png, jpg or webp, inside /assets/flyers/).');
   else if(has(f,'src')&&exists&&!exists(f.src))bad('flyer file is missing: '+f.src+' (upload this file to /assets/flyers/, or fix the path).');
   if(has(f,'publishAt')&&toMinutes(f.publishAt)===null)bad('"publishAt" "'+f.publishAt+'" is not a valid 24-hour time. Use HH:MM, for example "09:00" or "17:30".');
   if(has(f,'reserve')){let ok=false;try{ok=new URL(f.reserve).protocol==='https:';}catch(_){}if(!ok)bad('"reserve" "'+f.reserve+'" must be a full https:// link.');}
  });
  return {errors,skip};
 }

 /* Build a fast lookup from a feed. Invalid dated entries are dropped (validate() explains why). */
 function compile(data){
  const v=validate(data);
  const byDate={};
  (Array.isArray(data&&data.flyers)?data.flyers:[]).forEach((f,i)=>{if(!v.skip.has(i)&&!byDate[f.date])byDate[f.date]=f;});
  const settings=(data&&data.settings)||{};
  const def=toMinutes(settings.defaultPublishTime)!==null?settings.defaultPublishTime:DEFAULT_PUBLISH;
  return {weekly:(data&&data.weekly)||{},byDate,settings,defaultPublish:def,errors:v.errors};
 }

 /* Resolve one Eastern calendar date into what BRAVAS shows that day. */
 function resolveDay(sched,date){
  const weekday=weekdayOf(date);const o=sched.byDate[date];
  const per=sched.settings.publishTimes||{};
  const dayPublish=toMinutes(per[weekday])!==null?per[weekday]:sched.defaultPublish;
  const base={date,weekday,dayName:cap(weekday)};
  if(o){
   if(o.closed===true)return Object.assign(base,{open:false,source:'closure',title:o.title||'Closed',lead:o.lead||''});
   const publishAt=toMinutes(o.publishAt)!==null?o.publishAt:dayPublish;
   return Object.assign(base,{open:true,source:'special',title:o.title,src:safeSrc(o.src)?o.src:null,alt:o.alt||o.title,time:o.time||'',lead:o.lead||'',rows:Array.isArray(o.rows)?o.rows:[],reserve:safeReserve(o.reserve,date),publishAt,id:o.id||'special-'+date});
  }
  const w=sched.weekly[weekday];
  if(!w||w.closed===true)return Object.assign(base,{open:false,source:'weekly',title:'Closed',lead:''});
  const publishAt=toMinutes(w.publishAt)!==null?w.publishAt:dayPublish;
  return Object.assign(base,{open:true,source:'weekly',title:w.title,src:safeSrc(w.src)?w.src:null,alt:w.alt||w.title,time:w.time||'',lead:w.lead||'',rows:Array.isArray(w.rows)?w.rows:[],reserve:safeReserve(w.reserve,date),publishAt,id:weekday+'-'+date});
 }

 /* What to show right now: today's resolved day, whether its flyer is published, and the next N days. */
 function snapshot(sched,nowMs,days){
  const now=easternNow(nowMs);
  const list=[];for(let i=0;i<(days||7);i++)list.push(resolveDay(sched,addDays(now.date,i)));
  const today=list[0];
  const published=!!(today.open&&now.minutes>=toMinutes(today.publishAt));
  return {now,today,published,featured:published?today:null,days:list};
 }

 return {TIME_ZONE,WEEKDAYS,easternNow,isRealDate,weekdayOf,addDays,toMinutes,timeLabel,safeSrc,validate,compile,resolveDay,snapshot};
});
