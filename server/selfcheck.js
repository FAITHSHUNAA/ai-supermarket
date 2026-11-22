const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const port = 8791;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-market-"));
const base = `http://127.0.0.1:${port}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function jar() {
  const cookies = new Map();
  return async function request(urlPath, options = {}) {
    const headers = new Headers(options.headers || {});
    if (cookies.size) headers.set("cookie", [...cookies].map(([key, value]) => `${key}=${value}`).join("; "));
    if (options.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await fetch(base + urlPath, {
      method: options.method || "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    for (const line of typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : []) {
      const pair = line.split(";")[0];
      const index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json, text, headers: response.headers };
  };
}

async function main() {
  const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });
  try {
    await waitForHealth();
    const api = jar();
    const health = await api("/v1/health");
    assert(health.status === 200 && health.json.ok, "health");
    const spec = await api("/openapi.json");
    const keys = spec.json.paths["/v1/developer/api-keys"];
    assert(keys.get && keys.post, "OpenAPI documents both key operations");
    for (const name of ["api-key-invoke.mjs", "oauth-pkce.mjs"]) {
      const example = await api(`/examples/${name}`);
      assert(example.status === 200 && example.text === fs.readFileSync(path.join(__dirname, "../examples", name), "utf8"), "download " + name);
    }

    const models = await api("/v1/platform/models");
    assert(models.json.items.length >= 7, "models");
    const apps = await api("/v1/platform/apps?page_size=20");
    assert(apps.json.items.length >= 8, "apps");
    const plans = await api("/v1/platform/membership-plans");
    assert(plans.json.items.length === 4, "plans");

    const captcha = await api("/v1/auth/captcha/challenge");
    const otp = await api("/v1/auth/register/otp", { method: "POST", body: { phone: "13900000009" } });
    assert(otp.json.demo_code, "demo otp");
    const registered = await api("/v1/auth/register", {
      method: "POST",
      body: {
        phone: "13900000009",
        password: "Register#123",
        otp: otp.json.demo_code,
        captcha_id: captcha.json.captcha_id,
        captcha_answer: captcha.json.prompt.split("+").reduce((sum, part) => sum + Number(part), 0),
        privacy_accepted: true,
        invite_code: "LINXIAO1",
        name: "新客",
      },
    });
    assert(registered.status === 200, `register ${registered.status} ${registered.text}`);

    const userApi = jar();
    const login = await userApi("/v1/auth/login", { method: "POST", body: { phone: "13800000002", password: "User#123456" } });
    assert(login.status === 200, `login ${login.text}`);
    const before = await userApi("/v1/user/wallet");
    const recharge = await userApi("/v1/auth/payments/recharge-package", {
      method: "POST",
      body: { package_id: "pkg_10", channel: "wechat", coupon_code: "WELCOME100" },
    });
    assert(recharge.status === 200, `recharge ${recharge.text}`);
    const paid = await userApi(`/v1/payments/orders/${recharge.json.order.out_trade_no}/confirm`, { method: "POST", body: {} });
    assert(paid.json.order.status === "paid", "paid");
    const after = await userApi("/v1/user/wallet");
    assert(after.json.wallet.points === before.json.wallet.points + 1100, `points ${before.json.wallet.points} -> ${after.json.wallet.points}`);

    const purchase = await userApi("/v1/auth/app-purchases/orders", { method: "POST", body: { client_id: "app_trans", channel: "points" } });
    assert(purchase.json.status === "paid", `purchase ${purchase.text}`);

    const dev = jar();
    const devLogin = await dev("/v1/auth/login", { method: "POST", body: { phone: "13800000003", password: "Dev#123456" } });
    assert(devLogin.status === 200, "dev login");
    const createdKey = await dev("/v1/developer/api-keys", { method: "POST", body: { name: "自检钥匙" } });
    const pending = await fetch(base + "/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${createdKey.json.api_key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "stall-chat-flash", messages: [{ role: "user", content: "你好" }] }),
    });
    assert(pending.status === 409, `pending key ${pending.status}`);
    const confirmed = await dev(`/v1/developer/api-keys/${createdKey.json.key.id}/confirm-delivery`, { method: "POST", body: {} });
    assert(confirmed.status === 200, `confirm ${confirmed.text}`);

    const both = await fetch(base + "/v1/platform/models", { headers: { authorization: "Bearer sk_live_x", "x-api-key": "sk_live_y" } });
    assert(both.status === 400, "ambiguous");

    const chat = await fetch(base + "/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer sk_live_demo_zhouheng_market_key",
        "content-type": "application/json",
        "idempotency-key": "selfcheck-1",
      },
      body: JSON.stringify({ model: "stall-chat-flash", messages: [{ role: "user", content: "帮我写一句开场" }] }),
    });
    const chatBody = await chat.json();
    assert(chat.status === 200 && chatBody.choices[0].message.content, `chat ${chat.status} ${JSON.stringify(chatBody)}`);
    const replay = await fetch(base + "/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: "Bearer sk_live_demo_zhouheng_market_key",
        "content-type": "application/json",
        "idempotency-key": "selfcheck-1",
      },
      body: JSON.stringify({ model: "stall-chat-flash", messages: [{ role: "user", content: "第二次不应再扣费" }] }),
    });
    assert(replay.status === 200, "replay");

    const blocked = await fetch(base + "/v1/chat/completions", {
      method: "POST",
      headers: { authorization: "Bearer sk_live_demo_zhouheng_market_key", "content-type": "application/json" },
      body: JSON.stringify({ model: "stall-chat-flash", messages: [{ role: "user", content: "这里有违禁演示词" }] }),
    });
    assert(blocked.status === 400, `blocked ${blocked.status}`);

    const reserve = await dev("/v1/points/reserve", { method: "POST", body: { points: 3, reason: "自检预扣" } });
    assert(reserve.status === 200, `reserve ${reserve.text}`);
    const released = await dev("/v1/points/release", { method: "POST", body: { reservation_id: reserve.json.reservation_id } });
    assert(released.json.status === "released", "release");

    const data = await fetch(base + "/v1/data/demo-feed/hot-list", { headers: { authorization: "Bearer sk_live_demo_zhouheng_market_key" } });
    assert(data.status === 200 && data.headers.get("x-idp-points-charged") === "6", `data ${data.status}`);

    const verifier = "selfcheck-verifier-value-1234567890";
    const challenge = crypto.createHash("sha256").update(verifier).digest().toString("base64url");
    const approved = await userApi("/v1/oauth/authorize/approve", {
      method: "POST",
      body: {
        client_id: "app_copy",
        redirect_uri: "http://127.0.0.1:8787/oauth/callback",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "xyz",
      },
    });
    assert(approved.status === 200, `oauth approve ${approved.text}`);
    const token = await api("/v1/oauth/token", {
      method: "POST",
      body: {
        grant_type: "authorization_code",
        code: approved.json.code,
        client_id: "app_copy",
        client_secret: "sec_demo_copy_shelf",
        redirect_uri: "http://127.0.0.1:8787/oauth/callback",
        code_verifier: verifier,
      },
    });
    assert(token.status === 200 && token.json.access_token, `token ${token.text}`);
    const info = await fetch(base + "/v1/oauth/userinfo", { headers: { authorization: `Bearer ${token.json.access_token}` } });
    assert(info.status === 200, "userinfo");

    const admin = jar();
    const adminLogin = await admin("/v1/auth/login", { method: "POST", body: { phone: "13800000001", password: "Admin#123456" } });
    assert(adminLogin.status === 200 && adminLogin.json.user.role === "admin", "admin");
    const appDraft = await dev("/v1/developer/clients", {method:"POST", body:{name:"交付验收", summary:"测试资源交付"}});
    const clientId = appDraft.json.client.client_id;
    const offerUrl = `/v1/developer/clients/${clientId}/commercial-offer`;
    const detailUrl = `/v1/platform/apps/${clientId}`;
    const submit = body => dev(offerUrl, {method:"POST", body});
    const review = (id, approve, reason) => admin("/v1/admin/actions", {method:"POST", body:{type:"offer.review", id, approve, reason}});
    const listing = {format:"resource", contents:"模板 v1", usage:"导入模板", limits:"无额外费用", privacy:"无需上传", license:"个人使用", support:"站内售后", specification:"PDF 一份", delivery_url:"https://example.org/download", rights_confirmed:true};
    assert((await api(detailUrl)).status === 404, "draft hidden");
    assert((await submit({price_points:0})).status === 400, "listing required");
    const saved = await dev(offerUrl,{method:"PUT",body:{step:2,listing,price:"0",review_notes:"private-review"}});
    assert(saved.json.revision === 1 && (await dev(offerUrl)).json.draft.step === 2,"resume server draft");
    assert((await dev(offerUrl,{method:"PUT",body:{revision:0}})).status === 409,"reject stale draft save");
    const proposal = {price_points:0, listing,review_notes:"private-review"};
    const firstOffer = await submit(proposal);
    assert(firstOffer.status === 201 && (await submit(proposal)).status === 409, "single pending listing");
    assert((await review(firstOffer.json.id,false,"补充交付说明")).json.reason === "补充交付说明", "rejection feedback");
    const revised = await submit(proposal);
    assert((await review(revised.json.id,true)).status === 200, "approved listing");
    const publicDetail = await api(detailUrl);
    assert(publicDetail.json.commercial_offer.listing.format === "resource" && !publicDetail.text.includes(listing.delivery_url), "public description without delivery");
    const opened = await userApi("/v1/auth/app-purchases/orders", {method:"POST", body:{client_id:clientId,channel:"points"}});
    assert(opened.status < 300 && (await userApi(detailUrl)).json.delivery_url === listing.delivery_url, "entitled delivery");
    const nextOffer = await submit({...proposal,listing:{...listing,delivery_url:"https://example.org/v2",license:"团队版"}});
    assert((await review(nextOffer.json.id,true)).status===200,"approve second version");
    assert((await userApi(detailUrl)).json.delivery_url===listing.delivery_url,"original delivery after update");
    assert(!publicDetail.text.includes("private-review") && !(await userApi("/v1/auth/apps")).text.includes("private-review"),"review materials isolated");
    const hidden = await admin("/v1/admin/actions",{method:"POST",body:{type:"client.status",client_id:clientId,status:"unlisted"}});
    assert(hidden.status===200 && (await api(detailUrl)).status===404,"unlisted from public store");
    const history = (await userApi("/v1/auth/apps")).json.items.find(item=>item.clientId===clientId);
    assert(history.snapshot.listing.delivery_url===listing.delivery_url && history.snapshot.listing.license===listing.license,"historical fulfillment after delisting");
    const snap = await admin("/v1/admin/snapshot");
    assert(snap.status === 200 && snap.json.users.length >= 4, "snapshot");
    const reviewed = await admin("/v1/admin/actions", {
      method: "POST",
      body: { type: "developer.review", user_id: "usr_pending", approve: true },
    });
    assert(reviewed.json.developerStatus === "approved", `review ${reviewed.text}`);

    const poor = await fetch(base + "/v1/chat/completions", {
      method: "POST",
      headers: { cookie: "", "content-type": "application/json" },
      body: JSON.stringify({ model: "stall-image", messages: [] }),
    });
    assert(poor.status === 401, "anon");

    console.log("selfcheck ok");
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    console.error(logs.slice(-4000));
    process.exitCode = 1;
  } finally {
    child.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

async function waitForHealth() {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      const response = await fetch(base + "/v1/health");
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error("server did not start");
}

main();
