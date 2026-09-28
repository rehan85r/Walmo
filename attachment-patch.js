(function(){
  const fileIds=['walmoCameraInput','walmoPhotosInput','walmoFilesInput'];
  const originalFetch=window.fetch.bind(window);
  let pending=[];
  let previousLabel='';
  let loading=Promise.resolve();

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
    const input=document.getElementById('messageInput');
    if(!input)return;
    let draft=input.value;
    if(previousLabel&&draft.endsWith(previousLabel))draft=draft.slice(0,-previousLabel.length).trimEnd();
    previousLabel='📎 '+pending.map(item=>item.name).join(', ');
    input.value=draft?draft+'\n'+previousLabel:previousLabel;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.focus();
  }

  fileIds.forEach(id=>{
    const input=document.getElementById(id);
    if(!input)return;
    input.addEventListener('change',event=>{
      event.stopImmediatePropagation();
      const files=Array.from(input.files||[]);
      input.value='';
      loading=loading.then(()=>prepare(files)).catch(error=>alert(error.message));
    },true);
  });

  window.fetch=async function(resource,options){
    if(resource!=='/api/chat'||options?.method!=='POST')return originalFetch(resource,options);
    await loading;
    if(!pending.length)return originalFetch(resource,options);
    const attachments=pending.slice();
    pending=[];
    previousLabel='';
    const body=JSON.parse(options.body);
    body.attachments=attachments;
    return originalFetch(resource,{...options,body:JSON.stringify(body)});
  };
})();
