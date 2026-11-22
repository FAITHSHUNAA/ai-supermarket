const domain = require("../domain");
const { asyncRoute, finishLogin, clearCookie } = require("../http");

function mount(app, ctx) {
  app.get(
    "/v1/auth/captcha/challenge",
    asyncRoute(async (req, res) => {
      const captcha = await ctx.mutate((db) => domain.createCaptcha(db));
      res.json(captcha);
    })
  );

  app.post(
    "/v1/auth/otp/send",
    asyncRoute(async (req, res) => {
      const purpose = req.body.purpose || "login";
      const result = await ctx.mutate((db) => domain.sendOtp(db, req.body.phone, purpose));
      res.json({ ok: true, purpose, ...result });
    })
  );

  app.post(
    "/v1/auth/register/otp",
    asyncRoute(async (req, res) => {
      const result = await ctx.mutate((db) => domain.sendOtp(db, req.body.phone, "register"));
      res.json({ ok: true, ...result });
    })
  );

  app.post(
    "/v1/auth/register",
    asyncRoute(async (req, res) => {
      const result = await ctx.mutate((db) => domain.register(db, req.body || {}));
      finishLogin(res, result);
    })
  );

  app.post(
    "/v1/auth/login",
    asyncRoute(async (req, res) => {
      const result = await ctx.mutate((db) => domain.loginWithPassword(db, req.body || {}));
      finishLogin(res, result);
    })
  );

  app.post(
    "/v1/auth/login/otp",
    asyncRoute(async (req, res) => {
      const result = await ctx.mutate((db) => domain.loginWithOtp(db, req.body || {}));
      finishLogin(res, result);
    })
  );

  app.post(
    "/v1/auth/logout",
    asyncRoute(async (req, res) => {
      const sid = req.cookies && req.cookies.sid;
      await ctx.mutate((db) => {
        db.sessions = db.sessions.filter((item) => item.id !== sid);
      });
      clearCookie(res);
      res.json({ ok: true });
    })
  );

  app.get(
    "/v1/auth/session",
    asyncRoute(async (req, res) => {
      const actor = domain.resolveActor(ctx.get(), req);
      if (!actor.user) return res.json({ user: null });
      await ctx.mutate((db) => {
        const user = domain.findUser(db, actor.user.id);
        if (user) domain.settleMonthlyGrant(db, user);
      });
      const fresh = domain.findUser(ctx.get(), actor.user.id);
      res.json({ user: domain.publicUser(ctx.get(), fresh) });
    })
  );

  app.get(
    "/v1/auth/account-summary",
    asyncRoute(async (req, res) => {
      const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
      const db = ctx.get();
      const entitlements = domain.activeEntitlements(db, user.id);
      res.json({
        user: domain.publicUser(db, user),
        entitlements: entitlements.length,
        calls: db.calls.filter((item) => item.userId === user.id).length,
        orders: db.orders.filter((item) => item.userId === user.id).length,
      });
    })
  );

  app.post(
    "/v1/auth/password-reset/otp",
    asyncRoute(async (req, res) => {
      const result = await ctx.mutate((db) => domain.sendOtp(db, req.body.phone, "reset"));
      res.json({ ok: true, ...result });
    })
  );

  app.post(
    "/v1/auth/password-reset",
    asyncRoute(async (req, res) => {
      await ctx.mutate((db) => domain.resetPassword(db, req.body || {}));
      res.json({ ok: true });
    })
  );

  app.get(
    "/v1/auth/security/overview",
    asyncRoute(async (req, res) => {
      const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
      res.json({
        phone: domain.publicUser(ctx.get(), user).phone,
        email: user.email,
        has_password: Boolean(user.passwordHash),
        login_methods: ctx.get().settings.enabledLoginMethods,
      });
    })
  );

  app.post(
    "/v1/auth/security/password",
    asyncRoute(async (req, res) => {
      const actor = domain.resolveActor(ctx.get(), req);
      const user = domain.requireUser(actor);
      if (actor.kind !== "session") throw Object.assign(new Error("need session"), { status: 403, code: "session_required" });
      await ctx.mutate((db) => domain.changePassword(db, domain.findUser(db, user.id), req.body || {}));
      res.json({ ok: true });
    })
  );

  app.post(
    "/v1/auth/security/password/set",
    asyncRoute(async (req, res) => {
      const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
      await ctx.mutate((db) => domain.setPassword(db, domain.findUser(db, user.id), req.body || {}));
      res.json({ ok: true });
    })
  );

  app.post(
    "/v1/auth/security/phone-otp",
    asyncRoute(async (req, res) => {
      domain.requireUser(domain.resolveActor(ctx.get(), req));
      const result = await ctx.mutate((db) => domain.sendOtp(db, req.body.phone, "change_phone"));
      res.json({ ok: true, ...result });
    })
  );

  app.post(
    "/v1/auth/security/phone",
    asyncRoute(async (req, res) => {
      const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
      const result = await ctx.mutate((db) => domain.changePhone(db, domain.findUser(db, user.id), req.body || {}));
      res.json(result);
    })
  );

  app.post(
    "/v1/auth/security/email",
    asyncRoute(async (req, res) => {
      const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
      const result = await ctx.mutate((db) => domain.changeEmail(db, domain.findUser(db, user.id), req.body || {}));
      res.json(result);
    })
  );

  app.post(
    "/v1/auth/privacy-consents",
    asyncRoute(async (req, res) => {
      const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
      if (!req.body || !req.body.accepted) {
        return res.status(400).json({ error: "privacy_required", message: "需要同意当前隐私政策" });
      }
      await ctx.mutate((db) => {
        db.consents.push({ id: `cns_${Date.now()}`, userId: user.id, version: db.legal.updatedAt, createdAt: new Date().toISOString() });
      });
      res.json({ ok: true });
    })
  );

  app.get(
    "/v1/auth/referral-attribution",
    asyncRoute(async (req, res) => {
      const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
      const row = ctx.get().referrals.find((item) => item.userId === user.id) || null;
      const inviter = row && row.invitedBy ? domain.findUser(ctx.get(), row.invitedBy) : null;
      res.json({ invite_code: user.inviteCode, invited_by: inviter ? inviter.name : null, attribution: row });
    })
  );

  app.post(
    "/v1/auth/referral-attribution/rebind",
    asyncRoute(async (req, res) => {
      const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
      const result = await ctx.mutate((db) => domain.rebindReferral(db, domain.findUser(db, user.id), req.body.invite_code));
      res.json(result);
    })
  );

  app.get(
    "/v1/auth/points-history",
    asyncRoute(async (req, res) => {
      const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
      const items = ctx.get().ledger.filter((item) => item.userId === user.id).slice().reverse();
      res.json({ items });
    })
  );

  app.get(
    "/v1/auth/earnings",
    asyncRoute(async (req, res) => {
      const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
      const db = ctx.get();
      res.json({
        wallet: domain.publicUser(db, user).wallet,
        statements: db.statements.filter((item) => item.userId === user.id),
        lines: db.purchases.filter((item) => item.developerId === user.id || item.promoterId === user.id),
      });
    })
  );

  app.get(
    "/v1/auth/earnings/statements/:id",
    asyncRoute(async (req, res) => {
      const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
      const row = ctx.get().statements.find((item) => item.id === req.params.id && item.userId === user.id);
      if (!row) return res.status(404).json({ error: "statement_not_found", message: "找不到月结单" });
      res.json(row);
    })
  );

  app.get(
    "/v1/auth/usage",
    asyncRoute(async (req, res) => {
      const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
      const calls = ctx.get().calls.filter((item) => item.userId === user.id);
      res.json({
        calls: calls.slice().reverse().slice(0, 50),
        points: calls.reduce((sum, item) => sum + Number(item.points || 0), 0),
      });
    })
  );

  app.get(
    "/v1/auth/apps",
    asyncRoute(async (req, res) => {
      const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
      const db = ctx.get();
      const items = domain.activeEntitlements(db, user.id).map((item) => ({
        ...item,
        app: domain.publicClient(db, db.clients.find((client) => client.id === item.clientId) || { id: item.clientId, name: "已下架", tags: [], status: "missing" }),
      }));
      res.set("Cache-Control","private, no-store").json({ items });
    })
  );
}

module.exports = { mount };
