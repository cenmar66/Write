// Fake Supabase auth (only what the proxy + browser client need). Local verification only.
import http from "node:http";
const USER = { id: "11111111-1111-1111-1111-111111111111", email: "owner@example.com", aud: "authenticated", role: "authenticated" };
http
  .createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") return res.end();
    if (req.url.startsWith("/auth/v1/user")) {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(USER));
    }
    // Everything else (REST, realtime) is "down": the planner must keep working without it.
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ message: "fake backend: unavailable" }));
  })
  .listen(54400, () => console.log("fake auth on 54400"));
