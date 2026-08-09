import { office, fixtureBase64 } from "./lib";
import { setupEnv } from "./setup";
const env = await setupEnv();
const r = await office("uploadOfficePageMedia", env.ownerA.token, {
  organizationId: env.orgA, kind: "logo", contentType: "image/jpeg", base64: await fixtureBase64("logo.jpg"),
});
console.log(JSON.stringify(r).slice(0,3000));
