const domain = require("../domain");
const { asyncRoute } = require("../http");
const { HttpError } = require("../lib");

function mount(app, ctx) {
  app.get("/v1/oauth/authorize", (req, res) => {
    const client = ctx.get().clients.find((item) => item.id === req.query.client_id);
    if (!client) return res.status(400).json({ error: "invalid_client", message: "client_id 不正确" });
    const user = domain.resolveActor(ctx.get(), req).user;
    res.json({
      client: { client_id: client.id, name: client.name, summary: client.summary },
      redirect_uri: req.query.redirect_uri,
      scope: req.query.scope || "openid profile wallet",
      state: req.query.state || "",
      code_challenge: req.query.code_challenge || "",
      code_challenge_method: req.query.code_challenge_method || "",
      user: user ? domain.publicUser(ctx.get(), user) : null,
    });
  });

  app.post(
    "/v1/oauth/authorize/approve",
    asyncRoute(async (req, res) => {
      const result = await ctx.mutate((db) => {
        const user = domain.requireUser(domain.resolveActor(db, req));
        return domain.createAuthCode(db, user, { ...req.query, ...req.body });
      });
      const url = new URL(result.redirectUri);
      url.searchParams.set("code", result.code);
      if (result.state) url.searchParams.set("state", result.state);
      res.json({ redirect_to: url.toString(), code: result.code, state: result.state });
    })
  );

  app.post(
    "/v1/oauth/token",
    asyncRoute(async (req, res) => {
      const token = await ctx.mutate((db) => domain.exchangeToken(db, req.body || {}));
      res.json(token);
    })
  );

  app.post(
    "/v1/oauth/revoke",
    asyncRoute(async (req, res) => {
      await ctx.mutate((db) => {
        const { sha256 } = require("../lib");
        const row = db.accessTokens.find((item) => item.hash === sha256(req.body.token || ""));
        if (row) row.revoked = true;
      });
      res.json({ ok: true });
    })
  );

  app.get("/v1/oauth/userinfo", (req, res) => {
    const actor = domain.resolveActor(ctx.get(), req);
    if (!actor.user || actor.kind !== "oauth") throw new HttpError(401, "invalid_token", "需要 OAuth 访问令牌");
    const db = ctx.get();
    res.json({
      sub: actor.user.id,
      name: actor.user.name,
      phone_number: domain.publicUser(db, actor.user).phone,
      membership: domain.publicUser(db, actor.user).plan,
      wallet: domain.publicUser(db, actor.user).wallet,
    });
  });

  app.get("/v1/.well-known/jwks.json", (req, res) => {
    res.json({ keys: [], note: "本站使用不透明访问令牌，不签发 JWT。" });
  });
}

module.exports = { mount };
