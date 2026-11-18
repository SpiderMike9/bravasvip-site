(()=>{
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const menu=document.querySelector('.menu-button'),nav=document.getElementById('navigation');
 if(menu&&nav)menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.textContent=open?'Close':'Menu';nav.classList.toggle('open',open)});
 if(nav&&menu)nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.textContent='Menu'}));
 document.querySelectorAll('[data-event-end]').forEach(e=>{if(Date.parse(e.dataset.eventEnd)<=Date.now())e.hidden=true});
 document.querySelectorAll('.hero-image img').forEach(img=>{const ready=()=>{if(img.naturalWidth>0)img.classList.add('ready')};if(img.complete)ready();else img.addEventListener('load',ready,{once:true})});
 if(reduced)return;
 const elements=[...document.querySelectorAll('.owner-welcome,.first-steps li,.intro-grid,.experience-grid,.section-head,.event-feature,.event-card,.member-story,.member-card,.live-grid,.visit>div,.detail-benefits,.journey,.night')];
 if('IntersectionObserver'in window){elements.forEach(e=>e.setAttribute('data-reveal',''));document.documentElement.classList.add('motion-enabled');const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('in-view');observer.unobserve(entry.target)}}),{threshold:.06});elements.forEach(e=>observer.observe(e));}
 const button=document.createElement('button');button.className='motion-toggle';button.type='button';button.textContent='Pause motion';button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>{const paused=document.documentElement.classList.toggle('motion-paused');button.textContent=paused?'Resume motion':'Pause motion';button.setAttribute('aria-pressed',String(paused))});document.body.append(button);
})();
