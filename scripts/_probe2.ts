import { toJSONAsync } from "seroval";
const APP="http://localhost:8080";
const src = await (await fetch(`${APP}/src/lib/admin-console.functions.ts`)).text();
const re=/export const (\w+) = createServerFn\(\{\s*method:\s*"(\w+)"[\s\S]*?createClientRpc\("([^"]+)"\)/g;
let m; const map:Record<string,{method:string,id:string}>={};
while((m=re.exec(src))) map[m[1]!]={method:m[2]!,id:m[3]!};
const SUPABASE_URL=process.env["SUPABASE_URL"]!, SK=process.env["SUPABASE_SERVICE_ROLE_KEY"]!, PK=process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const email="qa.probe.owner@mehlaqa.test", password="Qa!probe12345678";
const h={apikey:SK,Authorization:`Bearer ${SK}`,"content-type":"application/json"};
const lu=await (await fetch(`${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,{headers:h})).json() as any;
for(const u of lu.users??[]) if(u.email===email){await fetch(`${SUPABASE_URL}/rest/v1/platform_staff?user_id=eq.${u.id}`,{method:"DELETE",headers:h}); await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.id}`,{method:"DELETE",headers:h});}
const cu=await (await fetch(`${SUPABASE_URL}/auth/v1/admin/users`,{method:"POST",headers:h,body:JSON.stringify({email,password,email_confirm:true})})).json() as any;
await fetch(`${SUPABASE_URL}/rest/v1/platform_staff`,{method:"POST",headers:h,body:JSON.stringify({user_id:cu.id,full_name:"QA PROBE",email,role:"super_admin",status:"active",permissions:[]})});
const tk=await (await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:"POST",headers:{apikey:PK,"content-type":"application/json"},body:JSON.stringify({email,password})})).json() as any;
const e=map["getActivityOverview"]!;
const headers:Record<string,string>={"x-tsr-serverFn":"true",accept:"application/x-tss-framed;v=1, application/x-ndjson, application/json",Authorization:`Bearer ${tk.access_token}`,Origin:APP};
let body:string|undefined;
if(e.method==="POST"){ body=JSON.stringify(await toJSONAsync({})); }
const r=await fetch(`${APP}/_serverFn/${e.id}`,{method:e.method,headers,body});
const t=await r.text();
console.log(r.status, r.headers.get("content-type"), t.slice(0,400));
await fetch(`${SUPABASE_URL}/rest/v1/platform_staff?user_id=eq.${cu.id}`,{method:"DELETE",headers:h});
await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${cu.id}`,{method:"DELETE",headers:h});
