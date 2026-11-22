const {
  HttpError,
  nowIso,
  id,
  randomToken,
  sha256,
  hashPassword,
  verifyPassword,
  maskPhone,
  must,
  pushCapped,
} = require("./lib");

function publicUser(db, user, { admin = false } = {}) {
  const plan = db.plans.find((item) => item.id === user.planId) || null;
  const wallet = db.wallets.find((item) => item.userId === user.id) || null;
  return {
    id: user.id,
    name: user.name,
    phone: admin ? user.phone : maskPhone(user.phone),
    email: user.email,
    roles: user.roles,
    role: user.roles.includes("admin") ? "admin" : user.roles.includes("developer") ? "developer" : "user",
    developerStatus: user.developerStatus,
    promoterStatus: user.promoterStatus,
    plan: plan && publicPlan(plan),
    wallet: wallet && {
      points: wallet.points,
      reserved: wallet.reserved,
      commission_cents: wallet.commissionCents,
      pending_settlement_cents: wallet.pendingSettlementCents,
    },
    invite_code: user.inviteCode,
    status: user.status,
    created_at: user.createdAt,
  };
}

function publicPlan(plan) {
  return {
    id: plan.id,
    member_level: plan.memberLevel,
    name: plan.name,
    description: plan.description,
    price_cents: String(plan.priceCents),
    monthly_points_included: String(plan.monthlyPoints),
    max_authorized_apps: plan.maxAuthorizedApps,
    benefits: plan.benefits,
    developer_enabled: plan.developerEnabled,
    is_active: plan.active,
    display_order: plan.displayOrder,
  };
}

function publicModel(model) {
  return {
    model_key: model.modelKey,
    model_name: model.modelKey,
    display_name: model.displayName,
    model_description: model.description,
    model_category: model.modelCategory,
    model_categories: model.modelCategories,
    shelf: model.shelf,
    billing_unit: model.billingUnit,
    default_points_per_call: String(model.defaultPoints),
    enabled: model.enabled,
  };
}

function findUser(db, idValue) {
  return db.users.find((item) => item.id === idValue) || null;
}

function findUserByLogin(db, login) {
  const value = String(login || "").trim().toLowerCase();
  if (!value) return null;
  if (db.production) return db.users.find(item => item.username === value) || null;
  return (
    db.users.find((item) => item.phone === login || (item.email && item.email.toLowerCase() === value)) || null
  );
}

function walletOf(db, userId) {
  let wallet = db.wallets.find((item) => item.userId === userId);
  if (!wallet) {
    wallet = { userId, points: 0, reserved: 0, commissionCents: 0, pendingSettlementCents: 0 };
    db.wallets.push(wallet);
  }
  return wallet;
}

function activeRate(db) {
  return db.settings.pointsPerCny || 100;
}

function pointsToCents(db, points) {
  return Math.round((Number(points) * 100) / activeRate(db));
}

function currentPlan(db, user) {
  return must(db.plans.find((item) => item.id === user.planId), 500, "plan_missing", "会员方案缺失");
}

function audit(db, actor, action, target, detail) {
  pushCapped(
    db.auditLogs,
    {
      id: id("aud"),
      actorId: actor ? actor.id : null,
      action,
      target,
      detail,
      createdAt: nowIso(),
    },
    800
  );
}

function event(db, userId, type, message) {
  pushCapped(db.userEvents, { id: id("evt"), userId, type, message, createdAt: nowIso() }, 800);
}

function ledger(db, userId, type, points, reason, extra = {}) {
  const row = { id: id("led"), userId, type, points, reason, createdAt: nowIso(), ...extra };
  db.ledger.push(row);
  return row;
}

function settleMonthlyGrant(db, user) {
  const plan = currentPlan(db, user);
  const period = nowIso().slice(0, 7);
  if (!plan.monthlyPoints || user.monthlyGrantPeriod === period) return;
  user.monthlyGrantPeriod = period;
  const wallet = walletOf(db, user.id);
  wallet.points += plan.monthlyPoints;
  ledger(db, user.id, "monthly_grant", plan.monthlyPoints, `${plan.name} ${period} 月赠积分`);
}

function issueSession(db, user) {
  const session = {
    id: randomToken("sess"),
    userId: user.id,
    createdAt: nowIso(),
    expiresAt: Date.now() + 14 * 24 * 3600 * 1000,
  };
  db.sessions.push(session);
  event(db, user.id, "login", "登录成功");
  return session;
}

function sessionUser(db, sid) {
  if (!sid) return null;
  const session = db.sessions.find((item) => item.id === sid && item.expiresAt > Date.now());
  if (!session) return null;
  const user = findUser(db, session.userId);
  if (!user || user.status !== "active") return null;
  return user;
}

function createCaptcha(db) {
  const left = 2 + Math.floor(Math.random() * 8);
  const right = 1 + Math.floor(Math.random() * 8);
  const row = {
    id: id("cap"),
    answer: String(left + right),
    prompt: `${left} + ${right}`,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  db.captchas.push(row);
  db.captchas = db.captchas.filter((item) => item.expiresAt > Date.now()).slice(-100);
  return { captcha_id: row.id, prompt: row.prompt };
}

function assertCaptcha(db, captchaId, answer) {
  const row = db.captchas.find((item) => item.id === captchaId);
  if (!row || row.expiresAt < Date.now()) throw new HttpError(400, "captcha_expired", "验证码已过期，请换一张");
  if (String(answer).trim() !== row.answer) throw new HttpError(400, "captcha_invalid", "验证码不正确");
  db.captchas = db.captchas.filter((item) => item.id !== row.id);
}

function sendOtp(db, phone, purpose) {
  if (db.production) throw new HttpError(503, "sms_unavailable", "短信服务尚未接通");
  if (!/^1\d{10}$/.test(String(phone || ""))) throw new HttpError(400, "invalid_phone", "请输入 11 位手机号");
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.otps = db.otps.filter((item) => item.expiresAt > Date.now() && !(item.phone === phone && item.purpose === purpose));
  db.otps.push({ id: id("otp"), phone, purpose, code, expiresAt: Date.now() + 5 * 60 * 1000 });
  return db.settings.demoExposeOtp ? { demo_code: code, expires_in: 300 } : { expires_in: 300 };
}

function assertOtp(db, phone, purpose, code) {
  const row = db.otps.find((item) => item.phone === phone && item.purpose === purpose && item.expiresAt > Date.now());
  if (!row || row.code !== String(code || "")) throw new HttpError(400, "otp_invalid", "短信验证码不正确或已过期");
  db.otps = db.otps.filter((item) => item.id !== row.id);
}

function register(db, body) {
  assertCaptcha(db, body.captcha_id, body.captcha_answer);
  let username;
  if (db.production) {
    username = String(body.username || "").trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{2,31}$/.test(username)) throw new HttpError(400, "invalid_username", "用户名须为 3 至 32 位字母、数字或下划线，以字母开头");
    if (typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128) throw new HttpError(400, "invalid_password", "密码须为 12 至 128 个字符");
  } else assertOtp(db, body.phone, "register", body.otp);
  if (!body.privacy_accepted) throw new HttpError(400, "privacy_required", "请先同意用户协议和隐私政策");
  if (!body.password || String(body.password).length < 8) throw new HttpError(400, "weak_password", "密码至少 8 位");
  if (findUserByLogin(db, username || body.phone)) throw new HttpError(409, "account_taken", "该账号已经注册");
  const invite = body.invite_code ? db.users.find((item) => item.inviteCode === String(body.invite_code).trim()) : null;
  const user = {
    id: id("usr"),
    username,
    phone: db.production ? "" : body.phone,
    email: db.production ? "" : body.email || "",
    name: username || body.name || `用户${String(body.phone).slice(-4)}`,
    passwordHash: hashPassword(body.password),
    roles: ["user"],
    planId: "plan_free",
    developerStatus: "none",
    developerPitch: "",
    promoterStatus: "none",
    inviteCode: randomToken("inv", 4).slice(4, 12).toUpperCase(),
    invitedBy: invite ? invite.id : null,
    monthlyGrantPeriod: nowIso().slice(0, 7),
    loginFails: 0,
    status: "active",
    createdAt: nowIso(),
  };
  db.users.push(user);
  walletOf(db, user.id);
  db.referrals.push({ id: id("ref"), userId: user.id, code: user.inviteCode, invitedBy: user.invitedBy, boundAt: nowIso() });
  db.consents.push({ id: id("cns"), userId: user.id, version: db.legal.updatedAt, createdAt: nowIso() });
  if (invite) event(db, invite.id, "referral", `${user.name} 使用了你的邀请码`);
  event(db, user.id, "register", "注册成功");
  const session = issueSession(db, user);
  return { sessionId: session.id, user: publicUser(db, user) };
}

function loginWithPassword(db, body) {
  const user = findUserByLogin(db, body.phone || body.email || body.account);
  if (!user || !verifyPassword(body.password || "", user.passwordHash)) {
    if (user) user.loginFails += 1;
    return { error: new HttpError(401, "invalid_credentials", "账号或密码不正确") };
  }
  if (user.loginFails >= 3) {
    try {
      assertCaptcha(db, body.captcha_id, body.captcha_answer);
    } catch (error) {
      return { error };
    }
  }
  if (user.status !== "active") return { error: new HttpError(403, "user_disabled", "账号已停用") };
  user.loginFails = 0;
  settleMonthlyGrant(db, user);
  const session = issueSession(db, user);
  return { sessionId: session.id, user: publicUser(db, user) };
}

function loginWithOtp(db, body) {
  assertOtp(db, body.phone, "login", body.otp);
  const user = findUserByLogin(db, body.phone);
  if (!user) throw new HttpError(404, "user_not_found", "这个手机号还没有注册");
  if (user.status !== "active") throw new HttpError(403, "user_disabled", "账号已停用");
  user.loginFails = 0;
  settleMonthlyGrant(db, user);
  const session = issueSession(db, user);
  return { sessionId: session.id, user: publicUser(db, user) };
}

function resetPassword(db, body) {
  assertOtp(db, body.phone, "reset", body.otp);
  const user = must(findUserByLogin(db, body.phone), 404, "user_not_found", "找不到这个手机号");
  if (!body.password || String(body.password).length < 8) throw new HttpError(400, "weak_password", "密码至少 8 位");
  user.passwordHash = hashPassword(body.password);
  user.loginFails = 0;
  event(db, user.id, "password_reset", "通过验证码重置了密码");
  return { ok: true };
}

function changePassword(db, user, body) {
  if (!verifyPassword(body.current_password || "", user.passwordHash)) {
    throw new HttpError(400, "invalid_credentials", "当前密码不正确");
  }
  if (!body.password || String(body.password).length < 8) throw new HttpError(400, "weak_password", "新密码至少 8 位");
  user.passwordHash = hashPassword(body.password);
  event(db, user.id, "password_change", "修改了密码");
  return { ok: true };
}

function setPassword(db, user, body) {
  assertOtp(db, user.phone, "set_password", body.otp);
  if (!body.password || String(body.password).length < 8) throw new HttpError(400, "weak_password", "密码至少 8 位");
  user.passwordHash = hashPassword(body.password);
  return { ok: true };
}

function changePhone(db, user, body) {
  assertOtp(db, body.phone, "change_phone", body.otp);
  if (findUserByLogin(db, body.phone)) throw new HttpError(409, "phone_taken", "这个手机号已被使用");
  user.phone = body.phone;
  event(db, user.id, "phone_change", "更换了手机号");
  return { ok: true, phone: maskPhone(user.phone) };
}

function changeEmail(db, user, body) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!email.includes("@")) throw new HttpError(400, "invalid_email", "邮箱格式不正确");
  if (db.users.some((item) => item.email && item.email.toLowerCase() === email && item.id !== user.id)) {
    throw new HttpError(409, "email_taken", "这个邮箱已被使用");
  }
  user.email = email;
  return { ok: true, email };
}

function rebindReferral(db, user, code) {
  const owner = db.users.find((item) => item.inviteCode === String(code || "").trim() && item.id !== user.id);
  if (!owner) throw new HttpError(404, "invite_not_found", "找不到这个邀请码");
  const row = db.referrals.find((item) => item.userId === user.id);
  if (row && row.reboundAt) throw new HttpError(409, "referral_locked", "邀请关系只能改绑一次");
  user.invitedBy = owner.id;
  if (row) {
    row.invitedBy = owner.id;
    row.reboundAt = nowIso();
  } else {
    db.referrals.push({ id: id("ref"), userId: user.id, code: user.inviteCode, invitedBy: owner.id, boundAt: nowIso(), reboundAt: nowIso() });
  }
  return { ok: true, invited_by: owner.name };
}

function spendPoints(db, userId, points, reason) {
  const amount = Number(points);
  if (!Number.isFinite(amount) || amount < 0) throw new HttpError(400, "invalid_points", "积分数量不正确");
  const wallet = walletOf(db, userId);
  if (wallet.points < amount) throw new HttpError(402, "insufficient_balance", "积分余额不足");
  wallet.points -= amount;
  return ledger(db, userId, "debit", -amount, reason);
}

function addPoints(db, userId, points, reason, type = "credit") {
  const amount = Number(points);
  const wallet = walletOf(db, userId);
  wallet.points += amount;
  return ledger(db, userId, type, amount, reason);
}

function reservePoints(db, userId, points, reason, reference) {
  const amount = Number(points);
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "invalid_points", "预扣积分必须大于 0");
  const wallet = walletOf(db, userId);
  if (wallet.points < amount) throw new HttpError(402, "insufficient_balance", "积分余额不足");
  wallet.points -= amount;
  wallet.reserved += amount;
  const reservation = {
    id: id("rsv"),
    userId,
    points: amount,
    status: "reserved",
    reason,
    reference: reference || null,
    createdAt: nowIso(),
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  db.reservations.push(reservation);
  ledger(db, userId, "reserve", -amount, reason, { reservationId: reservation.id });
  return reservation;
}

function confirmReservation(db, reservationId, actorId) {
  const row = must(db.reservations.find((item) => item.id === reservationId), 404, "reservation_not_found", "找不到预扣记录");
  if (actorId && row.userId !== actorId) throw new HttpError(403, "forbidden", "不能确认别人的预扣");
  if (row.status !== "reserved") throw new HttpError(409, "reservation_closed", "这笔预扣已经结束");
  row.status = "confirmed";
  const wallet = walletOf(db, row.userId);
  wallet.reserved -= row.points;
  ledger(db, row.userId, "confirm", 0, "确认消耗预扣积分", { reservationId: row.id });
  return row;
}

function releaseReservation(db, reservationId, actorId) {
  const row = must(db.reservations.find((item) => item.id === reservationId), 404, "reservation_not_found", "找不到预扣记录");
  if (actorId && row.userId !== actorId) throw new HttpError(403, "forbidden", "不能释放别人的预扣");
  if (row.status !== "reserved") throw new HttpError(409, "reservation_closed", "这笔预扣已经结束");
  row.status = "released";
  const wallet = walletOf(db, row.userId);
  wallet.reserved -= row.points;
  wallet.points += row.points;
  ledger(db, row.userId, "release", row.points, "释放预扣积分", { reservationId: row.id });
  return row;
}

function quoteModel(model, usage) {
  if (model.billingUnit === "per_1k_tokens") {
    const tokens = Math.max(1, usage.total_tokens || 1);
    return Math.max(1, Math.ceil((tokens / 1000) * (model.pointsPer1k || model.defaultPoints)));
  }
  return model.defaultPoints;
}

function checkContent(db, text) {
  const hay = String(text || "");
  const hit = db.keywords.find((item) => item.enabled && item.word && hay.includes(item.word));
  if (hit) throw new HttpError(400, "content_rejected", `内容未通过安全检查：${hit.word}`);
}

function authenticateApiKey(db, token) {
  const row = db.apiKeys.find((item) => item.hash === sha256(token));
  if (!row) throw new HttpError(401, "invalid_api_key", "API Key 无效");
  if (row.status === "delivery_pending") throw new HttpError(409, "api_key_delivery_pending", "请先确认已经保存这把钥匙");
  if (row.status !== "active") throw new HttpError(401, "api_key_revoked", "API Key 已吊销");
  row.lastUsedAt = nowIso();
  return row;
}

function authenticateAccessToken(db, token) {
  const row = db.accessTokens.find((item) => item.hash === sha256(token) && item.expiresAt > Date.now() && !item.revoked);
  if (!row) return null;
  return row;
}

function resolveActor(db, req) {
  const header = req.get("authorization") || "";
  const apiHeader = req.get("x-api-key");
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (bearer && apiHeader) throw new HttpError(400, "ambiguous_credentials", "不能同时发送 Authorization 和 X-API-Key");
  const token = bearer || apiHeader || "";
  if (token.startsWith("sk_")) {
    const key = authenticateApiKey(db, token);
    const user = must(findUser(db, key.userId), 401, "invalid_api_key", "钥匙没有对应的用户");
    return { user, kind: "api_key", apiKey: key, client: null };
  }
  if (token.startsWith("atk_")) {
    const access = must(authenticateAccessToken(db, token), 401, "invalid_token", "访问令牌无效");
    const user = must(findUser(db, access.userId), 401, "invalid_token", "令牌没有对应的用户");
    const client = db.clients.find((item) => item.id === access.clientId) || null;
    return { user, kind: "oauth", apiKey: null, client, access };
  }
  const sid = token.startsWith("sess_") ? token : req.cookies && req.cookies.sid;
  const user = sessionUser(db, sid);
  if (!user) return { user: null, kind: "anonymous", apiKey: null, client: null };
  return { user, kind: "session", apiKey: null, client: null };
}

function requireUser(actor) {
  if (!actor.user) throw new HttpError(401, "login_required", "请先登录");
  return actor.user;
}

function requireAdmin(actor) {
  const user = requireUser(actor);
  if (!user.roles.includes("admin")) throw new HttpError(403, "admin_required", "需要管理员权限");
  return user;
}

function requireDeveloper(actor) {
  const user = requireUser(actor);
  if (user.developerStatus !== "approved" && !user.roles.includes("admin")) {
    throw new HttpError(403, "developer_required", "开发者申请还没有通过");
  }
  return user;
}

function listedClients(db) {
  return db.clients.filter((item) => item.environment === "production" && item.status === "listed");
}

function publicClient(db, client) {
  const category = db.categories.find((item) => item.id === client.categoryId) || null;
  const offer = db.offers.find((item) => item.clientId === client.id && item.status === "approved") || null;
  const owner = findUser(db, client.ownerId);
  return {
    client_id: client.id,
    name: client.name,
    summary: client.summary,
    description: client.description,
    homepage_url: client.homepageUrl || null,
    min_member_level: client.minMemberLevel,
    tags: client.tags,
    status: client.status,
    commerce_status: offer ? "on_sale" : "unconfigured",
    commercial_offer: offer && {
      id: offer.id,
      price_points: offer.pricePoints,
      title: offer.title,
      billing: offer.billing,
      status: offer.status,
      listing: offer.listing && Object.fromEntries(Object.entries(offer.listing).filter(([key]) => key !== "delivery_url")),
    },
    category: category && { id: category.id, name: category.name, parent_id: category.parentId },
    developer: owner ? { id: owner.id, name: owner.name } : null,
    experience: client.experience,
    created_at: client.createdAt,
  };
}

function activeEntitlements(db, userId) {
  return db.entitlements.filter((item) => item.userId === userId && item.status === "active");
}

function grantEntitlement(db, user, client, source, orderId, snapshot) {
  const plan = currentPlan(db, user);
  const owned = activeEntitlements(db, user.id);
  if (owned.some((item) => item.clientId === client.id)) return owned.find((item) => item.clientId === client.id);
  if (owned.length >= plan.maxAuthorizedApps) throw new HttpError(409, "app_limit_reached", "已达到当前会员可授权应用数");
  if (plan.memberLevel < client.minMemberLevel) throw new HttpError(403, "membership_required", "会员等级不够，无法开通这个应用");
  const row = { id: id("ent"), userId: user.id, clientId: client.id, status: "active", source, orderId: orderId || null, createdAt: nowIso() };
  db.entitlements.push(row);
  if (snapshot) row.snapshot = snapshot;
  return row;
}

function applySplit(db, payer, client, points) {
  const rule = db.splitRules.find((item) => item.active) || { platformRate: 0.2, developerRate: 0.8, promoterRate: 0 };
  const cents = pointsToCents(db, points);
  if (!cents || !client.ownerId) return null;
  let developerRate = rule.developerRate;
  let promoterRate = 0;
  const promoterId = payer.invitedBy;
  const promoter = promoterId ? findUser(db, promoterId) : null;
  if (promoter && promoter.promoterStatus === "approved") {
    promoterRate = rule.promoterRate;
    developerRate = Math.max(0, rule.developerRate);
  } else {
    developerRate += rule.promoterRate;
  }
  const developerCents = Math.round(cents * developerRate);
  const promoterCents = Math.round(cents * promoterRate);
  const ownerWallet = walletOf(db, client.ownerId);
  ownerWallet.commissionCents += developerCents;
  if (promoter && promoterCents) walletOf(db, promoter.id).commissionCents += promoterCents;
  const line = {
    id: id("earn"),
    payerId: payer.id,
    clientId: client.id,
    developerId: client.ownerId,
    promoterId: promoter && promoterCents ? promoter.id : null,
    points,
    cents,
    developerCents,
    promoterCents,
    platformCents: cents - developerCents - promoterCents,
    createdAt: nowIso(),
  };
  db.purchases.push(line);
  return line;
}

function createOrder(db, user, fields) {
  if (db.production) require("./merchant").requireChannel(fields.channel);
  const order = {
    id: id("ord"),
    outTradeNo: randomToken("pay", 8),
    userId: user.id,
    status: "pending",
    channel: fields.channel || "wechat",
    createdAt: nowIso(),
    paidAt: null,
    ...fields,
  };
  db.orders.push(order);
  return order;
}

function couponBonus(db, code, user) {
  if (!code) return 0;
  const coupon = db.coupons.find((item) => item.code.toLowerCase() === String(code).trim().toLowerCase() && item.active);
  if (!coupon) throw new HttpError(404, "coupon_not_found", "优惠券不存在");
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) throw new HttpError(409, "coupon_exhausted", "优惠券已用完");
  if (db.orders.some((item) => item.userId === user.id && item.couponCode === coupon.code && item.status === "paid")) {
    throw new HttpError(409, "coupon_used", "你已经用过这张券");
  }
  return coupon;
}

function createAppOrder(db, user, body) {
  const client = must(
    db.clients.find((item) => item.id === body.client_id && item.status === "listed"),
    404,
    "app_not_found",
    "找不到这个应用"
  );
  const offer = db.offers.find((item) => item.clientId === client.id && item.status === "approved");
  if (!offer) throw new HttpError(409, "offer_unconfigured", "这个应用还没有可售报价");
  const snapshot = { offerId:offer.id, name:client.name, summary:client.summary, pricePoints:offer.pricePoints,
    listing:offer.listing ? structuredClone(offer.listing) : null };
  if (activeEntitlements(db, user.id).some((item) => item.clientId === client.id)) {
    throw new HttpError(409, "already_owned", "你已经开通了这个应用");
  }
  const plan = currentPlan(db, user);
  if (plan.memberLevel < client.minMemberLevel) throw new HttpError(403, "membership_required", "会员等级不够");
  if (offer.pricePoints === 0 || body.channel === "points") {
    if (offer.pricePoints > 0) spendPoints(db, user.id, offer.pricePoints, `开通应用 ${client.name}`);
    const entitlement = grantEntitlement(db, user, client, "purchase", null, snapshot);
    const split = offer.pricePoints > 0 ? applySplit(db, user, client, offer.pricePoints) : null;
    event(db, user.id, "app_purchase", `开通了 ${client.name}`);
    return { status: "paid", entitlement, split, order: null };
  }
  const order = createOrder(db, user, {
    kind: "app",
    snapshot,
    title: `开通 ${client.name}`,
    clientId: client.id,
    points: offer.pricePoints,
    amountCents: pointsToCents(db, offer.pricePoints),
    channel: body.channel || "wechat",
  });
  return { status: "pending", order: publicOrder(order), billing_url: `/pay/${order.outTradeNo}` };
}

function createRechargeOrder(db, user, body) {
  if (body.package_id) {
    const pack = must(db.packages.find((item) => item.id === body.package_id && item.active), 404, "package_not_found", "找不到充值套餐");
    const coupon = couponBonus(db, body.coupon_code, user);
    const order = createOrder(db, user, {
      kind: "recharge",
      title: pack.name,
      packageId: pack.id,
      points: pack.points + (coupon ? coupon.bonusPoints : 0),
      amountCents: pack.cnyCents,
      couponCode: coupon ? coupon.code : null,
      channel: body.channel || "wechat",
    });
    return publicOrder(order);
  }
  const cents = Number(body.cny_cents || body.amount_cents);
  if (!Number.isInteger(cents) || cents < 100) throw new HttpError(400, "invalid_amount", "自定义充值至少 1 元");
  const order = createOrder(db, user, {
    kind: "recharge",
    title: "自定义充值",
    points: Math.round((cents / 100) * activeRate(db)),
    amountCents: cents,
    channel: body.channel || "wechat",
  });
  return publicOrder(order);
}

function createMembershipOrder(db, user, body) {
  if (!db.settings.membershipSalesEnabled) throw new HttpError(403, "membership_sales_disabled", "会员购买已暂停");
  const plan = must(db.plans.find((item) => item.id === body.plan_id && item.active), 404, "plan_not_found", "找不到会员方案");
  if (plan.memberLevel < currentPlan(db, user).memberLevel) {
    throw new HttpError(400, "use_downgrade", "降级请走降级接口");
  }
  if (plan.priceCents === 0) {
    activatePlan(db, user, plan, null);
    return { status: "paid", plan: publicPlan(plan) };
  }
  const order = createOrder(db, user, {
    kind: "membership",
    title: plan.name,
    planId: plan.id,
    points: plan.monthlyPoints,
    amountCents: plan.priceCents,
    channel: body.channel || "wechat",
  });
  return { status: "pending", order: publicOrder(order), billing_url: `/pay/${order.outTradeNo}` };
}

function activatePlan(db, user, plan, orderId) {
  user.planId = plan.id;
  db.memberships.push({ id: id("mem"), userId: user.id, planId: plan.id, status: "active", orderId, startedAt: nowIso(), periodStart: nowIso() });
  if (plan.monthlyPoints) addPoints(db, user.id, plan.monthlyPoints, `${plan.name} 开通赠送`, "monthly_grant");
  user.monthlyGrantPeriod = nowIso().slice(0, 7);
  event(db, user.id, "membership", `会员变为 ${plan.name}`);
}

function downgrade(db, user, planId) {
  const plan = must(db.plans.find((item) => item.id === planId && item.active), 404, "plan_not_found", "找不到会员方案");
  if (plan.memberLevel > currentPlan(db, user).memberLevel) throw new HttpError(400, "not_a_downgrade", "这不是降级");
  const owned = activeEntitlements(db, user.id);
  if (owned.length > plan.maxAuthorizedApps) {
    throw new HttpError(409, "too_many_apps", "请先减少已开通应用，再降到这个等级");
  }
  user.planId = plan.id;
  db.memberships.push({ id: id("mem"), userId: user.id, planId: plan.id, status: "downgraded", startedAt: nowIso() });
  event(db, user.id, "membership", `降级为 ${plan.name}`);
  return publicPlan(plan);
}

function publicOrder(order) {
  return {
    id: order.id,
    out_trade_no: order.outTradeNo,
    status: order.status,
    kind: order.kind,
    title: order.title,
    amount_cents: order.amountCents,
    points: order.points,
    channel: order.channel,
    billing_url: order.status === "pending" ? `/pay/${order.outTradeNo}` : null,
    created_at: order.createdAt,
    paid_at: order.paidAt,
  };
}

function confirmOrder(db, user, outTradeNo) {
  const order = must(db.orders.find((item) => item.outTradeNo === outTradeNo), 404, "order_not_found", "找不到订单");
  if (user && order.userId !== user.id && !user.roles.includes("admin")) throw new HttpError(403, "forbidden", "不能支付别人的订单");
  if (order.status === "paid") return publicOrder(order);
  if (order.status !== "pending") throw new HttpError(409, "order_closed", "订单已关闭");
  const payer = must(findUser(db, order.userId), 404, "user_not_found", "用户不存在");
  order.status = "paid";
  order.paidAt = nowIso();
  if (order.couponCode) {
    const coupon = db.coupons.find((item) => item.code === order.couponCode);
    if (coupon) coupon.usedCount += 1;
  }
  if (order.kind === "recharge") {
    addPoints(db, payer.id, order.points, order.title, "recharge");
  } else if (order.kind === "membership") {
    const plan = must(db.plans.find((item) => item.id === order.planId), 500, "plan_missing", "方案缺失");
    activatePlan(db, payer, plan, order.id);
  } else if (order.kind === "app") {
    const client = must(db.clients.find((item) => item.id === order.clientId), 404, "app_not_found", "应用不存在");
    grantEntitlement(db, payer, client, "cash", order.id, order.snapshot);
    applySplit(db, payer, client, order.points);
  }
  event(db, payer.id, "payment", `支付成功：${order.title}`);
  return publicOrder(order);
}

function requestRefund(db, user, body) {
  const entitlement = must(
    db.entitlements.find((item) => item.id === body.entitlement_id && item.userId === user.id && item.status === "active"),
    404,
    "entitlement_not_found",
    "找不到可退的开通记录"
  );
  const existing = db.refunds.find((item) => item.entitlementId === entitlement.id && item.status === "pending");
  if (existing) throw new HttpError(409, "refund_pending", "已有进行中的售后");
  const refund = {
    id: id("rfd"),
    entitlementId: entitlement.id,
    userId: user.id,
    clientId: entitlement.clientId,
    reason: body.reason || "",
    status: "pending",
    createdAt: nowIso(),
  };
  db.refunds.push(refund);
  return refund;
}

function decideRefund(db, admin, refundId, approve) {
  const refund = must(db.refunds.find((item) => item.id === refundId), 404, "refund_not_found", "找不到售后单");
  if (refund.status !== "pending") throw new HttpError(409, "refund_closed", "售后已处理");
  const entitlement = must(db.entitlements.find((item) => item.id === refund.entitlementId), 404, "entitlement_not_found", "开通记录不存在");
  if (!approve) {
    refund.status = "rejected";
    audit(db, admin, "refund.reject", refund.id, refund.reason);
    return refund;
  }
  refund.status = "approved";
  entitlement.status = "revoked";
  const purchase = [...db.purchases].reverse().find((item) => item.payerId === entitlement.userId && item.clientId === entitlement.clientId);
  if (purchase) {
    addPoints(db, entitlement.userId, purchase.points, "应用售后退回积分", "refund");
    const owner = walletOf(db, purchase.developerId);
    owner.commissionCents = Math.max(0, owner.commissionCents - purchase.developerCents);
  }
  audit(db, admin, "refund.approve", refund.id, "");
  return refund;
}

function invokeModel(db, actor, modelKey, input, meta = {}) {
  const model = must(db.models.find((item) => item.modelKey === modelKey && item.enabled), 404, "model_not_found", "模型不存在或已下架");
  const user = requireUser(actor);
  const text = extractText(input);
  checkContent(db, text);
  const usage = estimateUsage(text, input);
  let points = quoteModel(model, usage);
  if (actor.client) {
    const offer = db.offers.find((item) => item.clientId === actor.client.id && item.status === "approved");
    if (offer && offer.callPricePoints) points = Math.max(points, offer.callPricePoints);
    if (offer && offer.callPricePoints && offer.callPricePoints < model.defaultPoints) {
      throw new HttpError(400, "price_below_model_default", "应用调用价不能低于模型默认积分");
    }
  }
  const reservation = reservePoints(db, user.id, points, `调用 ${model.displayName}`, model.modelKey);
  try {
    const output = renderModelOutput(model, input, text);
    if (model.modelCategory === "image") {
      storeImage(db, output.token, output.prompt);
      output.url = `/v1/generated-images/${output.token}`;
    }
    confirmReservation(db, reservation.id, user.id);
    const call = {
      id: id("call"),
      userId: user.id,
      modelKey: model.modelKey,
      clientId: actor.client ? actor.client.id : null,
      points,
      usage,
      status: "succeeded",
      createdAt: nowIso(),
    };
    db.calls.push(call);
    return { model, points, usage, output, call, reservation };
  } catch (error) {
    if (reservation.status === "reserved") releaseReservation(db, reservation.id, user.id);
    throw error;
  }
}

function extractText(input) {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (Array.isArray(input.messages)) {
    return input.messages.map((item) => (typeof item.content === "string" ? item.content : JSON.stringify(item.content || ""))).join("\n");
  }
  if (typeof input.prompt === "string") return input.prompt;
  if (typeof input.input === "string") return input.input;
  return JSON.stringify(input).slice(0, 4000);
}

function estimateUsage(text, input) {
  const prompt = Math.max(1, Math.ceil(String(text || "").length / 2));
  const completion = Math.max(16, Math.min(240, Math.ceil(prompt * 0.6)));
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
}

function renderModelOutput(model, input, text) {
  if (model.modelCategory === "embedding") {
    const digest = sha256(text);
    const vector = [];
    for (let i = 0; i < 8; i += 1) vector.push(Number.parseInt(digest.slice(i * 2, i * 2 + 2), 16) / 255);
    return { object: "embedding", embedding: vector, model: model.modelKey };
  }
  if (model.modelCategory === "image") {
    const token = randomToken("img", 8);
    return { token, prompt: text.slice(0, 180), model: model.modelKey };
  }
  if (model.modelCategory === "asr") {
    return { text: "演示转写：已收到音频。正式听写需要在管理后台配置上游供应商。" };
  }
  const question = text.split("\n").filter(Boolean).slice(-1)[0] || "你好";
  const reply = [
    `这是 ${model.displayName} 的演示回复。`,
    `你刚才说：「${question.slice(0, 180)}」`,
    "正式环境可以在模型设置里填写上游地址，本站会按同样的预扣、确认和释放规则转发。",
  ].join("\n");
  return { role: "assistant", content: reply };
}

function storeImage(db, token, prompt) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="100%" height="100%" fill="#14121f"/><text x="48" y="120" fill="#ddd6ff" font-size="36" font-family="sans-serif">AI 超市 · 演示海报</text><text x="48" y="190" fill="#ffffff" font-size="22" font-family="sans-serif">${escapeXml(
    prompt || "未命名"
  ).slice(0, 42)}</text></svg>`;
  db.images.push({ token, svg, createdAt: nowIso() });
  if (db.images.length > 50) db.images.splice(0, db.images.length - 50);
  return svg;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function createApiKey(db, user, name) {
  requireApprovedDeveloper(user);
  const plain = randomToken("sk_live", 18);
  const row = {
    id: id("key"),
    userId: user.id,
    name: name || "未命名钥匙",
    prefix: plain.slice(0, 12),
    hash: sha256(plain),
    status: "delivery_pending",
    environment: "live",
    createdAt: nowIso(),
    lastUsedAt: null,
  };
  db.apiKeys.push(row);
  return { key: publicApiKey(row), api_key: plain };
}

function publicApiKey(row) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    status: row.status,
    environment: row.environment,
    created_at: row.createdAt,
    last_used_at: row.lastUsedAt,
  };
}

function requireApprovedDeveloper(user) {
  if (user.developerStatus !== "approved" && !user.roles.includes("admin")) {
    throw new HttpError(403, "developer_required", "请先通过开发者审核");
  }
}

function confirmKeyDelivery(db, user, keyId) {
  const row = must(db.apiKeys.find((item) => item.id === keyId && item.userId === user.id), 404, "api_key_not_found", "找不到这把钥匙");
  if (row.status === "active") return publicApiKey(row);
  if (row.status !== "delivery_pending") throw new HttpError(409, "api_key_revoked", "钥匙已失效");
  row.status = "active";
  return publicApiKey(row);
}

function revokeKey(db, user, keyId, admin) {
  const row = must(
    db.apiKeys.find((item) => item.id === keyId && (admin || item.userId === user.id)),
    404,
    "api_key_not_found",
    "找不到这把钥匙"
  );
  row.status = "revoked";
  return publicApiKey(row);
}

function createClient(db, user, body) {
  requireApprovedDeveloper(user);
  if (body.product_only && (![body.name,body.summary].every(v=>typeof v === "string" && v.trim()))) throw new HttpError(400,"product_required","请填写商品名称和简介");
  const secret = body.product_only ? null : randomToken("sec", 18);
  const client = {
    id: id("app"),
    ownerId: user.id,
    categoryId: body.category_id || null,
    name: body.name || "未命名应用",
    summary: body.summary || "",
    description: body.description || "",
    homepageUrl: body.homepage_url || "",
    minMemberLevel: Number(body.min_member_level || 0),
    tags: Array.isArray(body.tags) ? body.tags : [],
    experience: body.experience || { type: "chat", modelKey: "stall-chat-flash" },
    status: "draft",
    environment: "production",
    parentClientId: null,
    redirectUris: Array.isArray(body.redirect_uris) ? body.redirect_uris : [],
    secretHash: secret ? sha256(secret) : null,
    secretPreview: secret?.slice(0, 12) || null,
    secretPending: secret,
    webhook: null,
    createdAt: nowIso(),
  };
  db.clients.push(client);
  return { client: publicClient(db, client), client_secret: secret };
}

function submitOffer(db, user, clientId, body) {
  const client = must(ownedClient(db, user, clientId), 404, "client_not_found", "找不到应用");
  if (body.revision !== undefined && body.revision !== (client.offerDraft?.revision || 0)) throw new HttpError(409,"draft_changed","草稿已更新，请重新打开后提交");
  if (db.offers.some(item => item.clientId === client.id && item.status === "pending")) throw new HttpError(409, "review_pending", "已有待审核版本");
  const price = body.price_points;
  if (!Number.isSafeInteger(price) || price < 0) throw new HttpError(400, "invalid_price", "价格须为非负整数积分");
  if (body.billing && body.billing !== "once") throw new HttpError(400, "invalid_billing", "仅支持一次性开通");
  const listing = require("./listing").validateListing(body.listing);
  const modelKey = client.experience && client.experience.modelKey;
  const model = db.models.find((item) => item.modelKey === modelKey);
  if (body.call_price_points && model && Number(body.call_price_points) < model.defaultPoints) {
    throw new HttpError(400, "price_below_model_default", "单次调用价不能低于模型默认积分");
  }
  const offer = {
    id: id("offer"),
    clientId: client.id,
    pricePoints: price,
    listing,
    reviewNotes: require("./listing").reviewNotes(db, body.review_notes),
    callPricePoints: body.call_price_points ? Number(body.call_price_points) : null,
    billing: body.billing || "once",
    title: body.title || `${price} 积分开通`,
    status: "pending",
    createdAt: nowIso(),
  };
  db.offers.push(offer);
  delete client.offerDraft;
  return offer;
}

function ownedClient(db, user, clientId) {
  return db.clients.find((item) => item.id === clientId && (item.ownerId === user.id || user.roles.includes("admin")));
}

function applyDeveloper(db, user, pitch) {
  if (typeof pitch !== "string" || !pitch.trim() || pitch.trim().length > 2000) throw new HttpError(400, "invalid_pitch", "请填写 1 至 2000 字的商品说明");
  if (user.developerStatus === "approved") throw new HttpError(409, "already_developer", "你已经是开发者");
  if (user.developerStatus === "pending") throw new HttpError(409, "application_pending", "申请正在审核");
  user.developerStatus = "pending";
  user.developerPitch = pitch.trim();
  user.developerReviewReason = "";
  if (!user.roles.includes("developer")) {
    /* role is granted on approval */
  }
  event(db, user.id, "developer_apply", "提交了开发者入驻申请");
  return { status: user.developerStatus, pitch: user.developerPitch };
}

function reviewDeveloper(db, admin, userId, approve, reason) {
  const user = must(findUser(db, userId), 404, "user_not_found", "用户不存在");
  if (user.developerStatus !== "pending") throw new HttpError(409, "review_closed", "这份申请已处理");
  user.developerReviewReason = approve ? "" : String(reason || "").trim().slice(0, 500);
  if (approve) {
    user.developerStatus = "approved";
    if (!user.roles.includes("developer")) user.roles.push("developer");
    const bonus = db.settings.approvalBonusPoints || 0;
    if (bonus) addPoints(db, user.id, bonus, "开发者审核通过奖励", "bonus");
  } else {
    user.developerStatus = "rejected";
    user.roles = user.roles.filter((role) => role !== "developer");
  }
  audit(db, admin, approve ? "developer.approve" : "developer.reject", user.id, reason || "");
  return publicUser(db, user, { admin: true });
}

function createSandbox(db, user, clientId) {
  const client = must(ownedClient(db, user, clientId), 404, "client_not_found", "找不到应用");
  const row = {
    id: id("sbx"),
    clientId: client.id,
    ownerId: user.id,
    name: `${client.name} 沙箱`,
    status: "active",
    baseUrl: `sandbox://${client.id}`,
    createdAt: nowIso(),
  };
  db.sandboxes.push(row);
  return row;
}

function createHosting(db, user, body) {
  const plan = must(db.hostingPlans.find((item) => item.id === body.plan_id && item.active), 404, "plan_not_found", "找不到托管方案");
  const member = currentPlan(db, user);
  if (db.settings.hostingAdmissionEnabled && member.memberLevel < plan.minLevel) {
    throw new HttpError(403, "hosting_level_required", "会员等级不够，不能开通这个托管方案");
  }
  const client = must(ownedClient(db, user, body.client_id), 404, "client_not_found", "找不到应用");
  const node = db.hostingNodes.find((item) => item.status === "ready" && item.used < item.capacity);
  const instance = {
    id: id("inst"),
    clientId: client.id,
    ownerId: user.id,
    planId: plan.id,
    nodeId: node ? node.id : null,
    status: node && plan.priceCents === 0 ? "running" : "pending",
    endpoint: node ? `https://demo.invalid/apps/${client.id}` : null,
    createdAt: nowIso(),
  };
  if (node && instance.status === "running") node.used += 1;
  db.hostingInstances.push(instance);
  return instance;
}

function requestSettlement(db, user, body) {
  const wallet = walletOf(db, user.id);
  const cents = Number(body.amount_cents || wallet.commissionCents);
  if (!Number.isInteger(cents) || cents <= 0) throw new HttpError(400, "invalid_amount", "结算金额不正确");
  if (wallet.commissionCents < cents) throw new HttpError(402, "insufficient_commission", "可结算佣金不足");
  if (db.settlements.some((item) => item.userId === user.id && ["pending", "processing"].includes(item.status))) {
    throw new HttpError(409, "settlement_open", "还有未完成的结算申请");
  }
  wallet.commissionCents -= cents;
  wallet.pendingSettlementCents += cents;
  const row = {
    id: id("stl"),
    requestNo: randomToken("set", 6),
    userId: user.id,
    amountCents: cents,
    status: "pending",
    note: body.note || "线下结算",
    createdAt: nowIso(),
  };
  db.settlements.push(row);
  return row;
}

function transitionSettlement(db, admin, requestNo, action, note) {
  const row = must(db.settlements.find((item) => item.requestNo === requestNo), 404, "settlement_not_found", "找不到结算单");
  const wallet = walletOf(db, row.userId);
  if (action === "cancel" || action === "reject") {
    if (!["pending", "processing"].includes(row.status)) throw new HttpError(409, "settlement_closed", "结算单已结束");
    wallet.pendingSettlementCents -= row.amountCents;
    wallet.commissionCents += row.amountCents;
    row.status = action === "cancel" ? "cancelled" : "rejected";
  } else if (action === "start") {
    if (row.status !== "pending") throw new HttpError(409, "settlement_closed", "结算单不在待处理");
    row.status = "processing";
  } else if (action === "paid") {
    if (!["pending", "processing"].includes(row.status)) throw new HttpError(409, "settlement_closed", "结算单已结束");
    wallet.pendingSettlementCents -= row.amountCents;
    row.status = "paid";
    row.paidAt = nowIso();
  } else {
    throw new HttpError(400, "invalid_action", "不支持的结算动作");
  }
  row.adminNote = note || "";
  audit(db, admin, `settlement.${action}`, row.requestNo, note || "");
  return row;
}

function pkceChallenge(verifier) {
  return cryptoBase64Url(sha256Buffer(verifier));
}

function sha256Buffer(value) {
  return require("crypto").createHash("sha256").update(String(value)).digest();
}

function cryptoBase64Url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function createAuthCode(db, user, query) {
  const client = must(db.clients.find((item) => item.id === query.client_id), 400, "invalid_client", "client_id 不正确");
  if (!client.redirectUris.includes(query.redirect_uri)) throw new HttpError(400, "invalid_redirect", "回调地址未登记");
  if (query.code_challenge_method && query.code_challenge_method !== "S256") {
    throw new HttpError(400, "invalid_challenge", "只支持 S256");
  }
  const raw = randomToken("code", 16);
  db.oauthCodes.push({
    hash: sha256(raw),
    clientId: client.id,
    userId: user.id,
    redirectUri: query.redirect_uri,
    challenge: query.code_challenge || null,
    method: query.code_challenge_method || null,
    scope: query.scope || "openid profile wallet",
    expiresAt: Date.now() + 5 * 60 * 1000,
    used: false,
  });
  return { code: raw, client, redirectUri: query.redirect_uri, state: query.state || "" };
}

function exchangeToken(db, body) {
  if (body.grant_type !== "authorization_code") throw new HttpError(400, "unsupported_grant", "只支持 authorization_code");
  const row = db.oauthCodes.find((item) => item.hash === sha256(body.code || ""));
  if (!row || row.used || row.expiresAt < Date.now()) throw new HttpError(400, "invalid_grant", "授权码无效");
  if (row.clientId !== body.client_id || row.redirectUri !== body.redirect_uri) throw new HttpError(400, "invalid_grant", "回调或客户端不匹配");
  const client = must(db.clients.find((item) => item.id === body.client_id), 400, "invalid_client", "客户端不存在");
  if (client.secretHash) {
    if (!body.client_secret || sha256(body.client_secret) !== client.secretHash) {
      throw new HttpError(401, "invalid_client", "客户端密钥不正确");
    }
  }
  if (row.method === "S256") {
    if (pkceChallenge(body.code_verifier || "") !== row.challenge) throw new HttpError(400, "invalid_grant", "PKCE 校验失败");
  }
  row.used = true;
  const raw = randomToken("atk", 18);
  db.accessTokens.push({
    hash: sha256(raw),
    userId: row.userId,
    clientId: client.id,
    scope: row.scope,
    expiresAt: Date.now() + 3600 * 1000,
    revoked: false,
  });
  return { access_token: raw, token_type: "Bearer", expires_in: 3600, scope: row.scope };
}

function dataPayload(endpoint, query) {
  const idValue = query.id || "1001";
  if (endpoint.kind === "feed") {
    return {
      demo: true,
      items: [
        { id: "1001", title: "超市今日上新：会议速记", heat: 98 },
        { id: "1002", title: "模型价格表已更新", heat: 76 },
      ].filter((item) => endpoint.endpointKey === "hot-list" || item.id === idValue),
    };
  }
  if (endpoint.kind === "note") {
    return { demo: true, items: [{ id: idValue, title: "如何用一把钥匙调用对话模型", likes: 12 }] };
  }
  return { demo: true, items: [{ id: idValue, title: "积分预扣失败了会怎样？", answer: "失败会释放预扣，积分回到余额。" }] };
}

function callDataApi(db, actor, supplierSlug, requestPath, method) {
  const user = requireUser(actor);
  const endpoint = db.endpoints.find((item) => item.supplierSlug === supplierSlug && item.enabled && pathMatches(item.path, requestPath) && item.method === method);
  if (!endpoint) throw new HttpError(404, "endpoint_not_found", "没有这个数据接口");
  const reservation = reservePoints(db, user.id, endpoint.points, `数据接口 ${endpoint.name}`, endpoint.id);
  confirmReservation(db, reservation.id, user.id);
  const call = {
    id: id("call"),
    userId: user.id,
    modelKey: null,
    endpointId: endpoint.id,
    points: endpoint.points,
    status: "succeeded",
    createdAt: nowIso(),
  };
  db.calls.push(call);
  return { endpoint, reservation, body: dataPayload(endpoint, {}) };
}

function pathMatches(template, requestPath) {
  const left = template.split("/").filter(Boolean);
  const right = requestPath.split("/").filter(Boolean);
  if (left.length !== right.length) return false;
  return left.every((part, index) => part.startsWith("{") || part === right[index]);
}

function documentationForModel(db, model) {
  const origin = db.settings.publicOrigin || "";
  return {
    model_key: model.modelKey,
    title: model.displayName,
    markdown: [
      `# ${model.displayName}`,
      "",
      model.description,
      "",
      `- 分类：${model.shelf}`,
      `- 计费：${model.billingUnit === "per_call" ? "按次" : "按千 tokens"}`,
      `- 默认积分：${model.defaultPoints}`,
      "",
      "## 调用",
      "",
      "```bash",
      `curl ${origin}/v1/chat/completions \\`,
      `  -H "Authorization: Bearer $API_KEY" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{"model":"${model.modelKey}","messages":[{"role":"user","content":"你好"}]}'`,
      "```",
      "",
      "钥匙需要先调用确认接口激活。余额不足返回 402。失败会释放预扣。",
    ].join("\n"),
  };
}

function revenueReport(db) {
  const paid = db.orders.filter((item) => item.status === "paid");
  const cents = paid.reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const points = db.calls.reduce((sum, item) => sum + Number(item.points || 0), 0);
  return {
    paid_orders: paid.length,
    paid_cents: cents,
    model_points: points,
    developers: db.users.filter((item) => item.developerStatus === "approved").length,
    listed_apps: listedClients(db).length,
    users: db.users.length,
  };
}

module.exports = {
  publicUser,
  publicPlan,
  publicModel,
  publicClient,
  publicOrder,
  publicApiKey,
  findUser,
  findUserByLogin,
  walletOf,
  currentPlan,
  audit,
  event,
  settleMonthlyGrant,
  issueSession,
  sessionUser,
  createCaptcha,
  sendOtp,
  register,
  loginWithPassword,
  loginWithOtp,
  resetPassword,
  changePassword,
  setPassword,
  changePhone,
  changeEmail,
  rebindReferral,
  reservePoints,
  confirmReservation,
  releaseReservation,
  spendPoints,
  addPoints,
  resolveActor,
  requireUser,
  requireAdmin,
  requireDeveloper,
  listedClients,
  activeEntitlements,
  createAppOrder,
  createRechargeOrder,
  createMembershipOrder,
  downgrade,
  confirmOrder,
  requestRefund,
  decideRefund,
  invokeModel,
  storeImage,
  createApiKey,
  confirmKeyDelivery,
  revokeKey,
  createClient,
  submitOffer,
  applyDeveloper,
  reviewDeveloper,
  createSandbox,
  createHosting,
  requestSettlement,
  transitionSettlement,
  createAuthCode,
  exchangeToken,
  callDataApi,
  documentationForModel,
  revenueReport,
  authenticateAccessToken,
  pointsToCents,
  checkContent,
};
