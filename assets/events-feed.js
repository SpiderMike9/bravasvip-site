/* BRAVAS events: /assets/flyers/flyers.json (weekly lineup + dated overrides) powers
   the featured flyer player and the dated calendar. Everything is resolved in the
   browser in America/New_York time, so daily flyers publish with no uploads or deploys. */
(()=>{
 'use strict';
 const S=window.BravasSchedule;if(!S)return;
 const FEED='/assets/flyers/flyers.json';
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
 const longDate=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric'});
 const monthName=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long'});
 const asDate=d=>new Date(d+'T12:00:00Z');
 const failed=new Set();/* flyer images that did not load; fall back to text */
 const hasFlyer=day=>!!(day&&day.src&&!failed.has(day.src));
 let sched=null;

 function rowsFor(day){
  const rows=(day.rows||[]).filter(r=>Array.isArray(r)&&r.length>=2);
  if(!rows.length&&day.time)rows.push(['Hours',day.time]);
  return rows;
 }
 function details(day){
  const box=el('div','feature-copy');
  box.append(el('p','eyebrow','TODAY · '+longDate.format(asDate(day.date)).toUpperCase()+(day.time?' · '+day.time:'')),el('h3','',day.title));
  if(day.lead)box.append(el('p','',day.lead));
  const rows=rowsFor(day);
  if(rows.length){const dl=el('dl','flyer-facts');rows.forEach(r=>dl.append(el('dt','',String(r[0])),el('dd','',String(r[1]))));box.append(dl);}
  const a=el('a','button','Reserve your seat ↗');a.href=day.reserve;box.append(a,el('p','micro','Reservations are subject to confirmation and capacity.'));
  return box;
 }

 /* Featured player: shows today's event once its publish time passes (Eastern). */
 class Player{
  constructor(root){
   this.root=root;
   root.setAttribute('aria-label',"Today's featured BRAVAS event");
   this.shell=el('div','flyer-player-shell');
   this.top=el('div','flyer-player-top');this.top.append(el('span','eyebrow','THE BRAVAS LINEUP'));
   this.status=el('span','player-status');this.top.append(this.status);
   this.stage=el('div','flyer-stage');this.stage.setAttribute('aria-live','polite');
   this.shell.append(this.top,this.stage);
  }
  update(snap){
   const f=snap.featured,t=snap.today;
   const sig=JSON.stringify([f&&f.id,f&&f.src,f&&hasFlyer(f),t.open,t.title,t.publishAt]);
   if(sig===this.sig)return;this.sig=sig;
   if(!this.mounted){this.root.replaceChildren(this.shell);this.mounted=true;}
   this.root.dataset.featured=f?f.id:'';
   if(f){
    this.status.textContent='TODAY AT BRAVAS';
    const slide=el('article','event-feature flyer-slide');slide.dataset.eventId=f.id;
    if(hasFlyer(f)){
     const a=el('a','flyer');a.href=f.src;a.target='_blank';a.rel='noopener';a.setAttribute('aria-label','Open full flyer: '+f.title);
     const img=el('img');img.src=f.src;img.alt=f.alt||f.title;img.width=1122;img.height=1402;img.decoding='async';
     img.addEventListener('error',()=>{failed.add(f.src);render();});
     a.append(img);slide.append(a);
    }else slide.classList.add('flyer-text-only');
    slide.append(details(f));this.stage.replaceChildren(slide);
   }else{
    let msg;
    if(!t.open){this.status.textContent='CLOSED TODAY';msg=(t.source==='closure'&&t.title!=='Closed'?t.title.replace(/[.!]+$/,''):'BRAVAS is closed today')+'. See the calendar for our next night.';}
    else{this.status.textContent='COMING UP TODAY';msg="Today's flyer posts at "+S.timeLabel(t.publishAt)+'. See the calendar for tonight.';}
    this.stage.replaceChildren(el('p','flyer-empty',msg));
   }
  }
 }

 function statusFor(day,i,snap){
  if(!day.open)return {cls:'is-closed',text:'Closed'};
  if(i===0)return snap.published?{cls:'is-live',text:'Today · Featured'}:{cls:'is-pending',text:'Today · Flyer posts at '+S.timeLabel(day.publishAt)};
  if(i===1)return {cls:'',text:'Tomorrow'};
  return {cls:'',text:day.source==='special'?'Special event':'Upcoming'};
 }
 function renderCalendar(root,snap){
  const n=Math.max(1,Math.min(28,parseInt(root.dataset.calendarDays,10)||14));
  const days=snap.days.slice(0,n);
  const sig=JSON.stringify([days,snap.published,[...failed]]);if(root._sig===sig)return;root._sig=sig;
  const frag=document.createDocumentFragment();
  days.forEach((day,i)=>{
   const st=statusFor(day,i,snap);
   const card=el('article','event-card calendar-event'+(i===0?' is-today':'')+(day.open?'':' is-closed'));
   card.dataset.date=day.date;card.dataset.source=day.source;
   const d=asDate(day.date),date=el('div','date');
   date.append(el('span','',day.dayName),el('strong','',String(d.getUTCDate())),el('span','',monthName.format(d)));
   const copy=el('div');
   copy.append(el('p','calendar-status '+st.cls,st.text),el('h3','',day.title));
   if(day.open){
    if(day.time)copy.append(el('p','calendar-time',day.time));
    if(day.lead)copy.append(el('p','',day.lead));
    const a=el('a','textlink','Reserve your seat ↗');a.href=day.reserve;copy.append(a);
    if(i===0&&snap.published&&hasFlyer(day)){const v=el('a','textlink calendar-flyer-link','View flyer ↗');v.href=day.src;v.target='_blank';v.rel='noopener';copy.append(v);}
   }else copy.append(el('p','',day.lead||(day.source==='closure'?'BRAVAS is closed this day.':'BRAVAS is closed Tuesdays.')));
   card.append(date,copy);frag.append(card);
  });
  root.replaceChildren(frag);
 }

 const players=[...document.querySelectorAll('[data-flyer-player]')].map(r=>new Player(r));
 const calendars=[...document.querySelectorAll('[data-event-calendar]')];
 function render(){
  if(!sched)return;
  const snap=S.snapshot(sched,Date.now(),28);
  players.forEach(p=>p.update(snap));calendars.forEach(c=>renderCalendar(c,snap));
  schedule(snap);
 }
 /* Re-render exactly at the next publish time or Eastern midnight, plus a 30s safety tick. */
 let timer=null;
 function schedule(snap){
  clearTimeout(timer);
  const pub=S.toMinutes(snap.today.publishAt||'');
  const target=(pub!==null&&snap.now.minutes<pub)?pub:1440;
  const wait=Math.max(1000,Math.min(30000,(target-snap.now.minutes)*60000-(Date.now()%60000)+500));
  timer=setTimeout(render,wait);
 }
 let loading=false;
 async function refresh(){
  if(loading)return;loading=true;
  try{
   const r=await fetch(FEED,{cache:'no-cache'});if(!r.ok)throw Error('Feed unavailable ('+r.status+')');
   const data=await r.json();const next=S.compile(data);
   if(next.errors.length&&JSON.stringify(next.errors)!==JSON.stringify(sched&&sched.errors))console.warn('BRAVAS flyers.json problems (fix in GitHub):\n- '+next.errors.join('\n- '));
   sched=next;render();
  }catch(e){console.warn('BRAVAS events feed:',e.message);/* keep HTML fallback or last good feed */}
  finally{loading=false;}
 }
 refresh();
 setInterval(()=>{if(!document.hidden)refresh();},5*60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();refresh();}});
})();
