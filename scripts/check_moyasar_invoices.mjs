import https from "node:https";

const secretKey = "sk_live_rjJxKAdP4e2Jipa3vnXVrmNmDwvA7mJadxuaNb7P";
const authHeader = "Basic " + Buffer.from(secretKey + ":").toString("base64");

console.log("Checking Moyasar Invoices list endpoint with live key...");

const req = https.request(
  {
    hostname: "api.moyasar.com",
    path: "/v1/invoices?per=1",
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
      console.log("Invoices Endpoint Status:", res.statusCode);
      try {
        const json = JSON.parse(data);
        console.log("Invoices Response:", JSON.stringify(json, null, 2));
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
