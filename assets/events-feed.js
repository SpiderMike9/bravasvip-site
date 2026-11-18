/* BRAVAS events: one published list powers the flyer player and dated calendar. */
(()=>{
 'use strict';
 const INTERVAL=10000, FEED='/assets/flyers/flyers.json';
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const dayFormat=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric'});
 const easternDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'});
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
 const dateOf=f=>new Date(f.date+'T12:00:00Z');
 const key=f=>f.id||f.date+'|'+f.title;
 const safeImage=src=>typeof src==='string'&&/^\/assets\/flyers\/[a-zA-Z0-9._-]+\.(png|jpe?g|webp)$/i.test(src);
 const reserve=f=>{try{const u=new URL(f.reserve);if(u.origin==='https://tally.so'&&u.pathname.startsWith('/r/'))return u.href;}catch(_){}return 'https://tally.so/r/RWdAv4?date='+f.date;};
 const active=(f,now)=>f.endsAt?Date.parse(f.endsAt)>now:f.date>=easternDay.format(new Date(now));
 function normalize(data){
  const seen=new Set();
  return (Array.isArray(data.flyers)?data.flyers:[]).filter(f=>{
   if(!f||typeof f.title!=='string'||!f.title.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(f.date)||!Number.isFinite(+dateOf(f)))return false;
   if(f.endsAt&&!Number.isFinite(Date.parse(f.endsAt)))return false;
   if(seen.has(key(f)))return false;seen.add(key(f));return true;
  }).sort((a,b)=>(a.startsAt||a.date).localeCompare(b.startsAt||b.date));
 }
 function dateLabel(f){return dayFormat.format(dateOf(f))+(f.time?' · '+f.time:'');}
 function details(f){
  const box=el('div','feature-copy');box.append(el('p','eyebrow',dateLabel(f)),el('h3','',f.title),el('p','',f.lead||''));
  if(Array.isArray(f.rows)&&f.rows.length){const dl=el('dl','flyer-facts');f.rows.forEach(row=>{if(!Array.isArray(row)||row.length<2)return;dl.append(el('dt','',String(row[0])),el('dd','',String(row[1])));});box.append(dl);}
  const a=el('a','button','Reserve your seat ↗');a.href=reserve(f);box.append(a,el('p','micro','Reservations are subject to confirmation and capacity.'));return box;
 }
 class Player{
  constructor(root){
   this.root=root;this.events=[];this.index=0;this.paused=reduced.matches;this.hover=false;this.focus=false;this.visible=false;this.timer=null;
   root.setAttribute('role','region');root.setAttribute('aria-roledescription','carousel');root.setAttribute('aria-label','Upcoming BRAVAS event flyers');
   this.shell=el('div','flyer-player-shell');this.top=el('div','flyer-player-top');this.top.append(el('span','eyebrow','THE BRAVAS LINEUP'));this.status=el('span','player-status');this.top.append(this.status);
   this.stage=el('div','flyer-stage');this.stage.id=root.id+'-stage';this.stage.setAttribute('aria-live','off');
   this.controls=el('div','flyer-controls');this.prev=el('button','player-arrow','←');this.prev.type='button';this.prev.setAttribute('aria-label','Previous event');
   this.next=el('button','player-arrow','→');this.next.type='button';this.next.setAttribute('aria-label','Next event');
   this.toggle=el('button','player-toggle');this.toggle.type='button';this.toggle.setAttribute('aria-controls',this.stage.id);
   this.dots=el('div','flyer-dots');this.dots.setAttribute('role','group');this.dots.setAttribute('aria-label','Choose an event');
   this.controls.append(this.prev,this.toggle,this.next,this.dots);this.shell.append(this.top,this.stage,this.controls);
   this.announce=el('p','player-sr');this.announce.setAttribute('aria-live','polite');this.shell.append(this.announce);
   this.prev.addEventListener('click',()=>this.show(this.index-1,true));this.next.addEventListener('click',()=>this.show(this.index+1,true));
   this.toggle.addEventListener('click',()=>{this.paused=!this.paused;this.sync();});
   root.addEventListener('mouseenter',()=>{this.hover=true;this.sync();});root.addEventListener('mouseleave',()=>{this.hover=false;this.sync();});
   root.addEventListener('focusin',()=>{this.focus=true;this.sync();});root.addEventListener('focusout',()=>setTimeout(()=>{this.focus=root.contains(document.activeElement);this.sync();},0));
   root.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();this.show(this.index+(e.key==='ArrowLeft'?-1:1),true);}});
   let touch=null;this.stage.addEventListener('touchstart',e=>{if(e.touches.length===1)touch=[e.touches[0].clientX,e.touches[0].clientY];},{passive:true});
   this.stage.addEventListener('touchend',e=>{if(!touch||!e.changedTouches.length)return;const dx=e.changedTouches[0].clientX-touch[0],dy=e.changedTouches[0].clientY-touch[1];touch=null;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.4){this.paused=true;this.show(this.index+(dx<0?1:-1),true);}},{passive:true});
   document.addEventListener('visibilitychange',()=>this.sync());
   reduced.addEventListener('change',()=>{if(reduced.matches)this.paused=true;this.sync();});
   if('IntersectionObserver'in window){this.observer=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;this.sync();},{threshold:.15});this.observer.observe(root);}else this.visible=true;
  }
  update(events){
   const signature=JSON.stringify(events);if(this.signature===signature)return;this.signature=signature;
   const current=this.events[this.index];this.events=events;this.index=Math.max(0,events.findIndex(f=>current&&key(f)===key(current)));
   if(!this.mounted){this.root.replaceChildren(this.shell);this.mounted=true;}
   this.dots.replaceChildren();events.forEach((f,i)=>{const b=el('button','flyer-dot');b.type='button';b.setAttribute('aria-label','Show '+f.title);b.addEventListener('click',()=>this.show(i,true));this.dots.append(b);});
   this.show(this.index,false);
  }
  show(index,manual){
   clearTimeout(this.timer);const count=this.events.length;
   if(!count){this.stage.replaceChildren(el('p','flyer-empty','New event flyers are on the way. Explore our weekly calendar below.'));this.controls.hidden=true;this.status.textContent='MORE TO COME';this.sync();return;}
   this.controls.hidden=count<2;this.index=(index+count)%count;const f=this.events[this.index];
   const slide=el('article','event-feature flyer-slide');slide.setAttribute('role','group');slide.setAttribute('aria-roledescription','slide');slide.setAttribute('aria-label',(this.index+1)+' of '+count+': '+f.title);
   const a=el('a','flyer');a.href=f.src;a.target='_blank';a.rel='noopener';a.setAttribute('aria-label','Open full flyer: '+f.title);
   const img=el('img');img.src=f.src;img.alt=f.alt||f.title;img.width=1024;img.height=1280;img.decoding='async';a.append(img);slide.append(a,details(f));
   this.stage.replaceChildren(slide);[...this.dots.children].forEach((b,i)=>{b.setAttribute('aria-pressed',String(i===this.index));});
   if(manual)this.announce.textContent=(this.index+1)+' of '+count+': '+f.title+'. '+dateLabel(f);
   this.sync();
  }
  sync(){
   clearTimeout(this.timer);const running=this.events.length>1&&!this.paused&&!this.hover&&!this.focus&&!document.hidden&&this.visible;
   this.toggle.textContent=this.paused?'▶ Play':'Ⅱ Pause';this.toggle.setAttribute('aria-label',this.paused?'Play flyer slideshow':'Pause flyer slideshow');
   this.status.textContent=this.events.length?(this.index+1)+' / '+this.events.length+' · '+(running?'AUTO PLAY':this.events.length===1?'UP NEXT':'PAUSED'): 'MORE TO COME';
   if(running)this.timer=setTimeout(()=>this.show(this.index+1,false),INTERVAL);
  }
 }
 const players=[...document.querySelectorAll('[data-flyer-player]')].map(root=>new Player(root));
 const calendars=[...document.querySelectorAll('[data-event-calendar]')];let all=[],lastCalendar='';
 function renderCalendar(events){
  const signature=JSON.stringify(events);if(signature===lastCalendar)return;lastCalendar=signature;
  calendars.forEach(root=>{
   const items=root.dataset.calendarMode==='without-flyers'?events.filter(f=>!safeImage(f.src)):events;
   const fragment=document.createDocumentFragment();
   items.forEach(f=>{const article=el('article','event-card calendar-event');const date=el('div','date');const d=dateOf(f);date.append(el('span','',new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'long'}).format(d)),el('strong','',String(d.getUTCDate())),el('span','',new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long'}).format(d)));
    const copy=el('div');copy.append(el('h3','',f.title));if(f.time)copy.append(el('p','calendar-time',f.time));copy.append(el('p','',f.lead||''));const a=el('a','textlink','Reserve your seat ↗');a.href=reserve(f);copy.append(a);
    if(safeImage(f.src)){const view=el('a','textlink calendar-flyer-link','View flyer ↗');view.href=f.src;view.target='_blank';view.rel='noopener';copy.append(view);}article.append(date,copy);fragment.append(article);});
   if(!items.length)fragment.append(el('p','',root.dataset.calendarMode==='without-flyers'?'More dates will be announced soon.':'New dates are coming soon. Explore our weekly nights below.'));
   root.replaceChildren(fragment);
  });
 }
 function render(){const events=all.filter(f=>active(f,Date.now()));players.forEach(p=>p.update(events.filter(f=>safeImage(f.src))));renderCalendar(events);}
 let loading=false;
 async function refresh(){if(loading)return;loading=true;try{const r=await fetch(FEED,{cache:'no-cache'});if(!r.ok)throw Error('Feed unavailable');const data=await r.json();if(!Array.isArray(data.flyers))throw Error('Invalid feed');all=normalize(data);render();}catch(_){/* Retain dated HTML fallback, or the last good feed. */}finally{loading=false;}}
 refresh();setInterval(()=>{if(!document.hidden)render();},15000);setInterval(()=>{if(!document.hidden)refresh();},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();refresh();}});
})();
