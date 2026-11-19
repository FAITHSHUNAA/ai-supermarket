const { hashPassword, id, sha256, nowIso } = require("./lib");

function seed() {
  const t = nowIso();
  const adminId = "usr_admin";
  const userId = "usr_linxiao";
  const devId = "usr_zhouheng";
  const pendingId = "usr_pending";

  const plans = [
    {
      id: "plan_free",
      memberLevel: 0,
      name: "免费会员",
      description: "可以体验免费应用，适合先逛一圈。",
      priceCents: 0,
      monthlyPoints: 0,
      maxAuthorizedApps: 10,
      benefits: ["最多授权 10 个应用", "免费应用打开即用", "模型价格公开可查"],
      developerEnabled: true,
      active: true,
      displayOrder: 0,
    },
    {
      id: "plan_silver",
      memberLevel: 1,
      name: "银卡会员",
      description: "每月赠送积分，适合经常写稿和查资料。",
      priceCents: 2900,
      monthlyPoints: 800,
      maxAuthorizedApps: 30,
      benefits: ["每月 800 积分", "最多授权 30 个应用", "银卡应用可开通"],
      developerEnabled: true,
      active: true,
      displayOrder: 1,
    },
    {
      id: "plan_gold",
      memberLevel: 2,
      name: "金卡会员",
      description: "更高应用额度和创作积分，适合团队里的重度用户。",
      priceCents: 7900,
      monthlyPoints: 3000,
      maxAuthorizedApps: 80,
      benefits: ["每月 3000 积分", "最多授权 80 个应用", "金卡专区"],
      developerEnabled: true,
      active: true,
      displayOrder: 2,
    },
    {
      id: "plan_black",
      memberLevel: 3,
      name: "黑金会员",
      description: "给开发者和工作室的额度，含推广与托管优先。",
      priceCents: 19900,
      monthlyPoints: 9000,
      maxAuthorizedApps: 200,
      benefits: ["每月 9000 积分", "托管优先排队", "推广结算优先审核"],
      developerEnabled: true,
      active: true,
      displayOrder: 3,
    },
  ];

  const categories = [
    cat("cat_office", null, "办公效率", "写作、会议、翻译和日常事务", 0),
    cat("cat_write", "cat_office", "写作", "文案、邮件和提纲", 0),
    cat("cat_meet", "cat_office", "会议", "纪要和待办", 1),
    cat("cat_create", null, "视觉创作", "海报、分镜和配图", 1),
    cat("cat_dev", null, "开发与 Agent", "代码、机器人和工具调用", 2),
    cat("cat_study", null, "学习研究", "阅读、卡片和答疑", 3),
    cat("cat_life", null, "生活服务", "轻量日常工具", 4),
  ];

  const clients = [
    app("app_copy", devId, "cat_write", "文案货架", "按场合生成可直接修改的中文文案。", 0, ["对话", "办公"], "stall-chat-flash"),
    app("app_meet", devId, "cat_meet", "会议速记", "把会议要点收成结论、负责人和下一步。", 1, ["效率", "办公"], "stall-chat-pro"),
    app("app_code", devId, "cat_dev", "代码搭档", "解释报错、补测试、看小段改动。", 0, ["代码", "Agent"], "stall-coder"),
    app("app_poster", devId, "cat_create", "海报工坊", "出一版海报构图和画面说明。", 1, ["视觉", "创作"], "stall-image"),
    app("app_paper", devId, "cat_study", "论文助手", "帮你拆问题、列大纲和整理引用格式。", 1, ["学习"], "stall-chat-pro"),
    app("app_trans", devId, "cat_office", "翻译柜台", "中英互译，保留术语表。", 0, ["办公"], "stall-chat-flash"),
    app("app_support", devId, "cat_dev", "客服分身", "按知识卡片起草回复，不代替人工发出。", 2, ["Agent"], "stall-chat-pro"),
    app("app_board", devId, "cat_create", "灵感画板", "把一句话扩成可执行的创作方向。", 0, ["灵感", "视觉"], "stall-vision"),
  ];

  const offers = [
    offer("app_copy", 0),
    offer("app_meet", 299),
    offer("app_code", 0),
    offer("app_poster", 499),
    offer("app_paper", 199),
    offer("app_trans", 99),
    offer("app_support", 399),
    offer("app_board", 0),
  ];

  const models = [
    model("stall-chat-flash", "柜台风", "对话", "chat", "per_call", 8, "适合短文案和快速问答。"),
    model("stall-chat-pro", "柜台深谈", "对话", "chat", "per_1k_tokens", 12, "更长的说明、纪要和多轮对话。"),
    model("stall-coder", "代码档", "代码", "code", "per_1k_tokens", 15, "读代码、写测试、解释报错。"),
    model("stall-vision", "看图档", "视觉", "vision", "per_call", 20, "根据图片说明回答问题。"),
    model("stall-embed", "向量档", "向量", "embedding", "per_call", 4, "把文本变成演示向量。"),
    model("stall-image", "出图档", "图像", "image", "per_call", 30, "按提示生成一张演示海报。"),
    model("stall-asr", "听写档", "语音", "asr", "per_call", 10, "接收音频并返回演示转写。"),
  ];

  const packages = [
    pack("pkg_10", "10 元体验包", "适合先试一轮对话。", 1000, 1000, 0),
    pack("pkg_30", "30 元常用包", "充 3000 积分，另送 300。", 3000, 3300, 1),
    pack("pkg_68", "68 元创作包", "充 6800 积分，另送 1000。", 6800, 7800, 2),
    pack("pkg_128", "128 元工作室包", "充 12800 积分，另送 2800。", 12800, 15600, 3),
  ];

  const suppliers = [
    { id: "sup_feed", slug: "demo-feed", name: "热榜演示源", summary: "返回站内编写的热榜样例，不连接外部平台。" },
    { id: "sup_note", slug: "demo-note", name: "笔记演示源", summary: "返回站内编写的笔记样例。" },
    { id: "sup_qa", slug: "demo-qa", name: "问答演示源", summary: "返回站内编写的问答样例。" },
  ];

  const endpoints = [
    endpoint("demo-feed", "hot-list", "热榜列表", "GET", "hot-list", 6, "feed"),
    endpoint("demo-feed", "hot-item", "热榜详情", "GET", "hot-list/{id}", 4, "feed"),
    endpoint("demo-note", "search", "笔记检索", "GET", "notes", 8, "note"),
    endpoint("demo-note", "detail", "笔记详情", "GET", "notes/{id}", 5, "note"),
    endpoint("demo-qa", "search", "问答检索", "GET", "questions", 7, "qa"),
    endpoint("demo-qa", "detail", "问答详情", "GET", "questions/{id}", 4, "qa"),
  ];

  const users = [
    user(adminId, "13800000001", "管理员", "admin@ai-market.local", ["user", "admin"], "plan_black", "approved", "ADM1N001", t),
    user(userId, "13800000002", "林晓", "linxiao@ai-market.local", ["user"], "plan_silver", "none", "LINXIAO1", t),
    user(devId, "13800000003", "周衡", "zhouheng@ai-market.local", ["user", "developer"], "plan_gold", "approved", "ZHOUHENG", t),
    user(pendingId, "13800000004", "陈麦", "chenmai@ai-market.local", ["user"], "plan_free", "pending", "CHENMAI1", t),
  ];

  const wallets = [
    wallet(adminId, 20000, 0, 0),
    wallet(userId, 1860, 0, 0),
    wallet(devId, 5400, 0, 12800),
    wallet(pendingId, 100, 0, 0),
  ];

  const entitlements = [
    {
      id: "ent_lin_copy",
      userId,
      clientId: "app_copy",
      status: "active",
      source: "seed",
      createdAt: t,
    },
    {
      id: "ent_lin_code",
      userId,
      clientId: "app_code",
      status: "active",
      source: "seed",
      createdAt: t,
    },
  ];

  const apiKeyPlain = "sk_live_demo_zhouheng_market_key";
  const apiKeys = [
    {
      id: "key_zhou",
      userId: devId,
      name: "工作室默认钥匙",
      prefix: apiKeyPlain.slice(0, 12),
      hash: sha256(apiKeyPlain),
      status: "active",
      environment: "live",
      createdAt: t,
      lastUsedAt: null,
    },
  ];

  const devSecret = "sec_demo_copy_shelf";
  const copy = clients.find((item) => item.id === "app_copy");
  copy.secretHash = sha256(devSecret);
  copy.secretPreview = "sec_demo_copy";
  copy.redirectUris = ["http://127.0.0.1:8787/oauth/callback", "http://localhost:5173/oauth/callback"];

  return {
    users,
    sessions: [],
    otps: [],
    captchas: [],
    wallets,
    ledger: [
      entry(userId, "grant", 2000, "开通银卡时记入的演示积分", t),
      entry(userId, "debit", -140, "使用文案货架", t),
    ],
    reservations: [],
    plans,
    memberships: [
      { id: "mem_lin", userId, planId: "plan_silver", status: "active", startedAt: t, periodStart: t },
    ],
    packages,
    coupons: [
      {
        id: "cpn_welcome",
        code: "WELCOME100",
        name: "新客加赠 100 积分",
        bonusPoints: 100,
        active: true,
        usedCount: 1,
        maxUses: 1000,
      },
    ],
    orders: [],
    categories,
    clients,
    offers,
    purchases: [],
    entitlements,
    refunds: [],
    models,
    calls: [],
    apiKeys,
    oauthCodes: [],
    accessTokens: [],
    sandboxes: [
      {
        id: "sbx_copy",
        clientId: "app_copy",
        ownerId: devId,
        name: "文案货架沙箱",
        status: "active",
        baseUrl: "sandbox://app_copy",
        createdAt: t,
      },
    ],
    hostingPlans: [
      { id: "host_share", name: "共享试用", vcpu: 1, memoryMb: 512, priceCents: 0, minLevel: 0, active: true },
      { id: "host_std", name: "标准实例", vcpu: 2, memoryMb: 2048, priceCents: 3900, minLevel: 1, active: true },
      { id: "host_ded", name: "独享实例", vcpu: 4, memoryMb: 8192, priceCents: 12900, minLevel: 2, active: true },
    ],
    hostingNodes: [
      { id: "node_a", name: "演示节点 A", region: "local", status: "ready", capacity: 8, used: 1 },
    ],
    hostingInstances: [
      {
        id: "inst_copy",
        clientId: "app_copy",
        ownerId: devId,
        planId: "host_share",
        nodeId: "node_a",
        status: "running",
        endpoint: "https://demo.invalid/apps/copy",
        createdAt: t,
      },
    ],
    settlements: [],
    statements: [
      {
        id: "st_zhou_demo",
        userId: devId,
        period: "2026-10",
        commissionCents: 12800,
        status: "open",
        lines: [{ title: "文案货架分成（演示）", cents: 12800 }],
        createdAt: t,
      },
    ],
    referrals: [
      { id: "ref_lin", userId, code: "LINXIAO1", invitedBy: null, boundAt: t },
    ],
    promoterApplications: [
      { id: "prm_zhou", userId: devId, status: "approved", pitch: "希望把代码搭档分享给同事。", createdAt: t },
    ],
    keywords: [
      { id: "kw_1", word: "违禁演示词", enabled: true, note: "命中后拒绝调用" },
    ],
    auditLogs: [],
    accessLogs: [],
    userEvents: [
      { id: "evt_1", userId, type: "seed", message: "创建了演示账号", createdAt: t },
    ],
    suppliers,
    endpoints,
    idempotency: [],
    voices: [
      { id: "voice_f", name: "柜台女声", style: "清晰", enabled: true },
      { id: "voice_m", name: "柜台男声", style: "稳", enabled: true },
    ],
    images: [],
    billingEntries: [],
    splitRules: [
      { id: "split_default", name: "默认分成", platformRate: 0.2, developerRate: 0.7, promoterRate: 0.1, active: true },
    ],
    exchangeRates: [
      { id: "fx_1", pointsPerCny: 100, active: true, createdAt: t, note: "1 元 = 100 积分" },
    ],
    tokenPrices: [
      { id: "tp_chat", modelKey: "stall-chat-pro", inputPer1k: 8, outputPer1k: 16, active: true },
    ],
    shadowProviders: [
      { id: "sp_local", name: "本地演示供应商", billingMode: "usage", monthlyBudgetCents: 50000, active: true },
    ],
    walletWindows: [],
    permissionGroups: [
      { id: "pg_full", name: "超级管理员", permissions: ["*"] },
      { id: "pg_ops", name: "运营", permissions: ["users.read", "apps.review", "orders.read", "content.write"] },
    ],
    riskFlags: [],
    imports: [],
    webhookDeliveries: [],
    settings: {
      brandName: "AI 超市",
      tagline: "一个账号，逛应用、选模型、用积分。",
      description: "把应用、模型和会员积分放进同一家店。",
      keywords: ["AI 应用", "模型调用", "会员积分", "开发者入驻"],
      logoUrl: null,
      supportContact: "",
      filingText: "备案信息尚未配置",
      membershipSalesEnabled: true,
      developerPrepaidCostEnabled: false,
      hostingAdmissionEnabled: true,
      pointsPerCny: 100,
      marginBuffer: 0.15,
      demoExposeOtp: true,
      primaryLoginMethod: "phone_otp",
      backupLoginMethod: "phone_password",
      enabledLoginMethods: ["phone_otp", "phone_password", "email_password"],
      offerMinMultiplier: 1,
      idleMinutes: 30,
      publicOrigin: "",
    },
    legal: {
      terms: termsText(),
      privacy: privacyText(),
      updatedAt: t,
    },
    consents: [],
    secrets: {
      note: "仅用于本地演示，正式环境请轮换。",
      developerApiKey: apiKeyPlain,
      copyClientSecret: devSecret,
    },
  };
}

function cat(idValue, parentId, name, description, sortOrder) {
  return {
    id: idValue,
    categoryKey: idValue,
    parentId,
    name,
    description,
    sortOrder,
    enabled: true,
    createdAt: nowIso(),
  };
}

function app(idValue, ownerId, categoryId, name, summary, minMemberLevel, tags, modelKey) {
  return {
    id: idValue,
    ownerId,
    categoryId,
    name,
    summary,
    description: `${summary} 打开后在本站体验，调用绑定的演示模型，积分按模型价格结算。`,
    homepageUrl: "",
    minMemberLevel,
    tags,
    experience: { type: modelKey.includes("image") ? "image" : "chat", modelKey },
    status: "listed",
    environment: "production",
    parentClientId: null,
    redirectUris: [],
    secretHash: null,
    secretPreview: null,
    secretPending: null,
    webhook: null,
    createdAt: nowIso(),
  };
}

function offer(clientId, pricePoints) {
  return {
    id: id("offer"),
    clientId,
    pricePoints,
    callPricePoints: null,
    billing: "once",
    title: pricePoints === 0 ? "免费开通" : `${pricePoints} 积分开通`,
    status: "approved",
    createdAt: nowIso(),
  };
}

function model(key, displayName, shelf, category, billingUnit, points, description) {
  return {
    modelKey: key,
    displayName,
    shelf,
    modelCategory: category,
    modelCategories: [category],
    description,
    billingUnit,
    defaultPoints: points,
    pointsPer1k: points,
    providerId: "sp_local",
    upstreamBaseUrl: "",
    upstreamApiKey: "",
    enabled: true,
    timeoutSeconds: category === "image" ? 60 : 30,
  };
}

function pack(idValue, name, description, cnyCents, points, displayOrder) {
  return { id: idValue, name, description, cnyCents, points, displayOrder, active: true };
}

function endpoint(supplierSlug, key, name, method, path, points, kind) {
  return {
    id: `${supplierSlug}_${key}`,
    supplierSlug,
    endpointKey: key,
    name,
    method,
    path,
    points,
    kind,
    summary: "演示接口，返回本站编写的样例数据。",
    enabled: true,
  };
}

function user(idValue, phone, name, email, roles, planId, developerStatus, inviteCode, createdAt) {
  return {
    id: idValue,
    phone,
    email,
    name,
    passwordHash: hashPassword(passwordFor(idValue)),
    roles,
    planId,
    developerStatus,
    developerPitch: developerStatus === "none" ? "" : "希望上架自己的 AI 工具。",
    promoterStatus: idValue === "usr_zhouheng" ? "approved" : "none",
    inviteCode,
    invitedBy: null,
    monthlyGrantPeriod: createdAt.slice(0, 7),
    loginFails: 0,
    status: "active",
    createdAt,
  };
}

function passwordFor(userId) {
  if (userId === "usr_admin") return "Admin#123456";
  if (userId === "usr_zhouheng") return "Dev#123456";
  if (userId === "usr_pending") return "Pending#123456";
  return "User#123456";
}

function wallet(userId, points, reserved, commissionCents) {
  return { userId, points, reserved, commissionCents, pendingSettlementCents: 0 };
}

function entry(userId, type, points, reason, createdAt) {
  return { id: id("led"), userId, type, points, reason, createdAt, reservationId: null };
}

function termsText() {
  return [
    "# 用户协议",
    "",
    "欢迎使用本站 AI 超市。注册或继续使用，即表示你同意以下条款。",
    "",
    "1. 本站提供应用浏览、模型调用、会员、积分和开发者入驻。演示环境里的支付、短信和模型结果都是站内模拟，不产生真实扣款。",
    "2. 你应保管自己的账号、API Key 和客户端密钥。明文钥匙只展示一次。",
    "3. 积分先预扣，调用成功后确认，失败后退回。账单可以在个人中心查看。",
    "4. 上架应用需要通过审核。禁止利用本站接口去抓取你没有权利获取的数据。",
    "5. 运营方可以在管理后台调整价格、套餐和文案。已支付的演示订单按站内规则退回积分。",
  ].join("\n");
}

function privacyText() {
  return [
    "# 隐私政策",
    "",
    "我们只为了运营这家超市处理必要资料。",
    "",
    "1. 账号资料包括手机号、邮箱、密码哈希、会员等级和积分流水。",
    "2. 调用记录会保留模型、时间和积分，不把 API Key 写入前端。",
    "3. 演示验证码会出现在页面上，因为这里没有接入真实短信。",
    "4. 你可以在安全设置里修改密码和手机号。停用账号请联系管理员。",
    "5. 本政策文本可在管理后台的法律文书里替换。",
  ].join("\n");
}

module.exports = { seed, passwordFor };
