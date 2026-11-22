const { HttpError } = require("./lib");

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function cookie(res, sessionId) {
  res.cookie("sid", sessionId, {
    httpOnly: true,
    secure: process.env.PUBLIC_ORIGIN?.startsWith("https://") === true,
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 24 * 3600 * 1000,
  });
}

function clearCookie(res) {
  res.clearCookie("sid", { path: "/" });
}

function finishLogin(res, result) {
  if (result.error) throw result.error;
  cookie(res, result.sessionId);
  res.json({ user: result.user });
}

module.exports = { asyncRoute, cookie, clearCookie, finishLogin, HttpError };
