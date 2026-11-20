const express = require("express");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const path = require("path");
const { createStore, HttpError, pushCapped, id, nowIso } = require("./lib");
const { seed } = require("./seed");

const store = createStore(seed);
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cookieParser());
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-API-Key, Idempotency-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use((req, res, next) => {
  const header = req.get("authorization") || "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (bearer && req.get("x-api-key")) {
    return res.status(400).json({ error: "ambiguous_credentials", message: "不能同时发送 Authorization 和 X-API-Key" });
  }
  next();
});

app.use((req, res, next) => {
  if (!req.path.startsWith("/v1")) return next();
  const started = Date.now();
  res.on("finish", () => {
    store
      .mutate((db) => {
        pushCapped(
          db.accessLogs,
          { id: id("acc"), method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - started, at: nowIso() },
          400
        );
      })
      .catch(() => {});
  });
  next();
});

const ctx = { get: store.get, mutate: store.mutate };
require("./routes/platform").mount(app, ctx);
require("./routes/auth").mount(app, ctx);
require("./routes/commerce").mount(app, ctx);
require("./routes/models").mount(app, ctx);
require("./routes/dataApi").mount(app, ctx);
require("./routes/developer").mount(app, ctx);
require("./routes/oauth").mount(app, ctx);
require("./routes/admin").mount(app, ctx);

app.get("/v1/health", (req, res) => {
  res.json({ ok: true, brand: store.get().settings.brandName });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({
    error: error.code || (error instanceof HttpError ? error.code : "internal_error"),
    message: status >= 500 ? "服务器内部错误" : error.message,
  });
});

const dist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/v1/")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8787);
  app.listen(port, process.env.BIND_ADDRESS || "0.0.0.0", () => {
    console.log(`AI 超市正在监听 http://127.0.0.1:${port}`);
  });
}

module.exports = { app, store };
