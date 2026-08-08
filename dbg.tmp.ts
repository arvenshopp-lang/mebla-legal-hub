import { toJSONAsync } from "seroval";
const APP="http://localhost:8080";
const id=(file:string,ex:string)=>Buffer.from(JSON.stringify({file:`/src/lib/${file}?tss-serverfn-split`,export:`${ex}_createServerFn_handler`}),"utf8").toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const SUPABASE_URL=process.env.SUPABASE_URL!, PUB=process.env.SUPABASE_PUBLISHABLE_KEY!;
const email=process.argv[2], pass=process.argv[3];
const t=await (await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:"POST",headers:{apikey:PUB,"content-type":"application/json"},body:JSON.stringify({email,password:pass})})).json() as any;
console.log("token?",!!t.access_token, t.error_description??"");
for (const m of ["POST","GET"]) {
  const url=`${APP}/_serverFn/${id("admin-console.functions.ts","getActivityOverview")}`;
  const body=m==="POST"?JSON.stringify(await toJSONAsync({})):undefined;
  const r=await fetch(url,{method:m,headers:{"x-tsr-serverFn":"true",Origin:APP,"content-type":"application/json",Authorization:`Bearer ${t.access_token}`},body});
  console.log(m,r.status,(await r.text()).slice(0,300));
}
