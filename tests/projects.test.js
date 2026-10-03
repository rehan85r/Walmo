import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createProjectsHandler, recalledCheckpoint, mergeUpdates } from '../api/projects.js';
import { validateAnalysis } from '../lib/project-analysis.js';
import { sourceUrl, publicAddress, fetchSource, pageText, digest } from '../lib/project-sources.js';
import { namespaceFor, createChatHandler } from '../api/chat.js';

const env={SESSION_SECRET:'test-only-secret-'.repeat(3),OPENROUTER_API_KEY:'mock',MEMWAL_PRIVATE_KEY:'mock',MEMWAL_ACCOUNT_ID:'mock',VERCEL:'1'};
function req(body,cookie=''){return {method:body?'POST':'GET',headers:{host:'walmo.test',origin:'https://walmo.test','content-type':'application/json',cookie},body}}
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v},json(d){this.data=d;return d}}}
function fixture({badSource=false,recallFails=false,saveFails=false}={}){
 const docs=new Map(),locks=new Set(),records=[],jobs=[],analysis=[];let content='Alpha released a public testnet. Complete the public feedback form by October 8. '+ 'Public announcements. '.repeat(8);
 const store={async read(ns){return structuredClone(docs.get(ns)||{projects:[]})},async write(ns,data){docs.set(ns,structuredClone(data))},async lock(ns){if(locks.has(ns))throw Object.assign(Error('locked'),{status:409});locks.add(ns);return async()=>locks.delete(ns)}};
 const handler=createProjectsHandler({env,store,defer:p=>jobs.push(p),createMemory:ns=>({recall:async()=>{if(recallFails)throw Error('offline');return {results:records.filter(x=>x.ns===ns).map(x=>({text:x.text}))}},remember:async text=>{records.push({ns,text});return {job_id:'job'}},waitForRememberJob:async()=>{if(saveFails)throw Error('failed');return {status:'completed'}}}),fetchPage:async url=>{if(badSource)throw Error('blocked');return {url,text:content,hash:digest(content)}},analyze:async args=>{analysis.push(args);return {summary:args.memory?'Compared with remembered baseline.':'Initial source summary.',updates:[{id:'task1',title:'Submit feedback',kind:'task',detail:'Public task',quote:'Complete the public feedback form by October 8.',source:args.pages[0].url,deadline:'October 8',status:'pending'}]}}});
 let cookie='';
 return {docs,records,jobs,analysis,store,setContent(x){content=x},async call(body){const r=res();await handler(req(body,cookie),r);if(r.headers['Set-Cookie'])cookie=r.headers['Set-Cookie'].split(';')[0];await Promise.all(jobs);return r},age(){for(const value of docs.values())for(const p of value.projects)p.checkedAt='2020-01-01T00:00:00.000Z'}};
}
const add={action:'add',name:'Alpha',sources:['https://example.org/announcements'],confirmSources:true};
test('SSRF guards reject private networks, mapped IPs, secrets, unsafe URLs and DNS rebinding',async()=>{
 for(const ip of ['127.0.0.1','10.1.1.1','169.254.169.254','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('8.8.8.8'),true);
 for(const url of ['http://example.org','https://localhost','https://user:pass@example.org','https://127.0.0.1','https://example.org:9000','https://example.org?token=abc'])assert.throws(()=>sourceUrl(url));
 await assert.rejects(fetchSource('https://example.org',{resolve:async()=>[{address:'127.0.0.1',family:4}],request:()=>{throw Error('must not fetch')}}),/non-public/);
});
test('HTML extraction removes executable/navigation noise and source evidence must match',()=>{
 assert.equal(pageText('<nav>noise</nav><main><h1>Hello</h1><script>evil()</script><p> news</p></main>','text/html'),'Hello news');
 const pages=[{url:'https://example.org',text:'The feedback form opens today. Deadline is October 8.'}];
 const item={title:'Feedback',detail:'A form is open.',kind:'task',source:pages[0].url,quote:'The feedback form opens today.',deadline:'October 8'};
 assert.equal(validateAnalysis({summary:'Summary',updates:[item]},pages).updates.length,1);
 assert.throws(()=>validateAnalysis({summary:'Summary',updates:[{...item,source:'https://evil.org'}]},pages));
 assert.throws(()=>validateAnalysis({summary:'Summary',updates:[{...item,quote:'Invented announcement that was never published.'}]},pages));
 assert.throws(()=>validateAnalysis({summary:'Summary',updates:[{...item,deadline:'Tomorrow at 5 UTC'}]},pages));
});
test('add, baseline, real checkpoint recall, change, done/skip and removal work without fake stats',async()=>{
 const f=fixture();let r=await f.call(add);assert.equal(r.statusCode,200);const id=r.data.projects[0].id;
 r=await f.call({action:'check',projectId:id});assert.equal(r.data.projects[0].comparison,'baseline');assert.equal(r.data.projects[0].updates[0].baseline,true);
 r=await f.call();assert.equal(r.data.projects[0].memoryStatus,'saved');assert.equal('pages' in r.data.projects[0],false);
 await f.call({action:'task',projectId:id,taskId:'task1',status:'done'});
 f.age();f.setContent('New announced requirements. '+ 'Read these public source details. '.repeat(8));
 r=await f.call({action:'check',projectId:id});assert.equal(r.data.projects[0].comparison,'walrus_memory_and_source_snapshot');assert.equal(r.data.projects[0].updates[0].status,'done');assert.ok(f.analysis.at(-1).memory);
 r=await f.call({action:'task',projectId:id,taskId:'task1',status:'skipped'});assert.equal(r.data.projects[0].updates[0].status,'skipped');
 r=await f.call({action:'remove',projectId:id});assert.deepEqual(r.data.projects,[]);
});
test('unchanged sources do not call the model again and preserve tasks',async()=>{
 const f=fixture();const id=(await f.call(add)).data.projects[0].id;await f.call({action:'check',projectId:id});f.age();const r=await f.call({action:'check',projectId:id});assert.equal(f.analysis.length,1);assert.match(r.data.projects[0].checkMessage,/No readable/);assert.equal(r.data.projects[0].updates.length,1);
});
test('blocked source never becomes a successful empty update check',async()=>{
 const f=fixture({badSource:true});const id=(await f.call(add)).data.projects[0].id;const r=await f.call({action:'check',projectId:id});assert.equal(r.statusCode,502);assert.equal(r.data.projects[0].checkedAt,null);assert.equal(f.records.length,0);
});
test('recall outage falls back honestly and unsuccessful save is not called completed',async()=>{
 const f=fixture({recallFails:true,saveFails:true});const id=(await f.call(add)).data.projects[0].id;await f.call({action:'check',projectId:id});let r=await f.call();assert.equal(r.data.projects[0].memoryStatus,'unconfirmed');f.age();r=await f.call({action:'check',projectId:id});assert.equal(r.data.projects[0].comparison,'source_snapshot');assert.equal(r.data.projects[0].memoryEvidence,null);
});
test('stale or unrelated recalled checkpoints are not used',()=>{
 const project={id:'p',checkId:'current'};const text='Walmo project checkpoint v1: '+JSON.stringify({projectId:'p',checkId:'old',summary:'old'});assert.equal(recalledCheckpoint({results:[{text}]},project),null);
});
test('Google namespace isolation and cross-origin mutation rejection',async()=>{
 function cookie(sub){const payload=Buffer.from(JSON.stringify({sub,exp:Date.now()+100000})).toString('base64url');return 'walmo_google_session='+payload+'.'+createHmac('sha256',env.SESSION_SECRET).update('google-session:'+payload).digest('hex')}
 const a=namespaceFor(req(null,cookie('123456789012')),env.SESSION_SECRET,false,env).namespace;
 assert.equal(a,namespaceFor(req(null,cookie('123456789012')),env.SESSION_SECRET,false,env).namespace);
 assert.notEqual(a,namespaceFor(req(null,cookie('223456789012')),env.SESSION_SECRET,false,env).namespace);
 const r=res(),request=req(add);request.headers.origin='https://evil.test';await createProjectsHandler({env})(request,r);assert.equal(r.statusCode,403);
});
test('chat no longer saves tutor logs or receives historical tutor instructions',async()=>{
 const deferred=[],saved=[];let n=0,main;
 const handler=createChatHandler({env,defer:p=>deferred.push(p),createMemory:()=>({recall:async()=>({results:[{text:'Web3 learning log: the user asked to learn about Wallets.'},{text:'User prefers concise replies.'}]}),analyze:async text=>saved.push(text),remember:()=>assert.fail('Tutor remember must be removed')}),fetchAI:async(url,options)=>{const body=JSON.parse(options.body);n++;if(n===2)main=body;return {ok:true,json:async()=>({choices:[{message:{content:n===1?'{}':'A normal helpful reply.'}}]})}}});
 const r=res();await handler(req({message:'Explain wallets briefly.'}),r);await Promise.all(deferred);assert.equal(r.statusCode,200);assert.equal(r.data.memoriesUsed.length,1);assert.doesNotMatch(main.messages[0].content,/Tutor mode:|Web3 learning log/);assert.equal(saved.length,1);
});
