const domain = require("../domain");
const { asyncRoute } = require("../http");
const { HttpError, id, hashPassword, randomToken } = require("../lib");

function mount(app, ctx) {
  app.get(
    "/v1/admin/snapshot",
    asyncRoute(async (req, res) => {
      domain.requireAdmin(domain.resolveActor(ctx.get(), req));
      res.json(snapshot(ctx.get()));
    })
  );

  app.get("/v1/admin/revenue-report", (req, res) => {
    domain.requireAdmin(domain.resolveActor(ctx.get(), req));
    res.json(domain.revenueReport(ctx.get()));
  });

  app.post(
    "/v1/admin/actions",
    asyncRoute(async (req, res) => {
      const result = await ctx.mutate((db) => runAction(db, domain.requireAdmin(domain.resolveActor(db, req)), req.body || {}));
      res.json(result === undefined ? { ok: true } : result);
    })
  );

  app.get("/v1/admin/offline-settlement-requests/export.csv", (req, res) => {
    domain.requireAdmin(domain.resolveActor(ctx.get(), req));
    const lines = ["request_no,user_id,amount_cents,status"];
    for (const row of ctx.get().settlements) lines.push([row.requestNo, row.userId, row.amountCents, row.status].join(","));
    res.type("text/csv").send(lines.join("\n"));
  });

  const aliases = [
    ["post", "/v1/admin/developer-applications/:userId/approve", (req) => ({ type: "developer.review", user_id: req.params.userId, approve: true })],
    ["post", "/v1/admin/developer-applications/:userId/reject", (req) => ({ type: "developer.review", user_id: req.params.userId, approve: false, reason: req.body.reason })],
    ["post", "/v1/admin/application-offers/:id/approve", (req) => ({ type: "offer.review", id: req.params.id, approve: true })],
    ["post", "/v1/admin/application-offers/:id/reject", (req) => ({ type: "offer.review", id: req.params.id, approve: false })],
    ["post", "/v1/admin/promoter-applications/:userId/approve", (req) => ({ type: "promoter.review", user_id: req.params.userId, status: "approved" })],
    ["post", "/v1/admin/promoter-applications/:userId/reject", (req) => ({ type: "promoter.review", user_id: req.params.userId, status: "rejected" })],
    ["post", "/v1/admin/promoter-applications/:userId/revoke", (req) => ({ type: "promoter.review", user_id: req.params.userId, status: "revoked" })],
    ["post", "/v1/admin/offline-settlement-requests/:requestNo/start-processing", (req) => ({ type: "settlement", request_no: req.params.requestNo, action: "start" })],
    ["post", "/v1/admin/offline-settlement-requests/:requestNo/reject", (req) => ({ type: "settlement", request_no: req.params.requestNo, action: "reject" })],
    ["post", "/v1/admin/offline-settlement-requests/:requestNo/record-paid", (req) => ({ type: "settlement", request_no: req.params.requestNo, action: "paid" })],
    ["post", "/v1/admin/offline-settlement-requests/:requestNo/cancel", (req) => ({ type: "settlement", request_no: req.params.requestNo, action: "cancel" })],
    ["post", "/v1/admin/revenue-statements/regenerate", () => ({ type: "statements.regenerate" })],
    ["post", "/v1/admin/api-usage/:requestId/repair", (req) => ({ type: "call.repair", id: req.params.requestId })],
  ];
  for (const [method, path, toBody] of aliases) {
    app[method](
      path,
      asyncRoute(async (req, res) => {
        const result = await ctx.mutate((db) => runAction(db, domain.requireAdmin(domain.resolveActor(db, req)), { ...toBody(req), ...(req.body || {}) }));
        res.json(result === undefined ? { ok: true } : result);
      })
    );
  }
}

function snapshot(db) {
  return {
    users: db.users.map((user) => domain.publicUser(db, user, { admin: true })),
    categories: db.categories,
    clients: db.clients.map((client) => ({
      ...domain.publicClient(db, client),
      owner_id: client.ownerId,
      redirect_uris: client.redirectUris,
      environment: client.environment,
    })),
    offers: db.offers,
    orders: db.orders.map(domain.publicOrder),
    refunds: db.refunds,
    entitlements: db.entitlements,
    models: db.models.map((model) => ({
      ...domain.publicModel(model),
      description: model.description,
      default_points: model.defaultPoints,
      billing_unit: model.billingUnit,
      enabled: model.enabled,
      upstream_configured: Boolean(model.upstreamBaseUrl),
      provider_id: model.providerId,
    })),
    plans: db.plans,
    packages: db.packages,
    coupons: db.coupons,
    keywords: db.keywords,
    settlements: db.settlements,
    statements: db.statements,
    hosting_plans: db.hostingPlans,
    hosting_nodes: db.hostingNodes,
    hosting_instances: db.hostingInstances,
    sandboxes: db.sandboxes,
    api_keys: db.apiKeys.map(domain.publicApiKey),
    split_rules: db.splitRules,
    exchange_rates: db.exchangeRates,
    token_prices: db.tokenPrices,
    shadow_providers: db.shadowProviders,
    wallet_windows: db.walletWindows,
    permission_groups: db.permissionGroups,
    risk_flags: db.riskFlags,
    audit_logs: db.auditLogs.slice().reverse().slice(0, 120),
    access_logs: db.accessLogs.slice().reverse().slice(0, 120),
    user_events: db.userEvents.slice().reverse().slice(0, 120),
    calls: db.calls.slice().reverse().slice(0, 120),
    promoters: db.promoterApplications,
    referrals: db.referrals,
    suppliers: db.suppliers,
    endpoints: db.endpoints,
    settings: db.settings,
    legal: db.legal,
    report: domain.revenueReport(db),
    imports: db.imports,
    voices: db.voices,
    webhook_deliveries: db.webhookDeliveries || [],
  };
}

function runAction(db, admin, body) {
  const type = body.type;
  if (type === "developer.review") return domain.reviewDeveloper(db, admin, body.user_id, Boolean(body.approve), body.reason);
  if (type === "offer.review") return reviewOffer(db, admin, body);
  if (type === "refund.review") return domain.decideRefund(db, admin, body.id, Boolean(body.approve));
  if (type === "settlement") return domain.transitionSettlement(db, admin, body.request_no, body.action, body.note);
  if (type === "user.status") return setUserStatus(db, admin, body);
  if (type === "user.points") return adjustPoints(db, admin, body);
  if (type === "category.save") return saveCategory(db, admin, body);
  if (type === "model.save") return saveModel(db, admin, body);
  if (type === "plan.save") return saveRow(db, admin, "plans", body, ["name", "description", "priceCents", "monthlyPoints", "maxAuthorizedApps", "memberLevel", "active", "benefits"]);
  if (type === "package.save") return saveRow(db, admin, "packages", body, ["name", "description", "cnyCents", "points", "active", "displayOrder"]);
  if (type === "coupon.save") return saveRow(db, admin, "coupons", body, ["code", "name", "bonusPoints", "active", "maxUses"]);
  if (type === "keyword.save") return saveRow(db, admin, "keywords", body, ["word", "enabled", "note"]);
  if (type === "settings.save") return saveSettings(db, admin, body.patch || {});
  if (type === "legal.save") return saveLegal(db, admin, body);
  if (type === "client.status") return setClientStatus(db, admin, body);
  if (type === "apiKey.revoke") return domain.revokeKey(db, admin, body.id, true);
  if (type === "hosting.node") return saveRow(db, admin, "hostingNodes", body, ["name", "region", "status", "capacity"]);
  if (type === "hosting.instance") return setInstance(db, admin, body);
  if (type === "hosting.plan") return saveRow(db, admin, "hostingPlans", body, ["name", "vcpu", "memoryMb", "priceCents", "minLevel", "active"]);
  if (type === "split.save") return saveRow(db, admin, "splitRules", body, ["name", "platformRate", "developerRate", "promoterRate", "active"]);
  if (type === "fx.save") return saveRate(db, admin, body);
  if (type === "fx.preview") return previewRate(db, body);
  if (type === "tokenPrice.save") return saveRow(db, admin, "tokenPrices", body, ["modelKey", "inputPer1k", "outputPer1k", "active"]);
  if (type === "shadow.save") return saveRow(db, admin, "shadowProviders", body, ["name", "billingMode", "monthlyBudgetCents", "active"]);
  if (type === "window.create") return createWindow(db, admin, body);
  if (type === "window.action") return windowAction(db, admin, body);
  if (type === "permission.save") return saveRow(db, admin, "permissionGroups", body, ["name", "permissions"]);
  if (type === "promoter.review") return reviewPromoter(db, admin, body);
  if (type === "endpoint.save") return saveRow(db, admin, "endpoints", body, ["name", "points", "enabled", "summary", "method", "path"]);
  if (type === "supplier.save") return saveRow(db, admin, "suppliers", body, ["name", "summary", "slug"]);
  if (type === "risk.resolve") return resolveRisk(db, admin, body);
  if (type === "risk.flag") return flagRisk(db, admin, body);
  if (type === "statements.regenerate") return regenerateStatements(db, admin);
  if (type === "call.repair") return repairCall(db, admin, body.id);
  if (type === "import.preview" || type === "import.apply") return importUsers(db, admin, body);
  if (type === "bonus.settings") {
    db.settings.approvalBonusPoints = Number(body.points || 0);
    domain.audit(db, admin, "bonus.settings", "settings", String(body.points || 0));
    return { approval_bonus_points: db.settings.approvalBonusPoints };
  }
  throw new HttpError(400, "unknown_action", "不认识这个管理动作");
}

function reviewOffer(db, admin, body) {
  const offer = db.offers.find((item) => item.id === body.id);
  if (!offer) throw new HttpError(404, "offer_not_found", "找不到报价");
  if (offer.status !== "pending") throw new HttpError(409, "review_closed", "该版本已处理");
  if (body.approve && !offer.listing) throw new HttpError(409, "listing_required", "旧版申请缺少交付说明，请退回补充");
  if (!body.approve && !String(body.reason || "").trim()) throw new HttpError(400, "reason_required", "请填写退回原因");
  offer.reason = body.approve ? "" : String(body.reason).trim().slice(0, 500);
  offer.status = body.approve ? "approved" : "rejected";
  if (body.approve) {
    for (const previous of db.offers) {
      if (previous !== offer && previous.clientId === offer.clientId && previous.status === "approved") previous.status = "superseded";
    }
    const client = db.clients.find((item) => item.id === offer.clientId);
    if (client && client.status === "draft") client.status = "listed";
  }
  domain.audit(db, admin, body.approve ? "offer.approve" : "offer.reject", offer.id, "");
  return offer;
}

function setUserStatus(db, admin, body) {
  const user = domain.findUser(db, body.user_id);
  if (!user) throw new HttpError(404, "user_not_found", "用户不存在");
  if (user.id === admin.id && body.status === "disabled") throw new HttpError(400, "cannot_disable_self", "不能停用自己");
  user.status = body.status === "disabled" ? "disabled" : "active";
  domain.audit(db, admin, "user.status", user.id, user.status);
  return domain.publicUser(db, user, { admin: true });
}

function adjustPoints(db, admin, body) {
  const points = Number(body.points);
  if (!points) throw new HttpError(400, "invalid_points", "积分不能为 0");
  if (points > 0) domain.addPoints(db, body.user_id, points, body.reason || "管理员调整", "admin_adjust");
  else domain.spendPoints(db, body.user_id, Math.abs(points), body.reason || "管理员调减");
  domain.audit(db, admin, "user.points", body.user_id, String(points));
  return domain.walletOf(db, body.user_id);
}

function saveCategory(db, admin, body) {
  if (body.id) {
    const row = db.categories.find((item) => item.id === body.id);
    if (!row) throw new HttpError(404, "category_not_found", "分类不存在");
    Object.assign(row, { name: body.name ?? row.name, description: body.description ?? row.description, parentId: body.parent_id ?? row.parentId, enabled: body.enabled ?? row.enabled });
    domain.audit(db, admin, "category.update", row.id, row.name);
    return row;
  }
  const row = { id: id("cat"), categoryKey: id("key"), parentId: body.parent_id || null, name: body.name || "未命名分类", description: body.description || "", sortOrder: db.categories.length, enabled: true, createdAt: new Date().toISOString() };
  db.categories.push(row);
  domain.audit(db, admin, "category.create", row.id, row.name);
  return row;
}

function saveModel(db, admin, body) {
  const key = body.model_key;
  let row = db.models.find((item) => item.modelKey === key);
  if (!row) {
    row = {
      modelKey: key || id("model"),
      displayName: body.display_name || "未命名模型",
      shelf: body.shelf || "对话",
      modelCategory: body.model_category || "chat",
      modelCategories: [body.model_category || "chat"],
      description: body.description || "",
      billingUnit: body.billing_unit || "per_call",
      defaultPoints: Number(body.default_points || 1),
      pointsPer1k: Number(body.default_points || 1),
      providerId: body.provider_id || "sp_local",
      upstreamBaseUrl: body.upstream_base_url || "",
      upstreamApiKey: body.upstream_api_key || "",
      enabled: true,
      timeoutSeconds: 30,
    };
    db.models.push(row);
  } else {
    if (body.display_name) row.displayName = body.display_name;
    if (body.description !== undefined) row.description = body.description;
    if (body.default_points !== undefined) row.defaultPoints = Number(body.default_points);
    if (body.enabled !== undefined) row.enabled = Boolean(body.enabled);
    if (body.billing_unit) row.billingUnit = body.billing_unit;
    if (body.upstream_base_url !== undefined) row.upstreamBaseUrl = body.upstream_base_url;
    if (body.upstream_api_key) row.upstreamApiKey = body.upstream_api_key;
  }
  domain.audit(db, admin, "model.save", row.modelKey, row.displayName);
  return { model_key: row.modelKey, display_name: row.displayName, enabled: row.enabled };
}

function saveRow(db, admin, collection, body, fields) {
  const list = db[collection];
  let row = body.id ? list.find((item) => item.id === body.id) : null;
  if (!row) {
    row = { id: body.id || id(collection.slice(0, 3)) };
    for (const field of fields) if (body[field] !== undefined) row[field] = body[field];
    list.push(row);
  } else {
    for (const field of fields) if (body[field] !== undefined) row[field] = body[field];
  }
  domain.audit(db, admin, `${collection}.save`, row.id, "");
  return row;
}

function saveSettings(db, admin, patch) {
  const allowed = ["brandName", "tagline", "description", "supportContact", "filingText", "membershipSalesEnabled", "developerPrepaidCostEnabled", "hostingAdmissionEnabled", "pointsPerCny", "marginBuffer", "demoExposeOtp", "primaryLoginMethod", "idleMinutes", "publicOrigin", "approvalBonusPoints"];
  for (const key of allowed) if (patch[key] !== undefined) db.settings[key] = patch[key];
  domain.audit(db, admin, "settings.save", "settings", Object.keys(patch).join(","));
  return db.settings;
}

function saveLegal(db, admin, body) {
  if (body.terms) db.legal.terms = body.terms;
  if (body.privacy) db.legal.privacy = body.privacy;
  db.legal.updatedAt = new Date().toISOString();
  domain.audit(db, admin, "legal.save", "legal", "");
  return { updated_at: db.legal.updatedAt };
}

function setClientStatus(db, admin, body) {
  const client = db.clients.find((item) => item.id === body.client_id);
  if (!client) throw new HttpError(404, "client_not_found", "应用不存在");
  client.status = body.status || "listed";
  domain.audit(db, admin, "client.status", client.id, client.status);
  return domain.publicClient(db, client);
}

function setInstance(db, admin, body) {
  const row = db.hostingInstances.find((item) => item.id === body.id);
  if (!row) throw new HttpError(404, "instance_not_found", "实例不存在");
  row.status = body.status || row.status;
  const node = db.hostingNodes.find((item) => item.id === row.nodeId);
  if (node && body.status === "stopped") node.used = Math.max(0, node.used - 1);
  domain.audit(db, admin, "hosting.instance", row.id, row.status);
  return row;
}

function saveRate(db, admin, body) {
  for (const row of db.exchangeRates) row.active = false;
  const rate = { id: id("fx"), pointsPerCny: Number(body.points_per_cny), active: true, createdAt: new Date().toISOString(), note: body.note || "" };
  db.exchangeRates.push(rate);
  db.settings.pointsPerCny = rate.pointsPerCny;
  domain.audit(db, admin, "fx.save", rate.id, String(rate.pointsPerCny));
  return rate;
}

function previewRate(db, body) {
  const next = Number(body.points_per_cny);
  const current = db.settings.pointsPerCny;
  const wallets = db.wallets.length;
  const points = db.wallets.reduce((sum, item) => sum + item.points, 0);
  return { current, next, wallets, points, face_value_cents_now: domain.pointsToCents(db, points), note: "预览不改余额，只比较汇率。" };
}

function createWindow(db, admin, body) {
  const row = { id: id("win"), name: body.name || "钱包代际", status: "draft", ticks: 0, createdAt: new Date().toISOString() };
  db.walletWindows.push(row);
  domain.audit(db, admin, "walletWindow.create", row.id, row.name);
  return row;
}

function windowAction(db, admin, body) {
  const row = db.walletWindows.find((item) => item.id === body.id);
  if (!row) throw new HttpError(404, "window_not_found", "找不到窗口");
  const order = ["draft", "started", "draining", "manifested", "active", "abandoned"];
  if (body.action === "abandon") row.status = "abandoned";
  else if (body.action === "start") row.status = "started";
  else if (body.action === "drain") {
    row.status = "draining";
    row.ticks += 1;
  } else if (body.action === "manifest") row.status = "manifested";
  else if (body.action === "activate") row.status = "active";
  else throw new HttpError(400, "invalid_action", "不支持的窗口动作");
  row.allowed = order;
  domain.audit(db, admin, "walletWindow.action", row.id, row.status);
  return row;
}

function reviewPromoter(db, admin, body) {
  const user = domain.findUser(db, body.user_id);
  if (!user) throw new HttpError(404, "user_not_found", "用户不存在");
  user.promoterStatus = body.status === "approved" ? "approved" : body.status === "revoked" ? "revoked" : "rejected";
  const application = db.promoterApplications.find((item) => item.userId === user.id);
  if (application) application.status = user.promoterStatus;
  domain.audit(db, admin, "promoter.review", user.id, user.promoterStatus);
  return { user_id: user.id, status: user.promoterStatus };
}

function resolveRisk(db, admin, body) {
  const row = db.riskFlags.find((item) => item.id === body.id);
  if (!row) throw new HttpError(404, "flag_not_found", "找不到风险标记");
  row.status = "resolved";
  row.resolvedAt = new Date().toISOString();
  domain.audit(db, admin, "risk.resolve", row.id, "");
  return row;
}

function flagRisk(db, admin, body) {
  const row = { id: id("risk"), userId: body.user_id, reason: body.reason || "人工标记", status: "open", createdAt: new Date().toISOString() };
  db.riskFlags.push(row);
  domain.audit(db, admin, "risk.flag", row.id, row.reason);
  return row;
}

function regenerateStatements(db, admin) {
  const period = new Date().toISOString().slice(0, 7);
  const grouped = new Map();
  for (const line of db.purchases) {
    const current = grouped.get(line.developerId) || 0;
    grouped.set(line.developerId, current + line.developerCents);
  }
  const created = [];
  for (const [userId, cents] of grouped) {
    const row = { id: id("st"), userId, period, commissionCents: cents, status: "open", lines: [{ title: "本期分成", cents }], createdAt: new Date().toISOString() };
    db.statements.push(row);
    created.push(row);
  }
  domain.audit(db, admin, "statements.regenerate", period, String(created.length));
  return { items: created };
}

function repairCall(db, admin, callId) {
  const call = db.calls.find((item) => item.id === callId);
  if (!call) throw new HttpError(404, "call_not_found", "找不到调用");
  if (call.repaired) throw new HttpError(409, "already_repaired", "已经修复过");
  domain.addPoints(db, call.userId, call.points, "调用差错退回", "repair");
  call.repaired = true;
  call.status = "repaired";
  domain.audit(db, admin, "call.repair", call.id, String(call.points));
  return call;
}

function importUsers(db, admin, body) {
  const rows = String(body.csv || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1)
    .map((line) => {
      const [phone, name] = line.split(",");
      return { phone: (phone || "").trim(), name: (name || "").trim() };
    });
  const preview = rows.map((row) => ({
    ...row,
    ok: /^1\d{10}$/.test(row.phone) && !db.users.some((user) => user.phone === row.phone),
  }));
  if (body.type === "import.preview") return { rows: preview };
  const created = [];
  for (const row of preview.filter((item) => item.ok)) {
    const password = randomToken("pw", 6);
    const user = {
      id: id("usr"),
      phone: row.phone,
      email: "",
      name: row.name || `导入${row.phone.slice(-4)}`,
      passwordHash: hashPassword(password),
      roles: ["user"],
      planId: "plan_free",
      developerStatus: "none",
      developerPitch: "",
      promoterStatus: "none",
      inviteCode: randomToken("inv", 4).replace("inv_", "").slice(0, 8).toUpperCase(),
      invitedBy: null,
      monthlyGrantPeriod: new Date().toISOString().slice(0, 7),
      loginFails: 0,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    domain.walletOf(db, user.id);
    created.push({ phone: user.phone, name: user.name, password });
  }
  db.imports.push({ id: id("imp"), count: created.length, createdAt: new Date().toISOString() });
  domain.audit(db, admin, "users.import", "users", String(created.length));
  return { created };
}

module.exports = { mount };
