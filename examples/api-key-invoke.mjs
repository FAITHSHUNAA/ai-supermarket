const base = process.env.BASE_URL || "http://127.0.0.1:8787";
const apiKey = process.env.API_KEY || "sk_live_demo_zhouheng_market_key";

const response = await fetch(`${base}/v1/chat/completions`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "idempotency-key": `example-${Date.now()}`,
  },
  body: JSON.stringify({
    model: "stall-chat-flash",
    messages: [{ role: "user", content: "用一句话说明积分预扣。" }],
  }),
});

const body = await response.json();
if (!response.ok) {
  console.error(response.status, body);
  process.exit(1);
}
console.log(body.choices[0].message.content);
console.log("points", body.points_charged);
