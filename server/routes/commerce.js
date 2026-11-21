const domain = require("../domain");
const { asyncRoute } = require("../http");
const { HttpError } = require("../lib");

function mount(app, ctx) {
  app.get(
    "/v1/user/wallet",
    asyncRoute(async (req, res) => {
      const actor = domain.resolveActor(ctx.get(), req);
      const user = domain.requireUser(actor);
      await ctx.mutate((db) => domain.settleMonthlyGrant(db, domain.findUser(db, user.id)));
      res.json({ wallet: domain.publicUser(ctx.get(), domain.findUser(ctx.get(), user.id)).wallet });
    })
  );

  app.get("/v1/user/membership", (req, res) => {
    const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
    res.json({ plan: domain.publicUser(ctx.get(), user).plan });
  });

  app.get("/v1/user/membership/details", (req, res) => {
    const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
    const db = ctx.get();
    res.json({
      plan: domain.publicUser(db, user).plan,
      history: db.memberships.filter((item) => item.userId === user.id),
      entitlements: domain.activeEntitlements(db, user.id).length,
    });
  });

  app.get("/v1/user/app-entitlement", (req, res) => {
    const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
    const clientId = req.query.client_id;
    const row = domain.activeEntitlements(ctx.get(), user.id).find((item) => item.clientId === clientId) || null;
    res.json({ entitled: Boolean(row), entitlement: row });
  });

  app.post(
    "/v1/user/billing-entries",
    asyncRoute(async (req, res) => {
      const result = await ctx.mutate((db) => {
        const actor = domain.resolveActor(db, req);
        const user = domain.requireUser(actor);
        const points = Number(req.body.points);
        if (!points || points <= 0) throw new HttpError(400, "invalid_points", "请填写积分");
        domain.checkContent(db, req.body.description || "");
        const reservation = domain.reservePoints(db, user.id, points, req.body.description || "应用扣费", req.body.reference);
        domain.confirmReservation(db, reservation.id, user.id);
        const entry = {
          id: `bill_${reservation.id}`,
          userId: user.id,
          clientId: actor.client ? actor.client.id : null,
          points,
          description: req.body.description || "",
          status: "confirmed",
          createdAt: new Date().toISOString(),
        };
        db.billingEntries.push(entry);
        return entry;
      });
      res.json(result);
    })
  );

  app.get("/v1/user/billing-entries/:entryId", (req, res) => {
    const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
    const row = ctx.get().billingEntries.find((item) => item.id === req.params.entryId && item.userId === user.id);
    if (!row) return res.status(404).json({ error: "entry_not_found", message: "找不到账单" });
    res.json(row);
  });

  app.post(
    "/v1/points/reserve",
    asyncRoute(async (req, res) => {
      const result = await ctx.mutate((db) => {
        const user = domain.requireUser(domain.resolveActor(db, req));
        return domain.reservePoints(db, user.id, req.body.points, req.body.reason || "手动预扣", req.body.reference);
      });
      res.json({ reservation_id: result.id, status: result.status, points: result.points });
    })
  );

  app.post(
    "/v1/points/confirm",
    asyncRoute(async (req, res) => {
      const result = await ctx.mutate((db) => {
        const user = domain.requireUser(domain.resolveActor(db, req));
        return domain.confirmReservation(db, req.body.reservation_id, user.roles.includes("admin") ? null : user.id);
      });
      res.json({ reservation_id: result.id, status: result.status });
    })
  );

  app.post(
    "/v1/points/release",
    asyncRoute(async (req, res) => {
      const result = await ctx.mutate((db) => {
        const user = domain.requireUser(domain.resolveActor(db, req));
        return domain.releaseReservation(db, req.body.reservation_id, user.roles.includes("admin") ? null : user.id);
      });
      res.json({ reservation_id: result.id, status: result.status });
    })
  );

  app.post(
    "/v1/payments/recharge",
    asyncRoute(async (req, res) => {
      const order = await ctx.mutate((db) => {
        const user = domain.requireUser(domain.resolveActor(db, req));
        return domain.createRechargeOrder(db, user, req.body || {});
      });
      res.json(order);
    })
  );

  app.post("/v1/auth/payments/recharge", (req, res, next) => app.handle({ ...req, url: "/v1/payments/recharge", originalUrl: "/v1/payments/recharge" }, res, next));

  app.post(
    "/v1/auth/payments/recharge-package",
    asyncRoute(async (req, res) => {
      const order = await ctx.mutate((db) => {
        const user = domain.requireUser(domain.resolveActor(db, req));
        return domain.createRechargeOrder(db, user, req.body || {});
      });
      res.json({ order, billing_url: order.billing_url });
    })
  );

  app.post(
    "/v1/auth/membership/orders",
    asyncRoute(async (req, res) => {
      const result = await ctx.mutate((db) => {
        const user = domain.requireUser(domain.resolveActor(db, req));
        return domain.createMembershipOrder(db, user, req.body || {});
      });
      res.json(result);
    })
  );

  app.post(
    "/v1/auth/membership/downgrade",
    asyncRoute(async (req, res) => {
      const plan = await ctx.mutate((db) => {
        const user = domain.requireUser(domain.resolveActor(db, req));
        return domain.downgrade(db, domain.findUser(db, user.id), req.body.plan_id);
      });
      res.json({ plan });
    })
  );

  app.post(
    "/v1/auth/app-purchases/orders",
    asyncRoute(async (req, res) => {
      const result = await ctx.mutate((db) => {
        const user = domain.requireUser(domain.resolveActor(db, req));
        return domain.createAppOrder(db, user, req.body || {});
      });
      res.json(result);
    })
  );

  app.get("/v1/auth/app-purchases/orders/:outTradeNo", (req, res) => {
    const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
    const order = ctx.get().orders.find((item) => item.outTradeNo === req.params.outTradeNo && item.userId === user.id);
    if (!order) return res.status(404).json({ error: "order_not_found", message: "找不到订单" });
    res.json(domain.publicOrder(order));
  });

  app.get("/v1/payments/orders/:outTradeNo", (req, res) => {
    const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
    const order = ctx.get().orders.find((item) => item.outTradeNo === req.params.outTradeNo);
    if (!order) return res.status(404).json({ error: "order_not_found", message: "找不到订单" });
    if (order.userId !== user.id && !user.roles.includes("admin")) {
      return res.status(403).json({ error: "forbidden", message: "不能查看别人的订单" });
    }
    res.json(domain.publicOrder(order));
  });

  app.post(
    "/v1/payments/orders/:outTradeNo/confirm",
    asyncRoute(async (req, res) => {
      if (ctx.get().production) return res.status(410).json({error:"mock_payment_disabled", message:"生产订单仅接受支付机构确认"});
      const order = await ctx.mutate((db) => {
        const user = domain.requireUser(domain.resolveActor(db, req));
        return domain.confirmOrder(db, user, req.params.outTradeNo);
      });
      res.json({ order });
    })
  );

  app.post("/v1/auth/app-purchases/orders/:outTradeNo/mock-result", (req, res, next) => {
    req.url = `/v1/payments/orders/${req.params.outTradeNo}/confirm`;
    app.handle(req, res, next);
  });

  app.post(
    "/v1/auth/refunds",
    asyncRoute(async (req, res) => {
      const refund = await ctx.mutate((db) => {
        const user = domain.requireUser(domain.resolveActor(db, req));
        return domain.requestRefund(db, user, req.body || {});
      });
      res.json(refund);
    })
  );

  app.get("/v1/auth/refunds", (req, res) => {
    const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
    res.json({ items: ctx.get().refunds.filter((item) => item.userId === user.id) });
  });
}

module.exports = { mount };
