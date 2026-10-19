(() => {
  'use strict';
  const $ = (q, root=document) => root.querySelector(q);
  const $$ = (q, root=document) => [...root.querySelectorAll(q)];
  const read = (key, fallback=null) => {try{return JSON.parse(localStorage.getItem(key)) ?? fallback;}catch{return fallback;}};
  const write = (key, value) => {try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
  const path = location.pathname.split('/').pop() || 'index.html';
  const scope = location.pathname.slice(0,location.pathname.lastIndexOf('/')+1);
  const prefix = 'basco:manual:'+scope;
  const previous = read(prefix+':last');
  const positions = read(prefix+':positions',{});
  const title = document.body.dataset.pageTitle || document.title.replace(' · BASCO','');
  const resume = $('.resume');
  if (resume && previous && previous.path !== path && !previous.path.startsWith('source-')) {
    resume.replaceChildren(document.createTextNode('Continue reading: '));
    const a=document.createElement('a'); a.href=previous.path; a.textContent=previous.title+' ↗';
    a.addEventListener('click',()=>sessionStorage.setItem(prefix+':resume',previous.path));resume.append(a);resume.classList.add('visible');
  }
  const save = () => {
    positions[path] = {y:window.scrollY,hash:location.hash};write(prefix+':positions',positions);
    write(prefix+':last',{path,title,y:window.scrollY});
  };
  let saveTimer;
  const scroll = () => {
    clearTimeout(saveTimer);saveTimer=setTimeout(save,180);
    const max=document.documentElement.scrollHeight-innerHeight;
    const progress=$('.reading-progress');if(progress)progress.style.width=(max>0?100*scrollY/max:0)+'%';
  };
  addEventListener('scroll',scroll,{passive:true});addEventListener('pagehide',save);
  const navType=performance.getEntriesByType('navigation')[0]?.type;
  let wantsResume=false;try{wantsResume=sessionStorage.getItem(prefix+':resume')===path;sessionStorage.removeItem(prefix+':resume');}catch{}
  if ('scrollRestoration' in history)history.scrollRestoration='manual';
  if ((navType==='back_forward'||wantsResume) && positions[path]){
    requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:positions[path].y,behavior:'instant'})));
  }
  const revealHash = () => {
    let target;try{target=document.getElementById(decodeURIComponent(location.hash.slice(1)));}catch{return;}
    if(!target)return;let node=target.parentElement,opened=false;
    while(node){if(node.tagName==='DETAILS'&&!node.open){node.open=true;opened=true;}node=node.parentElement;}
    if(opened)requestAnimationFrame(()=>target.scrollIntoView({block:'start'}));
  };
  revealHash();addEventListener('hashchange',revealHash);
  $$('[data-back]').forEach(b=>b.addEventListener('click',()=>{if(history.length>1)history.back();else location.href='index.html';}));
  $$('[data-forward]').forEach(b=>b.addEventListener('click',()=>history.forward()));
  $$('[data-top]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();window.scrollTo({top:0,behavior:'smooth'});}));
  $$('[data-print]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();print();}));
  const menu=$('[data-menu]');
  const closeMenu=()=>{document.body.classList.remove('nav-open');menu?.setAttribute('aria-expanded','false');};
  menu?.addEventListener('click',()=>{const open=document.body.classList.toggle('nav-open');menu.setAttribute('aria-expanded',String(open));});
  $('.mobile-backdrop')?.addEventListener('click',closeMenu);
  $$('.nav-group').forEach(group=>{
    const key=prefix+':nav:'+group.dataset.group;
    if (!$('[aria-current=page]',group) && read(key)!==null) group.open=read(key);
    group.addEventListener('toggle',()=>write(key,group.open));
  });
  const activeNav=$('.sidebar a[aria-current=page]');if(activeNav){const nav=$('.sidebar nav');nav.scrollTop=Math.max(0,activeNav.offsetTop-230);}
  $('[data-theme-toggle]')?.addEventListener('click',()=>{
    const dark=document.documentElement.dataset.theme==='dark';document.documentElement.dataset.theme=dark?'light':'dark';
    write('basco:manual:theme',dark?'light':'dark');
    $('[data-theme-toggle]').setAttribute('aria-label',dark?'Use dark theme':'Use light theme');
  });
  $$('pre').filter(p=>!p.closest('.source-code')&&!p.classList.contains('math-source')).forEach(pre=>{
    const wrap=document.createElement('div');wrap.className='code-wrap';pre.before(wrap);wrap.append(pre);
    const button=document.createElement('button');button.type='button';button.className='copy-code';button.textContent='Copy';button.setAttribute('aria-label','Copy code');
    button.addEventListener('click',async()=>{
      const code=pre.textContent;button.textContent='Copying…';button.disabled=true;
      try{if(navigator.clipboard&&isSecureContext)await Promise.race([navigator.clipboard.writeText(code),new Promise((_,reject)=>setTimeout(()=>reject(Error('Clipboard unavailable')),800))]);else{const t=document.createElement('textarea');t.value=code;document.body.append(t);t.select();const ok=document.execCommand('copy');t.remove();if(!ok)throw Error('copy unavailable');}button.textContent='Copied';}
      catch{button.textContent='Select & copy';const r=document.createRange();r.selectNodeContents(pre);getSelection().removeAllRanges();getSelection().addRange(r);}
      button.disabled=false;setTimeout(()=>button.textContent='Copy',1800);
    });wrap.append(button);
  });
  $$('.article h2[id],.article h3[id]').forEach(h=>{
    const a=document.createElement('a');a.href='#'+h.id;a.className='section-link';a.textContent='#';a.setAttribute('aria-label','Link to '+h.textContent);h.append(a);
  });
  const sections=$$('.article h2[id],.article h3[id]');
  if ('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{if(entry.isIntersecting){$$('.toc a.active').forEach(a=>a.classList.remove('active'));const a=$('.toc a[href="#'+CSS.escape(entry.target.id)+'"]');a?.classList.add('active');}});
  },{rootMargin:'-90px 0px -65% 0px'});sections.forEach(s=>observer.observe(s));}
  const filter=$('[data-api-filter]');let tier='public';
  const filterAPI=()=>{
    const q=(filter?.value||'').toLowerCase().trim();let count=0;
    $$('[data-api-entry]').forEach(row=>{const match=(tier==='all'||row.dataset.tier===tier)&&(!q||q.split(/\s+/).every(word=>row.dataset.search.includes(word)));row.hidden=!match;if(match)count++;});
    const n=$('[data-api-count]');if(n)n.textContent=count+' matching entries';
  };
  $$('button[data-tier]').forEach(button=>button.addEventListener('click',()=>{
    tier=button.dataset.tier;$$('button[data-tier]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));filterAPI();
    const params=new URLSearchParams(location.search);params.set('tier',tier);history.replaceState(history.state,'',path+'?'+params);
  }));
  if(filter){const params=new URLSearchParams(location.search);tier=params.get('tier')||'public';if(!['public','advanced','internal','legacy','all'].includes(tier))tier='public';filter.value=params.get('q')||'';$$('button[data-tier]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tier===tier)));filter.addEventListener('input',filterAPI);filterAPI();}
  const dialog=$('#search-dialog'),query=$('#search-input'),results=$('#search-results');let selected=-1;
  const openSearch=()=>{if(!dialog)return;dialog.showModal();query.focus();renderSearch();};
  const closeSearch=()=>dialog?.close();
  $$('[data-search-open]').forEach(b=>b.addEventListener('click',openSearch));$('[data-search-close]')?.addEventListener('click',closeSearch);
  dialog?.addEventListener('click',e=>{if(e.target===dialog)closeSearch();});
  const renderSearch=()=>{
    const q=query.value.toLowerCase().trim(),words=q.split(/\s+/).filter(Boolean);results.replaceChildren();selected=-1;
    let items=(window.BASCO_SEARCH||[]).map(item=>{
      const name=(item.title+' '+(item.aliases||'')).toLowerCase(),text=(name+' '+item.text).toLowerCase();
      if(!words.every(w=>text.includes(w)))return null;
      const score=words.reduce((n,w)=>n+(name===w?100:name.startsWith(w)?35:name.includes(w)?18:2),0)+(item.type==='Guide'?8:0)+(item.tier==='public'?6:0)-(item.tier==='legacy'?3:0);
      const short=item.title.split('.').pop().toLowerCase();return {...item,score:score+(short===q?70:0)};
    }).filter(Boolean).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title));
    if(!q)items=(window.BASCO_SEARCH||[]).filter(i=>i.type==='Guide').slice(0,8);
    items.slice(0,24).forEach(item=>{const a=document.createElement('a');a.className='search-result';a.href=item.url;const strong=document.createElement('strong');strong.textContent=item.title;const small=document.createElement('small');small.textContent=item.type+' · '+item.description;a.append(strong,small);results.append(a);});
    if(!items.length){const p=document.createElement('div');p.className='empty-search';p.textContent='No matches. Try a class name, parameter, observable or task.';results.append(p);}
  };
  query?.addEventListener('input',renderSearch);
  query?.addEventListener('keydown',e=>{const items=$$('.search-result',results);if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();selected=(selected+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items.forEach((a,i)=>a.classList.toggle('selected',i===selected));items[selected]?.scrollIntoView({block:'nearest'});}else if(e.key==='Enter'&&items.length){e.preventDefault();location.href=items[Math.max(selected,0)].href;}});
  addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();}if(e.key==='Escape')closeMenu();if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!dialog?.open){e.preventDefault();openSearch();}});
  if(window.katex){$$('pre code.language-math,pre code.language-latex,.math-source').forEach(code=>{const target=document.createElement('div');target.className='math-display';try{katex.render(code.textContent,target,{displayMode:true,throwOnError:false,strict:'ignore'});const wrap=code.closest('.code-wrap')||code.closest('pre')||code;wrap.replaceWith(target);}catch{}});}
  scroll();
})();
