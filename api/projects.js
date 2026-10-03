import { randomUUID, createHmac } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { MemWal } from '@mysten-incubation/memwal';
import { namespaceFor, createRateLimiter, send, withTimeout, savedLanguage, containsSecret } from './chat.js';
import { redisStore } from '../lib/project-store.js';
import { sourceUrl, fetchSource } from '../lib/project-sources.js';
import { analyzeProject } from '../lib/project-analysis.js';

export const config = { maxDuration: 60 };
const PREFIX='Walmo project checkpoint v1: ';
function fail(message,status=400){return Object.assign(new Error(message),{status})}
export function projectView(project){
  const {pages,...publicFields}=project;
  return publicFields;
}
export function recalledCheckpoint(result, project) {
  for(const item of Array.isArray(result?.results)?result.results:[]){
    if(typeof item?.text!=='string'||!item.text.startsWith(PREFIX))continue;
    try{const record=JSON.parse(item.text.slice(PREFIX.length));
      if(record.projectId===project.id&&record.checkId===project.checkId&&typeof record.summary==='string')return record;
    }catch{}
  }
  return null;
}
export function mergeUpdates(previous, incoming, checkedAt, baseline) {
  const map=new Map(previous.map(x=>[x.id,x]));
  for(const item of incoming){const old=map.get(item.id);map.set(item.id,{...item,status:old?.status||'pending',firstSeen:old?.firstSeen||checkedAt,lastSeen:checkedAt,baseline:old?.baseline??baseline});}
  // Bound retained history, keeping pending tasks before old informational entries.
  return [...map.values()].sort((a,b)=>Number(b.kind==='task'&&b.status==='pending')-Number(a.kind==='task'&&a.status==='pending') || b.lastSeen.localeCompare(a.lastSeen)).slice(0,80);
}
export function createProjectsHandler({env=process.env,store,createMemory=namespace=>MemWal.create({key:env.MEMWAL_PRIVATE_KEY,accountId:env.MEMWAL_ACCOUNT_ID,serverUrl:'https://relayer.memory.walrus.xyz',namespace}),fetchPage=fetchSource,analyze=analyzeProject,defer=waitUntil}={}) {
  const rateLimit=createRateLimiter();
  return async function handler(req,res){
    let cookie,unlock;
    const deadline=performance.now()+57000;
    const remaining=ceiling=>Math.max(1,Math.min(ceiling,deadline-performance.now()));
    try{
      if(!['GET','POST'].includes(req.method))return send(res,405,{success:false,error:'Method not allowed'});
      if(req.headers.origin){let host;try{host=new URL(req.headers.origin).host}catch{}if(host!==req.headers.host)throw fail('Invalid origin',403)}
      if(req.method==='POST'&&!req.headers.origin)throw fail('Origin required',403);
      if(typeof env.SESSION_SECRET!=='string'||env.SESSION_SECRET.length<32)throw fail('SESSION_SECRET is required and must contain at least 32 characters',503);
      const session=namespaceFor(req,env.SESSION_SECRET,env.NODE_ENV==='production',env);cookie=session.cookie;
      const forwarded=env.VERCEL==='1'?req.headers['x-vercel-forwarded-for']:null;
      const ip=env.VERCEL==='1'?(typeof forwarded==='string'?forwarded.split(',')[0].trim():'')||'unknown':req.socket?.remoteAddress||'unknown';
      const keys=[[`session:${session.namespace}`,60]];
      if(ip!=='unknown')keys.push([`ip:${createHmac('sha256',env.SESSION_SECRET).update(ip).digest('hex')}`,120]);
      if(req.method==='POST'&&req.body?.action==='check')keys.push([`check:${session.namespace}`,6]);
      const retryAfter=rateLimit(keys);if(retryAfter){res.setHeader('Retry-After',String(retryAfter));throw fail('Too many requests. Please try again shortly.',429)}
      const db=store||redisStore(env);
      if(req.method==='GET'){const state=await db.read(session.namespace);return send(res,200,{success:true,projects:state.projects.map(projectView)},cookie)}
      if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw fail('JSON required',415);
      if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Buffer.byteLength(JSON.stringify(req.body))>10000)throw fail('Invalid request');
      unlock=await db.lock(session.namespace);
      const state=await db.read(session.namespace);
      const body=req.body;
      const persist=async()=>{if(Buffer.byteLength(JSON.stringify(state))>3000000)throw fail('Project storage is full. Remove a project before adding more.',413);await db.write(session.namespace,state)};
      if(body.action==='add'){
        const name=typeof body.name==='string'?body.name.replace(/[\x00-\x1F\x7F]/g,'').trim():'';
        if(containsSecret(name)||!name||name.length>80||!Array.isArray(body.sources)||body.sources.length<1||body.sources.length>3||body.confirmSources!==true)throw fail('Enter a project name and 1–3 public sources you have checked belong to the project.');
        let sources;try{sources=[...new Set(body.sources.map(sourceUrl))]}catch{throw fail('Sources must be public HTTPS URLs without credentials or access tokens.')}
        if(state.projects.length>=10)throw fail('You can follow up to 10 projects in this version.');
        if(state.projects.some(p=>p.sources.some(s=>sources.includes(s))))throw fail('That source is already in your projects.');
        state.projects.unshift({id:randomUUID(),name,sources,createdAt:new Date().toISOString(),checkedAt:null,checkId:null,pages:[],summary:'',updates:[],checkMessage:'Not checked yet',memoryStatus:'not_saved',memoryEvidence:null});
        await persist();return send(res,200,{success:true,projects:state.projects.map(projectView)},cookie);
      }
      const project=state.projects.find(p=>p.id===body.projectId);if(!project)throw fail('Project not found',404);
      if(body.action==='remove'){
        state.projects=state.projects.filter(p=>p.id!==project.id);await persist();return send(res,200,{success:true,projects:state.projects.map(projectView)},cookie);
      }
      if(body.action==='task'){
        const task=project.updates.find(x=>x.id===body.taskId&&x.kind==='task');
        if(!task||!['pending','done','skipped'].includes(body.status))throw fail('Invalid task status');
        task.status=body.status;task.statusChangedAt=new Date().toISOString();await persist();
        try{const memory=createMemory(`${session.namespace}-project-${project.id}`);
          defer(withTimeout(()=>memory.remember('Walmo project task status v1: '+JSON.stringify({projectId:project.id,title:task.title,source:task.source,status:task.status,markedBy:'user',at:task.statusChangedAt})),remaining(10000),'Task memory save').catch(()=>console.error('Project task memory save failed')));
        }catch{console.error('Project task memory scheduling failed')}
        return send(res,200,{success:true,projects:state.projects.map(projectView)},cookie);
      }
      if(body.action!=='check')throw fail('Unknown action');
      if(!env.MEMWAL_PRIVATE_KEY||!env.MEMWAL_ACCOUNT_ID||!env.OPENROUTER_API_KEY)throw fail('Backend credentials are not configured',503);
      if(project.checkedAt&&Date.now()-Date.parse(project.checkedAt)<30000)throw fail('Please wait 30 seconds between checks for this project.',429);
      const previousProject=structuredClone(project);
      let checkpointCommitted=false;
      project.lastAttemptAt=new Date().toISOString();
      let memory;try{memory=createMemory(`${session.namespace}-project-${project.id}`)}catch{}
      try{
        // Fetch all explicitly selected sources. A partial failure must not advance
        // the baseline or be reported as “no new updates”.
        const [pages,checkpoint]=await Promise.all([
          Promise.all(project.sources.map(url=>fetchPage(url).catch(()=>{throw Object.assign(new Error('Unreadable project source'),{publicMessage:`Could not read ${url}. Choose a public announcement page or feed. The previous checkpoint is unchanged.`})}))),
          project.checkId&&memory?withTimeout(()=>memory.recall({query:`Walmo project checkpoint v1 ${project.checkId}`,limit:10,maxDistance:0.9}),remaining(5000),'Project memory recall').then(result=>recalledCheckpoint(result,project)).catch(()=>null):null
        ]);
        const baseline=!project.checkId;
        const unchanged=!baseline&&pages.length===project.pages.length&&pages.every((p,i)=>p.url===project.pages[i].url&&p.hash===project.pages[i].hash);
        const language=savedLanguage(req,session.sessionId,env.SESSION_SECRET);
        const result=unchanged?{summary:project.summary,updates:[]}:await withTimeout(()=>analyze({project,pages,previous:project.pages,memory:checkpoint,language,env}),remaining(27000),'Project analysis');
        const now=new Date().toISOString();
        project.pages=pages;project.summary=result.summary;project.checkedAt=now;project.checkId=randomUUID();project.lastError=null;
        project.updates=mergeUpdates(project.updates,result.updates,now,baseline);
        project.checkMessage=baseline?'Baseline saved. Future checks compare against this visit.':unchanged?'No readable source-text changes since your last successful check.':result.updates.length?'Source-backed changes found. Review the excerpts and deadlines.':'Source text changed, but no actionable update was identified. Review the sources if needed.';
        project.memoryEvidence=checkpoint?{checkedAt:checkpoint.checkedAt,summary:checkpoint.summary}:null;
        project.comparison=baseline?'baseline':checkpoint?'walrus_memory_and_source_snapshot':'source_snapshot';
        project.memoryStatus=memory?'pending':'unavailable';
        await persist();
        checkpointCommitted=true;
        if(memory){
          const record={projectId:project.id,checkId:project.checkId,name:project.name,sources:project.sources,checkedAt:now,summary:result.summary,tasks:project.updates.filter(x=>x.kind==='task').map(x=>({title:x.title,status:x.status,deadline:x.deadline})).slice(0,20)};
          const checkId=project.checkId;
          // Vercel keeps this promise alive. Confirm job completion; never turn an
          // accepted job into a “saved” badge without the job finishing.
          // Release the request lock before the background status update starts.
          await unlock();unlock=null;
          try { defer((async()=>{
            let status='unconfirmed';
            try{await withTimeout(async()=>{const job=await memory.remember(PREFIX+JSON.stringify(record));await memory.waitForRememberJob(job.job_id)},remaining(12000),'Project checkpoint save');status='saved'}catch{console.error('Project checkpoint save not confirmed')}
            let release;
            try{release=await db.lock(session.namespace);const fresh=await db.read(session.namespace);const p=fresh.projects.find(x=>x.id===project.id);if(p?.checkId===checkId){p.memoryStatus=status;await db.write(session.namespace,fresh)}}catch{console.error('Project memory status update unavailable')}finally{if(release)await release().catch(()=>{})}
          })()); } catch { console.error('Project checkpoint scheduling failed'); }
        }
      }catch(error){
        if(checkpointCommitted)throw error;
        const attemptAt=project.lastAttemptAt;
        for(const key of Object.keys(project))delete project[key];
        Object.assign(project,previousProject,{lastAttemptAt:attemptAt});
        project.lastError=error.publicMessage||'Check incomplete. A source could not be read or its extracted update could not be verified. Your previous successful checkpoint is unchanged.';
        await persist();console.error('Project check failed:',error.message);
        return send(res,502,{success:false,error:project.lastError,projects:state.projects.map(projectView)},cookie);
      }
      return send(res,200,{success:true,projects:state.projects.map(projectView)},cookie);
    }catch(error){console.error('Projects request failed:',error.message);return send(res,error.status||502,{success:false,error:error.status?error.message:'Project service temporarily unavailable'},cookie)}
    finally{if(unlock)await unlock().catch(()=>{})}
  };
}
export default createProjectsHandler();
