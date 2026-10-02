import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createChatHandler, namespaceFor, sanitizeTopic } from '../api/chat.js';
import { createProgressHandler, extractTopics } from '../api/progress.js';
const env = { SESSION_SECRET:'x'.repeat(32),MEMWAL_PRIVATE_KEY:'mock',MEMWAL_ACCOUNT_ID:'mock',OPENROUTER_API_KEY:'mock',VERCEL:'1' };
const request = (method='POST', message='Explain gas fees simply.', cookie='') => ({method,headers:{host:'walmo.test',origin:'https://walmo.test','content-type':'application/json',cookie},body:{message}});
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},json(data){this.data=data;return data}}}
async function chat({message, classification={topic:'gas fees'}, recallFails=false, saveFails=false}={}){
  const deferred=[],calls=[],prompts=[];let n=0;
  const memory={recall:async()=>{if(recallFails)throw Error('mock recall');return {results:[{text:'Web3 learning log: the user asked to learn about wallets.',blob_id:'real-mock-id'}]}},analyze:async text=>{calls.push(['analyze',text]);if(saveFails)throw Error('mock save')},remember:async text=>{calls.push(['remember',text]);if(saveFails)throw Error('mock save')}};
  const handler=createChatHandler({env,createMemory:()=>memory,defer:p=>deferred.push(p),fetchAI:async(url,options)=>{
    prompts.push(JSON.parse(options.body));n++;
    return {ok:true,json:async()=>({choices:[{message:{content:n===1?(typeof classification==='string'?classification:JSON.stringify(classification)):'Gas pays for processing. Like paying postage. What does gas pay for?'}}]})};
  }});
  const res=response();await handler(request('POST',message),res);await Promise.all(deferred);return {res,calls,prompts};
}
test('learning topic is sanitized and saved after reply; tutor instructions and recalled context present',async()=>{
 const {res,calls,prompts}=await chat({classification:{topic:'Gas fees<script>'}});
 assert.equal(res.statusCode,200);assert.equal(res.data.memoriesUsed.length,1);
 assert.deepEqual(calls.map(x=>x[0]),['analyze','remember']);assert.equal(calls[1][1],'Web3 learning log: the user asked to learn about Gas feesscript.');
 assert.match(prompts[1].messages[0].content,/Tutor mode:/);assert.match(prompts[1].messages[0].content,/one short check question/);
});
test('missing topic, invalid classifier and recall failure preserve normal reply',async()=>{
 for(const opts of [{classification:{}},{classification:'invalid JSON'},{classification:{topic:42}},{recallFails:true}]){
  const {res,calls}=await chat(opts);assert.equal(res.statusCode,200);
  if(opts.recallFails)assert.deepEqual(res.data.memoriesUsed,[]);else assert.ok(!calls.some(x=>x[0]==='remember'));
 }
});
test('secrets suppress both saves, public Sui IDs do not',async()=>{
 for(const message of ['suiprivkey1abcdef', 'a'.repeat(64), 'seed phrase: '+ 'word '.repeat(12)]){
  const {res,calls}=await chat({message});assert.equal(res.statusCode,200);assert.deepEqual(calls,[]);
 }
 const {calls}=await chat({message:'Explain this public ID: 0x'+'a'.repeat(64)});assert.equal(calls.length,2);
});
test('save failures do not break chat',async()=>assert.equal((await chat({saveFails:true})).res.statusCode,200));
test('topic extraction filters, deduplicates and orders actual timestamps',()=>{
 assert.deepEqual(extractTopics([{text:'unrelated'},{text:'Web3 learning log: the user asked to learn about wallets.',created_at:'2026-01-01'},{text:'Web3 learning log: the user asked to learn about gas fees.',created_at:'2026-02-01'},{text:'Web3 learning log: the user asked to learn about GAS FEES.'},{text:'Web3 learning log corrupt'}]),['gas fees','wallets']);
 assert.equal(sanitizeTopic('a'.repeat(100)).length,60);assert.deepEqual(extractTopics(null),[]);
});
test('progress uses identical namespace and documented recall query, no-store and cookie',async()=>{
 let ns,query;const handler=createProgressHandler({env,createMemory:n=>{ns=n;return {recall:async q=>{query=q;return {results:[{text:'Web3 learning log: the user asked to learn about wallets.'}]}}}}});
 const res=response();await handler(request('GET'),res);assert.equal(res.statusCode,200);assert.equal(res.headers['Cache-Control'],'no-store');
 const cookie=res.headers['Set-Cookie'].split(';')[0];assert.equal(ns,namespaceFor(request('GET','',cookie),env.SESSION_SECRET,false,env).namespace);
 assert.deepEqual(query,{query:'Web3 learning log',limit:20,maxDistance:0.9});assert.deepEqual(res.data,{success:true,topics:['wallets']});
});
test('Google namespaces stable across browser sessions and isolated across accounts',()=>{
 function google(sub){const payload=Buffer.from(JSON.stringify({sub,exp:Date.now()+100000})).toString('base64url');const sig=createHmac('sha256',env.SESSION_SECRET).update('google-session:'+payload).digest('hex');return 'walmo_google_session='+payload+'.'+sig}
 const a=namespaceFor(request('GET','',google('123456789012')),env.SESSION_SECRET,false,env).namespace;
 assert.equal(a,namespaceFor(request('GET','',google('123456789012')),env.SESSION_SECRET,false,env).namespace);
 assert.notEqual(a,namespaceFor(request('GET','',google('223456789012')),env.SESSION_SECRET,false,env).namespace);
});
test('progress rejects origin/method, returns clean failures, skips shared unknown-IP bucket',async()=>{
 const handler=createProgressHandler({env,createMemory:()=>({recall:async()=>({results:[]})})});
 for(let i=0;i<65;i++){const res=response();await handler(request('GET'),res);assert.equal(res.statusCode,200)}
 const first=response();await handler(request('GET'),first);const cookie=first.headers['Set-Cookie'].split(';')[0];let res;
 for(let i=0;i<21;i++){res=response();await handler(request('GET','',cookie),res)}assert.equal(res.statusCode,429);
 const bad=request('GET');bad.headers.origin='https://evil.test';res=response();await handler(bad,res);assert.equal(res.statusCode,403);
 res=response();await handler(request('POST'),res);assert.equal(res.statusCode,405);
 res=response();await createProgressHandler({env,createMemory:()=>{throw Error('offline')}})(request('GET'),res);assert.equal(res.statusCode,502);assert.equal(res.data.success,false);
});
