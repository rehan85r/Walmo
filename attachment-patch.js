(function(){
  const fileIds=['walmoCameraInput','walmoPhotosInput','walmoFilesInput'];
  const originalFetch=window.fetch.bind(window);
  const box=document.querySelector('.input-box');
  const input=document.getElementById('messageInput');
  const send=document.getElementById('sendBtn');
  let pending=[];
  let loading=Promise.resolve();
  if(!box||!input)return;

  const styles=document.createElement('style');
  styles.textContent=`
    .input-box.walmo-has-attachments{position:relative!important;min-height:150px!important;padding-top:98px!important}
    .walmo-preview-tray{position:absolute;top:12px;left:18px;right:18px;height:80px;display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;z-index:2}
    .walmo-preview-tray[hidden]{display:none!important}
    .walmo-preview-tray::-webkit-scrollbar{display:none}
    .walmo-preview-card{position:relative;flex:0 0 76px;width:76px;height:76px;border-radius:15px;background:#f2efff;border:1px solid #e6e2f5;overflow:visible}
    .walmo-preview-card img{width:100%;height:100%;object-fit:cover;border-radius:14px;display:block}
    .walmo-preview-file{height:100%;display:flex;align-items:center;justify-content:center;padding:8px;color:#4c5480;font-size:11px;text-align:center;overflow-wrap:anywhere}
    .walmo-preview-remove{position:absolute;top:-5px;right:-5px;width:24px;height:24px;border:0;border-radius:50%;background:#fff;color:#152043;font-size:18px;line-height:24px;text-align:center;box-shadow:0 2px 8px #0002;cursor:pointer;padding:0}
    .input-box.walmo-has-attachments #sendBtn .send-voice-icon{display:none!important}
    .input-box.walmo-has-attachments #sendBtn .send-arrow-icon{display:block!important;visibility:visible!important;opacity:1!important}
  `;
  document.head.appendChild(styles);
  const tray=document.createElement('div');
  tray.className='walmo-preview-tray';
  tray.setAttribute('aria-label','Selected attachments');
  tray.hidden=true;
  box.appendChild(tray);

  function render(){
    tray.replaceChildren();
    tray.hidden=!pending.length;
    box.classList.toggle('walmo-has-attachments',!!pending.length);
    for(const [index,item] of pending.entries()){
      const card=document.createElement('div');
      card.className='walmo-preview-card';
      if(item.type.startsWith('image/')){
        const image=document.createElement('img');
        image.src=item.data;
        image.alt=item.name;
        card.appendChild(image);
      }else{
        const label=document.createElement('div');
        label.className='walmo-preview-file';
        label.textContent=item.name;
        card.appendChild(label);
      }
      const remove=document.createElement('button');
      remove.type='button';
      remove.className='walmo-preview-remove';
      remove.setAttribute('aria-label','Remove '+item.name);
      remove.textContent='×';
      remove.addEventListener('click',()=>{pending.splice(index,1);render();});
      card.appendChild(remove);
      tray.appendChild(card);
    }
    if(pending.length&&!input.value.trim())send?.classList.add('state-ready');
    input.dispatchEvent(new Event('input',{bubbles:true}));
    if(pending.length)box.style.setProperty('height','150px','important');
    else box.style.removeProperty('height');
  }

  function dataURL(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(new Error('Could not read this file.'));
      reader.readAsDataURL(file);
    });
  }

  async function prepare(files){
    if(pending.length+files.length>3)throw new Error('Choose up to 3 files.');
    const items=[];
    for(const file of files){
      const type=file.type||(/\.txt$/i.test(file.name)?'text/plain':'');
      let data;
      if(type==='text/plain'){
        if(file.size>80000)throw new Error('Text files must be under 80 KB.');
        data=await file.text();
      }else if(['image/jpeg','image/png','image/webp','image/gif','application/pdf'].includes(type)){
        if(file.size>1800000)throw new Error('Images and PDFs must be under 1.8 MB.');
        data=await dataURL(file);
      }else throw new Error('Choose an image, PDF, or plain text file.');
      items.push({name:file.name,type,data});
    }
    if([...pending,...items].reduce((sum,item)=>sum+item.data.length,0)>2800000){
      throw new Error('Total attachments are too large.');
    }
    pending.push(...items);
    render();
    input.focus();
  }

  fileIds.forEach(id=>{
    const picker=document.getElementById(id);
    if(!picker)return;
    picker.addEventListener('change',event=>{
      event.stopImmediatePropagation();
      const files=Array.from(picker.files||[]);
      picker.value='';
      loading=loading.then(()=>prepare(files)).catch(error=>alert(error.message));
    },true);
  });

  const handleSend=window.handleSendButton;
  if(typeof handleSend==='function')window.handleSendButton=function(){
    if(pending.length&&!input.value.trim())input.value='What is in this image?';
    return handleSend();
  };

  window.fetch=async function(resource,options){
    if(resource!=='/api/chat'||options?.method!=='POST')return originalFetch(resource,options);
    await loading;
    if(!pending.length)return originalFetch(resource,options);
    const attachments=pending.slice();
    pending=[];
    render();
    const body=JSON.parse(options.body);
    body.attachments=attachments;
    return originalFetch(resource,{...options,body:JSON.stringify(body)});
  };
})();
