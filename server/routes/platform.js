const domain = require("../domain");
const path = require("node:path");
const { asyncRoute } = require("../http");
const { page } = require("../lib");

function mount(app, ctx) {
  for (const name of ["api-key-invoke.mjs", "oauth-pkce.mjs"]) {
    app.get(`/examples/${name}`, (req, res) => {
      res.download(path.join(__dirname, "../../examples", name));
    });
  }
  app.get("/v1/platform/system-settings", (req, res) => {
    const settings = ctx.get().settings;
    res.json({
      brand_name: settings.brandName,
      tagline: settings.tagline,
      description: settings.description,
      keywords: settings.keywords,
      logo_url: settings.logoUrl,
      support_contact: settings.supportContact,
      filing_text: settings.filingText,
      membership_sales_enabled: settings.membershipSalesEnabled,
      login: {
        primary_login_method: settings.primaryLoginMethod,
        backup_login_method: settings.backupLoginMethod,
        enabled_methods: settings.enabledLoginMethods,
        otp_available: true,
        demo_otp: settings.demoExposeOtp,
      },
    });
  });

  app.get("/v1/platform/filing-records", (req, res) => {
    res.json({ items: [{ text: ctx.get().settings.filingText }] });
  });

  app.get("/v1/platform/terms-of-service/current", (req, res) => {
    res.json({ updated_at: ctx.get().legal.updatedAt, markdown: ctx.get().legal.terms });
  });

  app.get("/v1/platform/privacy-policy/current", (req, res) => {
    res.json({ updated_at: ctx.get().legal.updatedAt, markdown: ctx.get().legal.privacy });
  });

  app.get("/v1/platform/membership-plans", (req, res) => {
    res.json({ items: ctx.get().plans.filter((item) => item.active).map(domain.publicPlan) });
  });

  app.get("/v1/platform/recharge-packages", (req, res) => {
    res.json({
      items: ctx.get().packages.filter((item) => item.active).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        cny_cents: String(item.cnyCents),
        points: String(item.points),
        display_order: item.displayOrder,
      })),
    });
  });

  app.get("/v1/platform/payment-channels", (req, res) => {
    res.json({
      mock_enabled: true,
      items: [
        { channel: "wechat", name: "微信支付（演示收银台）" },
        { channel: "alipay", name: "支付宝（演示收银台）" },
        { channel: "points", name: "积分余额" },
      ],
    });
  });

  app.get("/v1/platform/application-categories", (req, res) => {
    const items = ctx.get().categories.filter((item) => item.enabled);
    res.json({ items });
  });

  app.get("/v1/platform/models", (req, res) => {
    res.json({ items: ctx.get().models.filter((item) => item.enabled).map(domain.publicModel) });
  });

  app.get("/v1/platform/models/pricing", (req, res) => {
    const db = ctx.get();
    res.json({
      billing_currency: "CNY",
      points_to_cny_rate: (100 / db.settings.pointsPerCny).toFixed(4),
      points_per_cny: db.settings.pointsPerCny,
      items: db.models.filter((item) => item.enabled).map((item) => ({
        ...domain.publicModel(item),
        billing_unit: item.billingUnit,
        default_points_per_call: String(item.defaultPoints),
        pricing_tiers: db.tokenPrices.filter((price) => price.modelKey === item.modelKey && price.active),
      })),
    });
  });

  app.get("/v1/platform/models/documentation", (req, res) => {
    const items = ctx.get().models.filter((item) => item.enabled).map((item) => ({
      model_key: item.modelKey,
      display_name: item.displayName,
      category: item.modelCategory,
      doc_path: `/docs/models/${item.modelKey}`,
    }));
    res.json({ items });
  });

  app.get("/v1/platform/models/:modelKey/documentation", (req, res) => {
    const model = ctx.get().models.find((item) => item.modelKey === req.params.modelKey);
    if (!model) return res.status(404).json({ error: "model_not_found", message: "模型不存在" });
    res.json(domain.documentationForModel(ctx.get(), model));
  });

  app.get("/v1/platform/apps", (req, res) => {
    const db = ctx.get();
    let items = domain.listedClients(db).map((item) => domain.publicClient(db, item));
    if (req.query.category) {
      items = items.filter((item) => item.category && (item.category.id === req.query.category || item.category.name === req.query.category));
    }
    if (req.query.keyword) {
      const keyword = String(req.query.keyword).toLowerCase();
      items = items.filter((item) => `${item.name} ${item.summary} ${(item.tags || []).join(" ")}`.toLowerCase().includes(keyword));
    }
    res.json(page(items, req.query));
  });

  app.get("/v1/platform/apps/:clientId", (req, res) => {
    const db = ctx.get();
    const client = db.clients.find((item) => item.id === req.params.clientId);
    if (!client) return res.status(404).json({ error: "app_not_found", message: "找不到应用" });
    const user = domain.resolveActor(db, req).user;
    const owned = user ? domain.activeEntitlements(db, user.id).some((item) => item.clientId === client.id) : false;
    res.json({ ...domain.publicClient(db, client), owned });
  });

  app.get(
    "/v1/market/categories",
    asyncRoute(async (req, res) => {
      const db = ctx.get();
      const items = db.suppliers.map((supplier) => ({
        supplier_slug: supplier.slug,
        display_name: supplier.name,
        summary: supplier.summary,
        endpoint_count: db.endpoints.filter((item) => item.supplierSlug === supplier.slug && item.enabled).length,
      }));
      res.json({ items });
    })
  );

  app.get("/v1/market/suppliers", (req, res) => {
    res.json({ items: ctx.get().suppliers });
  });

  app.get("/v1/market/endpoints", (req, res) => {
    let items = ctx.get().endpoints.filter((item) => item.enabled);
    if (req.query.supplier) items = items.filter((item) => item.supplierSlug === req.query.supplier);
    if (req.query.keyword) {
      const keyword = String(req.query.keyword).toLowerCase();
      items = items.filter((item) => `${item.name} ${item.summary}`.toLowerCase().includes(keyword));
    }
    res.json(page(items, req.query));
  });

  app.get("/v1/market/endpoints/:supplier/:key", (req, res) => {
    const row = ctx.get().endpoints.find((item) => item.supplierSlug === req.params.supplier && item.endpointKey === req.params.key);
    if (!row) return res.status(404).json({ error: "endpoint_not_found", message: "接口不存在" });
    res.json(row);
  });

  app.get("/v1/market/documentation", (req, res) => {
    const db = ctx.get();
    res.type("text/plain").send(
      db.endpoints
        .filter((item) => item.enabled)
        .map((item) => `${item.method} /v1/data/${item.supplierSlug}/${item.path}  ${item.points} 积分  ${item.name}`)
        .join("\n")
    );
  });

  app.get("/v1/market/endpoints/:supplier/:key/documentation", (req, res) => {
    const row = ctx.get().endpoints.find((item) => item.supplierSlug === req.params.supplier && item.endpointKey === req.params.key);
    if (!row) return res.status(404).json({ error: "endpoint_not_found", message: "接口不存在" });
    res.json({
      ...row,
      markdown: `# ${row.name}\n\n${row.summary}\n\n调用：\`${row.method} /v1/data/${row.supplierSlug}/${row.path}\`\n\n单价：${row.points} 积分。这是演示数据，不会请求外部网站。`,
    });
  });

  app.get("/llms.txt", (req, res) => {
    const origin = `${req.protocol}://${req.get("host")}`;
    res.type("text/plain; charset=utf-8").send(
      [
        "# AI 超市开发者文档",
        "",
        "一个账号使用应用、模型和积分。下面是本站自己的契约。",
        "",
        `- OpenAPI：${origin}/openapi.json`,
        `- 模型索引：${origin}/v1/platform/models`,
        `- 价格：${origin}/v1/platform/models/pricing`,
        `- 数据接口：${origin}/v1/market/documentation`,
        `- 接入说明：${origin}/developer-integration-guide.md`,
        "",
        "调用前先创建 API Key，并 POST /v1/developer/api-keys/{id}/confirm-delivery，请求体必须是 {}。",
        "Authorization: Bearer 和 X-API-Key 只能带一个。",
        "余额不足返回 402 insufficient_balance。",
      ].join("\n")
    );
  });

  app.get("/developer-integration-guide.md", (req, res) => {
    res.type("text/plain; charset=utf-8").send(
      [
        "# 开发者接入指南",
        "",
        "1. 注册并提交入驻申请，等待审核。",
        "2. 在开发者中心创建 API Key。明文只出现一次，确认保存后调用 confirm-delivery。",
        "3. 对话模型走 POST /v1/chat/completions，向量走 /v1/embeddings，图片走 /v1/images/generations，听写走 /v1/audio/transcriptions。",
        "4. 也可以走 POST /v1/developer/models/{model_key}/invoke。",
        "5. 数据接口走 /v1/data/{supplier}/{path}，成功后扣积分，响应头带 X-IdP-Points-Charged。",
        "6. 第三方登录走 /oauth/authorize，令牌用授权码加 PKCE 换取。",
        "7. 积分账户和佣金账户分开。佣金只通过线下结算申请支出。",
        "8. 支付结果以订单 status=paid 为准。",
      ].join("\n")
    );
  });

  app.get("/openapi.json", (req, res) => {
    res.json({
      openapi: "3.1.0",
      info: { title: "AI 超市", version: "1.0.0", description: "应用货架、模型、积分、会员和开发者接口。" },
      paths: openapiPaths(),
    });
  });
}

function openapiPaths() {
  const list = [
    ["get", "/v1/platform/models"],
    ["get", "/v1/platform/models/pricing"],
    ["get", "/v1/platform/apps"],
    ["get", "/v1/platform/membership-plans"],
    ["get", "/v1/platform/recharge-packages"],
    ["post", "/v1/auth/register"],
    ["post", "/v1/auth/login"],
    ["post", "/v1/auth/login/otp"],
    ["get", "/v1/auth/session"],
    ["post", "/v1/chat/completions"],
    ["post", "/v1/embeddings"],
    ["post", "/v1/images/generations"],
    ["post", "/v1/images/edits"],
    ["post", "/v1/audio/transcriptions"],
    ["post", "/v1/points/reserve"],
    ["post", "/v1/points/confirm"],
    ["post", "/v1/points/release"],
    ["post", "/v1/payments/recharge"],
    ["post", "/v1/oauth/token"],
    ["get", "/v1/oauth/userinfo"],
    ["get", "/v1/developer/api-keys"],
    ["post", "/v1/developer/api-keys"],
    ["post", "/v1/developer/api-keys/{id}/confirm-delivery"],
    ["get", "/v1/user/wallet"],
    ["get", "/v1/user/membership"],
    ["get", "/v1/market/endpoints"],
    ["get", "/v1/data/{supplierSlug}/{upstreamPath}"],
  ];
  const paths = {};
  for (const [method, route] of list) {
    const item = paths[route] ||= {};
    const parameters = Array.from(route.matchAll(/\{(\w+)\}/g), ([, name]) => ({
      name, in: "path", required: true, schema: { type: "string" },
    }));
    item[method] = { parameters, responses: { "2XX": { description: "成功" } } };
  }
  return paths;
}

module.exports = { mount };
