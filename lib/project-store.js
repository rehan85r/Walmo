import { randomUUID } from 'node:crypto';
export function redisStore(env, fetcher = fetch) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw Object.assign(new Error('Project storage is not configured. Add the existing Redis REST URL and token in Vercel.'), { status: 503 });
  async function command(args) {
    const res = await fetcher(url, {method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(4000)});
    if(!res.ok)throw new Error('Project storage unavailable');
    const data=await res.json();if(data.error)throw new Error('Project storage unavailable');return data.result;
  }
  return {
    async read(namespace) {const raw=await command(['GET',`walmo:projects:v1:${namespace}`]);return raw?JSON.parse(raw):{projects:[]};},
    async write(namespace,data) {await command(['SET',`walmo:projects:v1:${namespace}`,JSON.stringify(data)]);},
    async lock(namespace) {
      const key=`walmo:projects:lock:${namespace}`, token=randomUUID();
      if(await command(['SET',key,token,'NX','EX',65])!=='OK')throw Object.assign(new Error('Another project action is running. Please try again shortly.'),{status:409});
      return async()=>command(['EVAL',"if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",1,key,token]);
    }
  };
}
