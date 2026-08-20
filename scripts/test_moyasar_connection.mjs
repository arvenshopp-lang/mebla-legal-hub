import https from "node:https";

const secretKey = "sk_live_rjJxKAdP4e2Jipa3vnXVrmNmDwvA7mJadxuaNb7P";
const authHeader = "Basic " + Buffer.from(secretKey + ":").toString("base64");

console.log("Testing Moyasar Live API connection...");

const req = https.request(
  {
    hostname: "api.moyasar.com",
    path: "/v1/payments?per=1",
    method: "GET",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
  },
  (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      console.log("HTTP Status:", res.statusCode);
      try {
        const json = JSON.parse(data);
        console.log("Response:", JSON.stringify(json, null, 2));
      } catch {
        console.log("Raw Response:", data);
      }
    });
  }
);

req.on("error", (err) => {
  console.error("Connection Error:", err.message);
});

req.end();
