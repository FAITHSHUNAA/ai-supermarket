const domain = require("../domain");
const { asyncRoute } = require("../http");
const { HttpError } = require("../lib");

function mount(app, ctx) {
  app.post("/v1/chat/completions", asyncRoute((req, res) => invoke(ctx, req, res, "chat")));
  app.post("/v1/embeddings", asyncRoute((req, res) => invoke(ctx, req, res, "embedding")));
  app.post("/v1/images/generations", asyncRoute((req, res) => invoke(ctx, req, res, "image")));
  app.post("/v1/images/edits", asyncRoute((req, res) => invoke(ctx, req, res, "image")));
  app.post(
    "/v1/audio/transcriptions",
    asyncRoute((req, res) => invoke(ctx, req, res, "asr", req.body && req.body.model ? req.body.model : "stall-asr"))
  );
  app.post("/v1/developer/models/:modelKey/invoke", asyncRoute((req, res) => invoke(ctx, req, res, null, req.params.modelKey, req.body.input || req.body)));
  app.post("/v1/models/:modelId/invoke", asyncRoute((req, res) => invoke(ctx, req, res, null, req.params.modelId, req.body.input || req.body)));

  app.get("/v1/generated-images/:token", (req, res) => {
    const row = ctx.get().images.find((item) => item.token === req.params.token);
    if (!row) return res.status(404).json({ error: "image_not_found", message: "图片不存在或已过期" });
    res.type("image/svg+xml").send(row.svg);
  });

  app.get("/v1/voices", (req, res) => {
    res.json({ items: ctx.get().voices.filter((item) => item.enabled) });
  });

  app.get("/v1/developer/voices", (req, res) => {
    domain.requireDeveloper(domain.resolveActor(ctx.get(), req));
    res.json({ items: ctx.get().voices });
  });

  app.patch(
    "/v1/developer/voices/:voiceId",
    asyncRoute(async (req, res) => {
      const voice = await ctx.mutate((db) => {
        domain.requireDeveloper(domain.resolveActor(db, req));
        const row = db.voices.find((item) => item.id === req.params.voiceId);
        if (!row) throw new HttpError(404, "voice_not_found", "音色不存在");
        if (req.body.name) row.name = String(req.body.name).slice(0, 40);
        if (req.body.enabled !== undefined) row.enabled = Boolean(req.body.enabled);
        return row;
      });
      res.json(voice);
    })
  );

  app.patch("/v1/voices/:voiceId", (req, res, next) => {
    req.url = `/v1/developer/voices/${req.params.voiceId}`;
    app.handle(req, res, next);
  });
}

async function invoke(ctx, req, res, expected, modelKey = req.body.model, input = req.body) {
  const idem = req.get("idempotency-key") || (req.body && req.body.idempotency_key);
  const pre = domain.resolveActor(ctx.get(), req);
  if (!pre.user) throw new HttpError(401, "login_required", "请先登录或提供 API Key");
  if (idem) {
    const hit = ctx.get().idempotency.find((item) => item.key === idem && item.userId === pre.user.id);
    if (hit) return res.status(hit.status).json(hit.body);
  }
  const payload = await ctx.mutate((db) => {
    const actor = domain.resolveActor(db, req);
    const invoked = domain.invokeModel(db, actor, modelKey, input || {});
    if (expected && invoked.model.modelCategory !== expected && !(expected === "chat" && invoked.model.modelCategory === "code")) {
      if (!(expected === "chat" && ["chat", "code", "vision"].includes(invoked.model.modelCategory))) {
        throw new HttpError(400, "unsupported_model_format", "这个模型不能走当前接口");
      }
    }
    return { invoked, userId: actor.user.id };
  });
  const body = shape(expected, payload.invoked, modelKey);
  if (idem) {
    await ctx.mutate((db) => {
      db.idempotency.push({ key: idem, userId: payload.userId, status: 200, body, createdAt: new Date().toISOString() });
      if (db.idempotency.length > 400) db.idempotency.splice(0, db.idempotency.length - 400);
    });
  }
  if (req.body && req.body.stream && (expected === "chat" || expected === null)) {
    res.setHeader("Content-Type", "text/event-stream");
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { role: "assistant", content: payload.invoked.output.content || "" } }] })}\n\n`);
    res.write("data: [DONE]\n\n");
    return res.end();
  }
  res.set("X-IdP-Points-Charged", String(payload.invoked.points));
  res.set("X-IdP-Reservation-Id", payload.invoked.reservation.id);
  res.json(body);
}

function shape(expected, invoked, modelKey) {
  if (invoked.model.modelCategory === "embedding") {
    return { object: "list", model: modelKey, data: [{ object: "embedding", index: 0, embedding: invoked.output.embedding }], usage: invoked.usage, points_charged: invoked.points };
  }
  if (invoked.model.modelCategory === "image") {
    return { created: Date.now(), data: [{ url: invoked.output.url }], points_charged: invoked.points };
  }
  if (invoked.model.modelCategory === "asr") {
    return { text: invoked.output.text, points_charged: invoked.points };
  }
  return {
    id: invoked.call.id,
    object: "chat.completion",
    model: modelKey,
    choices: [{ index: 0, message: { role: "assistant", content: invoked.output.content }, finish_reason: "stop" }],
    usage: invoked.usage,
    points_charged: invoked.points,
  };
}

module.exports = { mount };
