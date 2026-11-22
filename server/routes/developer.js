const domain = require("../domain");
const { asyncRoute } = require("../http");
const { HttpError, page } = require("../lib");

function mount(app, ctx) {
  app.get("/v1/developer/delivery-reports",(req,res)=>{
    const db=ctx.get(),user=domain.requireDeveloper(domain.resolveActor(db,req));
    const mine=new Set(db.clients.filter(c=>c.ownerId===user.id).map(c=>c.id));
    res.set("Cache-Control","no-store").json({items:(db.deliveryReports||[]).filter(r=>mine.has(r.clientId) && r.status==="pending").map(r=>({id:r.id,clientId:r.clientId,createdAt:r.createdAt,submitted:!!r.proposedUrl}))});
  });
  app.post("/v1/developer/delivery-reports",asyncRoute(async(req,res)=>{
    await ctx.mutate(db=>{
      const user=domain.requireDeveloper(domain.resolveActor(db,req));
      const report=(db.deliveryReports||[]).find(r=>r.id===req.body.id && r.status==="pending" && db.clients.some(c=>c.id===r.clientId && c.ownerId===user.id));
      if(!report)throw new HttpError(404,"report_missing","找不到待处理问题");
      let link;try{link=new URL(req.body.url);}catch{throw new HttpError(400,"invalid_url","请输入 HTTPS 补发地址");}
      if(link.protocol!=="https:" || link.username || link.password || link.href.length>2048)throw new HttpError(400,"invalid_url","补发地址无效");
      report.proposedUrl=link.href;
    });res.json({ok:true});
  }));
  app.get("/v1/developer/application", (req, res) => {
    const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
    res.json({ status: user.developerStatus, pitch: user.developerPitch || "", reason: user.developerReviewReason || "" });
  });

  app.post(
    "/v1/developer/application",
    asyncRoute(async (req, res) => {
      const result = await ctx.mutate((db) => {
        const user = domain.requireUser(domain.resolveActor(db, req));
        return domain.applyDeveloper(db, domain.findUser(db, user.id), req.body.pitch || "");
      });
      res.json(result);
    })
  );

  app.get("/v1/developer-center/promoter-application", (req, res) => {
    const user = domain.requireUser(domain.resolveActor(ctx.get(), req));
    const row = ctx.get().promoterApplications.find((item) => item.userId === user.id) || null;
    res.json({ status: user.promoterStatus, application: row });
  });

  app.post(
    "/v1/developer-center/promoter-applications",
    asyncRoute(async (req, res) => {
      const row = await ctx.mutate((db) => {
        const user = domain.findUser(db, domain.requireUser(domain.resolveActor(db, req)).id);
        if (user.promoterStatus === "approved") throw new HttpError(409, "already_promoter", "你已经是推广员");
        if (user.promoterStatus === "pending") throw new HttpError(409, "application_pending", "申请审核中");
        user.promoterStatus = "pending";
        const application = { id: `prm_${Date.now()}`, userId: user.id, status: "pending", pitch: req.body.pitch || "", createdAt: new Date().toISOString() };
        db.promoterApplications.push(application);
        return application;
      });
      res.json(row);
    })
  );

  app.get("/v1/developer/api-keys", (req, res) => {
    const user = domain.requireDeveloper(domain.resolveActor(ctx.get(), req));
    res.json({ items: ctx.get().apiKeys.filter((item) => item.userId === user.id).map(domain.publicApiKey) });
  });

  app.post(
    "/v1/developer/api-keys",
    asyncRoute(async (req, res) => {
      const created = await ctx.mutate((db) => domain.createApiKey(db, domain.requireDeveloper(domain.resolveActor(db, req)), req.body.name));
      res.status(201).json(created);
    })
  );

  app.post(
    "/v1/developer/api-keys/:id/confirm-delivery",
    asyncRoute(async (req, res) => {
      if (req.body && Object.keys(req.body).length) throw new HttpError(400, "invalid_body", "确认请求体必须是空对象");
      const row = await ctx.mutate((db) => domain.confirmKeyDelivery(db, domain.requireDeveloper(domain.resolveActor(db, req)), req.params.id));
      res.json(row);
    })
  );

  app.post(
    "/v1/developer/api-keys/:id/revoke",
    asyncRoute(async (req, res) => {
      const row = await ctx.mutate((db) => domain.revokeKey(db, domain.requireDeveloper(domain.resolveActor(db, req)), req.params.id, false));
      res.json(row);
    })
  );

  app.get("/v1/developer/models", (req, res) => {
    domain.requireDeveloper(domain.resolveActor(ctx.get(), req));
    res.json({ items: ctx.get().models.filter((item) => item.enabled).map(domain.publicModel) });
  });

  app.get("/v1/developer/calls", (req, res) => {
    const user = domain.requireDeveloper(domain.resolveActor(ctx.get(), req));
    const items = ctx.get().calls.filter((item) => item.userId === user.id).slice().reverse();
    res.json(page(items, req.query));
  });

  app.get("/v1/developer/usage", (req, res) => {
    const user = domain.requireDeveloper(domain.resolveActor(ctx.get(), req));
    const calls = ctx.get().calls.filter((item) => item.userId === user.id);
    res.json({
      calls: calls.length,
      points: calls.reduce((sum, item) => sum + Number(item.points || 0), 0),
    });
  });

  app.get("/v1/developer/clients", (req, res) => {
    const user = domain.requireDeveloper(domain.resolveActor(ctx.get(), req));
    const db = ctx.get();
    const items = db.clients.filter((item) => item.ownerId === user.id && item.environment === "production");
    res.json(page(items.map((item) => domain.publicClient(db, item)), req.query));
  });

  app.post(
    "/v1/developer/clients",
    asyncRoute(async (req, res) => {
      const created = await ctx.mutate((db) => domain.createClient(db, domain.requireDeveloper(domain.resolveActor(db, req)), req.body || {}));
      res.status(201).json(created);
    })
  );

  app.patch(
    "/v1/developer/clients/:clientId",
    asyncRoute(async (req, res) => {
      const client = await ctx.mutate((db) => {
        const user = domain.requireDeveloper(domain.resolveActor(db, req));
        const row = db.clients.find((item) => item.id === req.params.clientId && item.ownerId === user.id);
        if (!row) throw new HttpError(404, "client_not_found", "找不到应用");
        for (const [from, to] of [
          ["name", "name"],
          ["summary", "summary"],
          ["description", "description"],
          ["homepage_url", "homepageUrl"],
          ["category_id", "categoryId"],
        ]) {
          if (req.body[from] !== undefined) row[to] = req.body[from];
        }
        if (Array.isArray(req.body.redirect_uris)) row.redirectUris = req.body.redirect_uris;
        if (Array.isArray(req.body.tags)) row.tags = req.body.tags;
        return domain.publicClient(db, row);
      });
      res.json(client);
    })
  );

  app.get("/v1/developer/clients/:clientId/secret", (req, res) => {
    const user = domain.requireDeveloper(domain.resolveActor(ctx.get(), req));
    const row = ctx.get().clients.find((item) => item.id === req.params.clientId && item.ownerId === user.id);
    if (!row) return res.status(404).json({ error: "client_not_found", message: "找不到应用" });
    if (!row.secretPending) return res.status(409).json({ error: "secret_already_delivered", message: "密钥已经交付，请轮换" });
    const secret = row.secretPending;
    row.secretPending = null;
    ctx.mutate((db) => {
      const fresh = db.clients.find((item) => item.id === row.id);
      if (fresh) fresh.secretPending = null;
    }).catch(() => {});
    res.json({ client_secret: secret });
  });

  app.post(
    "/v1/developer/clients/:clientId/rotate-secret",
    asyncRoute(async (req, res) => {
      const { randomToken, sha256 } = require("../lib");
      const result = await ctx.mutate((db) => {
        const user = domain.requireDeveloper(domain.resolveActor(db, req));
        const row = db.clients.find((item) => item.id === req.params.clientId && item.ownerId === user.id);
        if (!row) throw new HttpError(404, "client_not_found", "找不到应用");
        const secret = randomToken("sec", 18);
        row.secretHash = sha256(secret);
        row.secretPreview = secret.slice(0, 12);
        row.secretPending = null;
        return { client_secret: secret };
      });
      res.json(result);
    })
  );

  app.get("/v1/developer/clients/:clientId/webhook", (req, res) => {
    const user = domain.requireDeveloper(domain.resolveActor(ctx.get(), req));
    const row = ctx.get().clients.find((item) => item.id === req.params.clientId && item.ownerId === user.id);
    if (!row) return res.status(404).json({ error: "client_not_found", message: "找不到应用" });
    res.json({ webhook: row.webhook });
  });

  app.put(
    "/v1/developer/clients/:clientId/webhook",
    asyncRoute(async (req, res) => {
      const { randomToken } = require("../lib");
      const webhook = await ctx.mutate((db) => {
        const user = domain.requireDeveloper(domain.resolveActor(db, req));
        const row = db.clients.find((item) => item.id === req.params.clientId && item.ownerId === user.id);
        if (!row) throw new HttpError(404, "client_not_found", "找不到应用");
        row.webhook = { url: req.body.url || "", events: req.body.events || ["order.paid"], secret: randomToken("whsec", 12) };
        return row.webhook;
      });
      res.json({ webhook });
    })
  );

  app.post(
    "/v1/developer/clients/:clientId/webhook/test",
    asyncRoute(async (req, res) => {
      const delivery = await ctx.mutate((db) => {
        const user = domain.requireDeveloper(domain.resolveActor(db, req));
        const row = db.clients.find((item) => item.id === req.params.clientId && item.ownerId === user.id);
        if (!row || !row.webhook) throw new HttpError(409, "webhook_missing", "还没有配置 Webhook");
        const deliveryRow = {
          id: `wh_${Date.now()}`,
          clientId: row.id,
          url: row.webhook.url,
          status: "simulated",
          payload: { type: "ping", client_id: row.id },
          createdAt: new Date().toISOString(),
        };
        db.webhookDeliveries.push(deliveryRow);
        return deliveryRow;
      });
      res.json(delivery);
    })
  );

  app.get("/v1/developer/clients/:clientId/commercial-offer", (req, res) => {
    const user = domain.requireDeveloper(domain.resolveActor(ctx.get(), req));
    const client = ctx.get().clients.find((item) => item.id === req.params.clientId && item.ownerId === user.id);
    if (!client) return res.status(404).json({ error: "client_not_found", message: "找不到应用" });
    const items = ctx.get().offers.filter((item) => item.clientId === client.id);
    res.set("Cache-Control","no-store").json({ items, draft:client.offerDraft || null,
      private_notes_enabled:!ctx.get().production || process.env.PUBLIC_ORIGIN?.startsWith("https://") === true });
  });
  app.put("/v1/developer/clients/:clientId/commercial-offer", asyncRoute(async (req,res) => {
    const draft = await ctx.mutate(db => {
      const user = domain.requireDeveloper(domain.resolveActor(db,req));
      const client = db.clients.find(row => row.id === req.params.clientId && row.ownerId === user.id);
      if (!client) throw new HttpError(404,"client_not_found","找不到商品");
      if (db.offers.some(row => row.clientId === client.id && row.status === "pending")) throw new HttpError(409,"review_pending","已有待审版本");
      const body = req.body || {};
      if ((body.revision || 0) !== (client.offerDraft?.revision || 0)) throw new HttpError(409,"draft_changed","草稿已在其他窗口更新，请重新打开");
      if (JSON.stringify(body).length > 24000) throw new HttpError(400,"draft_too_large","草稿内容过长");
      const listing = {};
      for (const key of ["format","specification","contents","usage","limits","privacy","support","license","delivery_url","preview_url"]) {
        if (typeof body.listing?.[key] === "string") listing[key] = body.listing[key];
      }
      client.offerDraft = {revision:(client.offerDraft?.revision || 0)+1, listing, price:String(body.price ?? ""), step:Math.max(0,Math.min(3,parseInt(body.step,10)||0)),
        reviewNotes:require("../listing").reviewNotes(db,body.review_notes)};
      return client.offerDraft;
    });
    res.set("Cache-Control","no-store").json(draft);
  }));

  app.post(
    "/v1/developer/clients/:clientId/commercial-offer",
    asyncRoute(async (req, res) => {
      const offer = await ctx.mutate((db) => domain.submitOffer(db, domain.requireDeveloper(domain.resolveActor(db, req)), req.params.clientId, req.body || {}));
      res.status(201).json(offer);
    })
  );

  app.get("/v1/developer/sandboxes", (req, res) => {
    const user = domain.requireDeveloper(domain.resolveActor(ctx.get(), req));
    res.json(page(ctx.get().sandboxes.filter((item) => item.ownerId === user.id), req.query));
  });

  app.post(
    "/v1/developer/sandboxes",
    asyncRoute(async (req, res) => {
      const row = await ctx.mutate((db) => domain.createSandbox(db, domain.requireDeveloper(domain.resolveActor(db, req)), req.body.client_id));
      res.status(201).json(row);
    })
  );

  app.post(
    "/v1/developer/sandboxes/:id/:action",
    asyncRoute(async (req, res) => {
      const row = await ctx.mutate((db) => {
        const user = domain.requireDeveloper(domain.resolveActor(db, req));
        const sandbox = db.sandboxes.find((item) => item.id === req.params.id && item.ownerId === user.id);
        if (!sandbox) throw new HttpError(404, "sandbox_not_found", "找不到沙箱");
        if (req.params.action === "pause") sandbox.status = "paused";
        else if (req.params.action === "resume") sandbox.status = "active";
        else throw new HttpError(400, "invalid_action", "不支持的动作");
        return sandbox;
      });
      res.json(row);
    })
  );

  app.get("/v1/developer/hosting/plans", (req, res) => {
    domain.requireDeveloper(domain.resolveActor(ctx.get(), req));
    res.json({ items: ctx.get().hostingPlans.filter((item) => item.active) });
  });

  app.get("/v1/developer/hosting/applications", (req, res) => {
    const user = domain.requireDeveloper(domain.resolveActor(ctx.get(), req));
    res.json({ items: ctx.get().hostingInstances.filter((item) => item.ownerId === user.id) });
  });

  app.get("/v1/developer/hosting/instances", (req, res) => {
    const user = domain.requireDeveloper(domain.resolveActor(ctx.get(), req));
    res.json(page(ctx.get().hostingInstances.filter((item) => item.ownerId === user.id), req.query));
  });

  app.post(
    "/v1/developer/application-hosting/create",
    asyncRoute(async (req, res) => {
      const row = await ctx.mutate((db) => domain.createHosting(db, domain.requireDeveloper(domain.resolveActor(db, req)), req.body || {}));
      res.status(201).json(row);
    })
  );

  app.get("/v1/developer/wallet", (req, res) => {
    const user = domain.requireDeveloper(domain.resolveActor(ctx.get(), req));
    res.json({ wallet: domain.publicUser(ctx.get(), user).wallet, settlements: ctx.get().settlements.filter((item) => item.userId === user.id) });
  });

  app.get("/v1/developer/offline-settlement-requests", (req, res) => {
    const user = domain.requireDeveloper(domain.resolveActor(ctx.get(), req));
    res.json(page(ctx.get().settlements.filter((item) => item.userId === user.id), req.query));
  });

  app.post(
    "/v1/developer/offline-settlement-requests",
    asyncRoute(async (req, res) => {
      const row = await ctx.mutate((db) => domain.requestSettlement(db, domain.requireDeveloper(domain.resolveActor(db, req)), req.body || {}));
      res.status(201).json(row);
    })
  );

  app.post(
    "/v1/developer/offline-settlement-requests/:requestNo/cancel",
    asyncRoute(async (req, res) => {
      const row = await ctx.mutate((db) => {
        const user = domain.requireDeveloper(domain.resolveActor(db, req));
        return domain.transitionSettlement(db, user, req.params.requestNo, "cancel", "开发者取消");
      });
      res.json(row);
    })
  );

  app.get("/v1/developer/settlements", (req, res) => {
    const user = domain.requireDeveloper(domain.resolveActor(ctx.get(), req));
    res.json(page(ctx.get().statements.filter((item) => item.userId === user.id), req.query));
  });
}

module.exports = { mount };
