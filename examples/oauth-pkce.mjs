import crypto from "node:crypto";
import fs from "node:fs";

const base = process.env.BASE_URL || "http://127.0.0.1:8787";
const stateFile = new URL("./.oauth-verifier", import.meta.url);
const verifier = process.env.CODE && fs.existsSync(stateFile) ? fs.readFileSync(stateFile, "utf8") : crypto.randomBytes(32).toString("base64url");
if (!process.env.CODE) fs.writeFileSync(stateFile, verifier);
const challenge = crypto.createHash("sha256").update(verifier).digest().toString("base64url");
const redirectUri = "http://127.0.0.1:8787/oauth/callback";

const authorize = new URL("/oauth/authorize", base);
authorize.searchParams.set("client_id", "app_copy");
authorize.searchParams.set("redirect_uri", redirectUri);
authorize.searchParams.set("code_challenge", challenge);
authorize.searchParams.set("code_challenge_method", "S256");
authorize.searchParams.set("state", "demo");

console.log("先用浏览器登录并打开：");
console.log(authorize.toString());
console.log("同意后，把地址栏里的 code 赋给环境变量 CODE，再运行后半段。");

if (!process.env.CODE) process.exit(0);

const token = await fetch(`${base}/v1/oauth/token`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    grant_type: "authorization_code",
    code: process.env.CODE,
    client_id: "app_copy",
    client_secret: process.env.CLIENT_SECRET || "sec_demo_copy_shelf",
    redirect_uri: redirectUri,
    code_verifier: verifier,
  }),
});
console.log(token.status, await token.json());
