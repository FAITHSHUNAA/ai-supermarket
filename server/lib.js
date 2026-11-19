const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

function randomToken(prefix, bytes = 24) {
  return `${prefix}_${crypto.randomBytes(bytes).toString("base64url")}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const next = crypto.scryptSync(String(password), salt, 32);
  const prev = Buffer.from(hash, "hex");
  if (next.length !== prev.length) return false;
  return crypto.timingSafeEqual(next, prev);
}

function maskPhone(phone) {
  const s = String(phone || "");
  if (s.length < 7) return s;
  return `${s.slice(0, 3)}****${s.slice(-4)}`;
}

function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
  }
  return out;
}

function must(value, status, code, message) {
  if (!value) throw new HttpError(status, code, message || code);
  return value;
}

function pushCapped(list, item, max) {
  list.push(item);
  if (list.length > max) list.splice(0, list.length - max);
}

function dataFile() {
  const dir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "db.json");
}

function createStore(seed) {
  const file = dataFile();
  let db;
  if (fs.existsSync(file)) {
    db = JSON.parse(fs.readFileSync(file, "utf8"));
  } else {
    db = seed();
    persist(db, file);
  }
  let queue = Promise.resolve();

  function persist(current, target = file) {
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(current, null, 2));
    fs.renameSync(tmp, target);
  }

  function mutate(fn) {
    const run = queue.then(() => {
      const backup = structuredClone(db);
      try {
        const result = fn(db);
        persist(db);
        return result;
      } catch (error) {
        db = backup;
        throw error;
      }
    });
    queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  return {
    get: () => db,
    mutate,
    file,
  };
}

function page(items, query) {
  const pageNo = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.page_size || query.pageSize || 20)));
  const start = (pageNo - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    pagination: {
      page: pageNo,
      page_size: pageSize,
      total: items.length,
      total_pages: Math.max(1, Math.ceil(items.length / pageSize)),
    },
  };
}

module.exports = {
  HttpError,
  nowIso,
  id,
  randomToken,
  sha256,
  hashPassword,
  verifyPassword,
  maskPhone,
  pick,
  must,
  pushCapped,
  createStore,
  page,
};
