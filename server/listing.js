const { HttpError } = require("./lib");

function invalid(message) {
  throw new HttpError(400, "invalid_listing", message);
}

function validateListing(value = {}) {
  if (!value || !["web", "api", "resource"].includes(value.format)) invalid("请选择交付格式");
  const listing = { format: value.format };
  for (const [key, label] of Object.entries({
    usage: "使用步骤和适用条件", contents: "交付内容和版本", limits: "使用限制和额外费用",
    privacy: "数据处理说明", support: "售后联系方式和退款条件", license: "授权范围",
    specification: {web:"运行环境和账号要求",api:"认证、请求与响应示例",resource:"文件清单和打开方式"}[value.format],
  })) {
    const text = typeof value[key] === "string" && value[key].trim();
    if (!text || text.length > 2000) invalid(label + "须填写 1 至 2000 字");
    listing[key] = text;
  }
  let url;
  try { url = new URL(value.delivery_url); } catch { invalid("请填写有效的 HTTPS 交付地址"); }
  if (url.protocol !== "https:" || url.username || url.password || url.href.length > 2048) invalid("交付地址须使用 HTTPS 且不能包含登录凭据");
  if (value.rights_confirmed !== true) invalid("请确认拥有分发权");
  return { ...listing, delivery_url: url.href, rights_confirmed: true };
}

module.exports = { validateListing };
