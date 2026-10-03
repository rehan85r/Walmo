/* My Projects uses only server-returned project data; no demo projects or stats. */
(function(){
  window.walmoMemoryChip=function(container,memories){
    const records=Array.isArray(memories)?memories.filter(x=>x&&typeof x.text==='string'&&x.text.trim()&&!x.text.startsWith('Web3 learning log')):[];
    if(!records.length)return;
    const details=document.createElement('details');details.className='walmo-memory-chip';
    const summary=document.createElement('summary');summary.textContent='Recalled from memory';details.append(summary);
    const list=document.createElement('ul');records.forEach(x=>{const li=document.createElement('li');li.textContent=x.text;list.append(li)});details.append(list);container.prepend(details);
  };
  const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node};
  let projects=null,busy=false,error='',notice='',showForm=false,open=false,root,panel,returnFocus,pending,timer;
  const draft={name:'',sources:'',confirm:false};
  function button(text,fn,secondary=false){const b=el('button',text,secondary?'secondary':'');b.type='button';b.disabled=busy;b.addEventListener('click',fn);return b}
  function link(url,text){const a=el('a',text);try{const u=new URL(url);if(u.protocol!=='https:')return el('span',text);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer'}catch{return el('span',text)}return a}
  function date(value){const d=new Date(value);return Number.isNaN(d.getTime())?'Unknown time':d.toLocaleString()}
  async function api(body){
    const r=await fetch('/api/projects',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(body?.action==='check'?58000:15000)});
    const data=await r.json();if(Array.isArray(data.projects))projects=data.projects;
    if(!r.ok||!data.success)throw Error(data.error||'Projects unavailable');return data;
  }
  async function refresh(){
    if(busy||pending)return pending;
    pending=(async()=>{try{await api();error=''}catch(e){error=e.message}finally{pending=null;render()}})();return pending;
  }
  async function action(body){
    if(busy)return;
    if(pending)await pending;
    busy=true;error='';notice=body.action==='check'?'Checking public sources and recalling the previous checkpoint…':'';render();
    try{
      await api(body);
      if(body.action==='add'){showForm=false;draft.name='';draft.sources='';draft.confirm=false;notice='Project added. Check updates to save its first baseline.'}
      else if(body.action==='task')notice='Task status saved. This is your marked status, not independently verified completion.';
      else if(body.action==='remove')notice='Project removed from your dashboard. Previously stored Walrus records are not erased.';
      else {notice='Check finished. Review the source excerpts below.';clearTimeout(timer);timer=setTimeout(refresh,15000)}
    }catch(e){error=e.message;notice=''}finally{busy=false;render()}
  }
  function addForm(){
    const form=el('form',undefined,'wm-project-card');form.append(el('h3','Follow a project'));
    const name=el('input');name.id='wm-project-name';name.maxLength=80;name.required=true;name.value=draft.name;name.placeholder='Project name';name.disabled=busy;name.oninput=()=>draft.name=name.value;
    const label=el('label','Project name');label.htmlFor=name.id;form.append(label,name);
    const sources=el('textarea');sources.id='wm-project-sources';sources.required=true;sources.value=draft.sources;sources.placeholder='https://project.example/blog\nhttps://project.example/announcements';sources.disabled=busy;sources.oninput=()=>draft.sources=sources.value;
    const sourceLabel=el('label','Official public sources — one URL per line, up to 3');sourceLabel.htmlFor=sources.id;form.append(sourceLabel,sources);
    form.append(el('p','Use public announcement pages, blogs, docs changelogs or RSS feeds. Private Discord/Telegram and login-only X pages cannot be monitored here.','wm-muted'));
    const check=el('input');check.type='checkbox';check.required=true;check.checked=draft.confirm;check.disabled=busy;check.onchange=()=>draft.confirm=check.checked;
    const confirm=el('label',undefined,'wm-confirm');confirm.append(check,el('span','I checked that these public sources belong to this project.'));form.append(confirm);
    const row=el('div',undefined,'wm-project-actions');const submit=el('button',busy?'Saving…':'Add project');submit.type='submit';submit.disabled=busy;row.append(submit,button('Cancel',()=>{showForm=false;render()},true));form.append(row);
    form.onsubmit=e=>{e.preventDefault();const urls=draft.sources.split(/\n/).map(x=>x.trim()).filter(Boolean);action({action:'add',name:draft.name,sources:urls,confirmSources:draft.confirm})};return form;
  }
  function updateCard(project,item){
    const card=el('article',undefined,'wm-update');card.append(el('span',item.kind==='task'?'Task · '+item.status:(item.baseline?'Baseline':'Update'),'wm-tag'),el('h4',item.title),el('p',item.detail));
    if(item.deadline)card.append(el('p','Deadline text (as published): '+item.deadline,'wm-muted'));
    card.append(el('p','First seen '+date(item.firstSeen)+' · Last observed '+date(item.lastSeen),'wm-muted'));
    const evidence=el('details');evidence.append(el('summary','Source excerpt'),el('blockquote',item.quote),link(item.source,'Open source'));card.append(evidence);
    if(item.kind==='task'){
      const row=el('div',undefined,'wm-project-actions');
      for(const [status,label]of [['done','Done'],['skipped','Skip'],['pending','Reopen']])if(status!==item.status)row.append(button(label,()=>action({action:'task',projectId:project.id,taskId:item.id,status}),true));
      card.append(row);
    }return card;
  }
  function projectCard(project){
    const card=el('section',undefined,'wm-project-card');card.append(el('h3',project.name));
    card.append(el('p',project.checkedAt?'Last successful check: '+date(project.checkedAt):'Not checked yet','wm-muted'));
    card.append(el('p',project.checkMessage||''));
    if(project.lastError)card.append(el('p',project.lastError,'wm-project-error'));
    if(project.summary)card.append(el('p',project.summary));
    if(project.comparison==='walrus_memory_and_source_snapshot'){
      const memory=el('details');memory.append(el('summary','Previous checkpoint recalled from Walrus Memory'),el('p','Saved check: '+date(project.memoryEvidence?.checkedAt),'wm-muted'),el('p',project.memoryEvidence?.summary||''));card.append(memory);
    }else if(project.comparison==='source_snapshot')card.append(el('p','Compared with the saved source snapshot. The matching Walrus Memory checkpoint was not retrieved.','wm-muted'));
    const memoryLabels={pending:'Walrus checkpoint save pending',saved:'Walrus checkpoint job completed',unconfirmed:'Walrus checkpoint save not confirmed; source snapshot is saved',unavailable:'Walrus Memory unavailable; source snapshot is saved'};
    if(memoryLabels[project.memoryStatus])card.append(el('p',memoryLabels[project.memoryStatus],'wm-muted'));
    const sources=el('details');sources.append(el('summary','Tracked sources'));
    project.sources.forEach(url=>{const p=el('p');p.append(link(url,url));sources.append(p)});card.append(sources);
    const row=el('div',undefined,'wm-project-actions');row.append(button(busy?'Please wait…':'Check updates',()=>action({action:'check',projectId:project.id})),button('Remove',()=>{if(confirm('Remove '+project.name+' from My Projects? Previously stored Walrus records will not be erased.'))action({action:'remove',projectId:project.id})},true));card.append(row);
    const pendingTasks=project.updates.filter(x=>x.kind==='task'&&x.status==='pending');
    const updates=project.updates.filter(x=>x.kind==='update');
    if(pendingTasks.length){card.append(el('h3','Pending tasks'),el('p','Not marked done or skipped. Check the source for current eligibility and whether the task is still open.','wm-muted'));pendingTasks.forEach(x=>card.append(updateCard(project,x)))}
    if(updates.length){const section=el('details');section.open=true;section.append(el('summary','Updates'));updates.forEach(x=>section.append(updateCard(project,x)));card.append(section)}
    const closed=project.updates.filter(x=>x.kind==='task'&&x.status!=='pending');
    if(closed.length){const section=el('details');section.append(el('summary','Done / skipped tasks'));closed.forEach(x=>section.append(updateCard(project,x)));card.append(section)}
    return card;
  }
  function render(){
    if(!root)return;root.replaceChildren();
    const top=el('div',undefined,'wm-project-row');top.append(el('h2','My Projects'),button('Add project',()=>{showForm=true;render();root.querySelector('input')?.focus()},true));root.append(top);
    root.append(el('p','Check what changed. Keep track of tasks.','wm-muted'));
    root.append(el('p','Checks run when you tap. Only your selected readable sources are covered; alerts are not automatic.','wm-muted'));
    if(error){const p=el('div',error,'wm-project-error');p.setAttribute('role','alert');root.append(p,button('Retry',refresh,true))}
    if(notice){const p=el('p',notice,'wm-project-notice');p.setAttribute('role','status');root.append(p)}
    if(showForm)root.append(addForm());
    if(projects===null&&!error)root.append(el('p','Loading projects…','wm-muted'));
    else if(projects?.length)projects.forEach(project=>root.append(projectCard(project)));
    else if(projects&&!showForm)root.append(el('div','Add your first project and its official announcement sources. The first check saves a baseline; later checks compare against it.','wm-project-card'));
  }
  function mount(){if(open)return;const greeting=document.querySelector('.walmo-greeting .bubble');if(greeting&&root.parentNode!==greeting)greeting.append(root)}
  function closePanel(){open=false;panel.hidden=true;mount();returnFocus?.focus()}
  document.addEventListener('DOMContentLoaded',()=>{
    root=el('div',undefined,'wm-projects');
    panel=el('section',undefined,'wm-project-panel');panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','My Projects');
    const header=el('div',undefined,'wm-project-panel-header');header.append(el('strong','My Projects'));const close=el('button','Close','wm-project-close');close.onclick=closePanel;header.append(close);panel.append(header);document.body.append(panel);
    document.getElementById('walmoNavProjects')?.addEventListener('click',()=>{returnFocus=document.activeElement;open=true;panel.hidden=false;panel.append(root);document.getElementById('walmoMenuPanel')?.classList.remove('open');render();close.focus();refresh()});
    panel.addEventListener('keydown',e=>{if(e.key==='Escape')closePanel();if(e.key==='Tab'){const nodes=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary,a[href]')].filter(x=>x.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
    const messages=document.getElementById('messages');if(messages)new MutationObserver(mount).observe(messages,{childList:true,subtree:true});
    document.getElementById('newChatBtn')?.addEventListener('click',refresh);
    mount();render();refresh();
  });
})();
