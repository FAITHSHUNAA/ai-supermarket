const crypto = require("node:crypto");
const fs = require("node:fs");
const { AlipaySdk } = require("alipay-sdk");
const { HttpError } = require("./lib");

const fields = {
  alipay: ["ALIPAY_APP_ID","ALIPAY_SELLER_ID","ALIPAY_PRIVATE_KEY_FILE","ALIPAY_PUBLIC_KEY_FILE"],
  wechat: ["WX_APP_ID","WX_MCH_ID","WX_MCH_SERIAL","WX_PRIVATE_KEY_FILE","WX_PLATFORM_KEY_ID","WX_PLATFORM_KEY_FILE","WX_API_V3_KEY_FILE"],
};
function enabled(channel) {
  return Object.hasOwn(fields, channel) && fields[channel].every(key => process.env[key]) && !!process.env.PAYMENT_NOTIFY_ORIGIN;
}
function requireChannel(channel) {
  if (!enabled(channel)) throw new HttpError(503,"merchant_unavailable","该收款渠道尚未开通");
}
function key(name) { return fs.readFileSync(process.env[name], "utf8").trim(); }
function alipay() {
  return new AlipaySdk({appId:process.env.ALIPAY_APP_ID, privateKey:key("ALIPAY_PRIVATE_KEY_FILE"),
    alipayPublicKey:key("ALIPAY_PUBLIC_KEY_FILE"),keyType:"PKCS8",signType:"RSA2"});
}
function requireValid(ok) {
  if (!ok) throw new HttpError(400,"invalid_payment","支付通知校验失败");
}
function verifyWechat(headers, raw) {
  const get = name => headers.get ? headers.get(name) : headers[name];
  const timestamp = get("wechatpay-timestamp"), nonce = get("wechatpay-nonce");
  requireValid(get("wechatpay-serial") === process.env.WX_PLATFORM_KEY_ID && /^\d+$/.test(timestamp) && Math.abs(Date.now()/1000 - Number(timestamp)) <= 300);
  requireValid(crypto.verify("RSA-SHA256", Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`), key("WX_PLATFORM_KEY_FILE"), Buffer.from(get("wechatpay-signature") || "", "base64")));
}
async function checkout(order) {
  requireChannel(order.channel);
  const notify = process.env.PAYMENT_NOTIFY_ORIGIN + "/v1/payments/notify/" + order.channel;
  if (order.channel === "alipay") {
    const result = await alipay().exec("alipay.trade.precreate",{notifyUrl:notify,bizContent:{
      outTradeNo:order.outTradeNo,totalAmount:(order.amountCents/100).toFixed(2),subject:order.title,
    }},{validateSign:true});
    requireValid(result.code === "10000" && result.qrCode && result.outTradeNo === order.outTradeNo);
    return result.qrCode;
  }
  const result = await wx("POST","/v3/pay/transactions/native",{appid:process.env.WX_APP_ID,mchid:process.env.WX_MCH_ID,description:order.title,out_trade_no:order.outTradeNo,notify_url:notify,amount:{total:order.amountCents,currency:"CNY"}});
  requireValid(result.code_url?.startsWith("weixin://"));
  return result.code_url;
}
async function wx(method,path,payload) {
  const timestamp = String(Math.floor(Date.now()/1000)), nonce = crypto.randomBytes(16).toString("hex");
  const body = payload ? JSON.stringify(payload) : "";
  const sig = crypto.sign("RSA-SHA256",Buffer.from(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`),key("WX_PRIVATE_KEY_FILE")).toString("base64");
  const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${process.env.WX_MCH_ID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${process.env.WX_MCH_SERIAL}",signature="${sig}"`;
  const response = await fetch("https://api.mch.weixin.qq.com"+path,{method,headers:{authorization,"content-type":"application/json",accept:"application/json","Wechatpay-Serial":process.env.WX_PLATFORM_KEY_ID},body:body || undefined,signal:AbortSignal.timeout(15000)});
  const raw = await response.text();
  if(response.status===404 && method==="GET" && path.startsWith("/v3/pay/transactions/") && response.headers.get("wechatpay-signature")){
    verifyWechat(response.headers,raw);
    if(JSON.parse(raw).code==="ORDER_NOT_EXIST")return {missing:true};
  }
  requireValid(response.ok);
  verifyWechat(response.headers,raw);
  return raw ? JSON.parse(raw) : {};
}
async function query(order) {
  requireChannel(order.channel);
  if(order.channel==="alipay"){
    const r=await alipay().exec("alipay.trade.query",{bizContent:{outTradeNo:order.outTradeNo}},{validateSign:true});
    if(r.subCode==="ACQ.TRADE_NOT_EXIST") return {status:"missing"};
    requireValid(r.code==="10000" && r.outTradeNo===order.outTradeNo);
    if(["TRADE_SUCCESS","TRADE_FINISHED"].includes(r.tradeStatus)) return {status:"paid",order:r.outTradeNo,cents:Math.round(Number(r.totalAmount)*100),transaction:r.tradeNo};
    return {status:r.tradeStatus==="TRADE_CLOSED"?"closed":"pending"};
  }
  const r=await wx("GET","/v3/pay/transactions/out-trade-no/"+encodeURIComponent(order.outTradeNo)+"?mchid="+process.env.WX_MCH_ID);
  if(r.missing)return {status:"missing"};
  requireValid(r.mchid===process.env.WX_MCH_ID && r.appid===process.env.WX_APP_ID && r.out_trade_no===order.outTradeNo);
  if(r.trade_state==="SUCCESS"){requireValid(r.amount.currency==="CNY");return {status:"paid",order:r.out_trade_no,cents:r.amount.total,transaction:r.transaction_id};}
  return {status:r.trade_state==="CLOSED"?"closed":"pending"};
}
async function close(order) {
  if(order.channel==="wechat") return wx("POST","/v3/pay/transactions/out-trade-no/"+encodeURIComponent(order.outTradeNo)+"/close",{mchid:process.env.WX_MCH_ID});
  const r=await alipay().exec("alipay.trade.close",{bizContent:{outTradeNo:order.outTradeNo}},{validateSign:true});
  requireValid(r.code==="10000" && r.outTradeNo===order.outTradeNo);
}
async function refund(order,id,poll) {
  requireChannel(order.channel);
  if(order.channel==="wechat"){
    const r=poll ? await wx("GET","/v3/refund/domestic/refunds/"+encodeURIComponent(id)) : await wx("POST","/v3/refund/domestic/refunds",{transaction_id:order.providerTransaction,out_refund_no:id,amount:{refund:order.amountCents,total:order.amountCents,currency:"CNY"}});
    requireValid(r.out_refund_no===id && r.transaction_id===order.providerTransaction && r.amount.refund===order.amountCents);
    return r.status==="SUCCESS"?"success":r.status==="PROCESSING"?"processing":"failed";
  }
  const method=poll?"alipay.trade.fastpay.refund.query":"alipay.trade.refund";
  const bizContent={outTradeNo:order.outTradeNo,outRequestNo:id};
  if(!poll) bizContent.refundAmount=(order.amountCents/100).toFixed(2);
  const r=await alipay().exec(method,{bizContent},{validateSign:true});
  requireValid(r.code==="10000" && r.outTradeNo===order.outTradeNo && r.tradeNo===order.providerTransaction);
  if(poll) return r.refundStatus==="REFUND_SUCCESS" && Math.round(Number(r.refundAmount)*100)===order.amountCents?"success":"processing";
  return r.fundChange==="Y" && Math.round(Number(r.refundFee)*100)===order.amountCents?"success":"processing";
}
function notification(channel,req) {
  requireChannel(channel);
  const b = req.body;
  if (channel === "alipay") {
    requireValid(b.sign_type === "RSA2" && alipay().checkNotifySignV2(b) && b.app_id === process.env.ALIPAY_APP_ID && b.seller_id === process.env.ALIPAY_SELLER_ID);
    requireValid(["TRADE_SUCCESS","TRADE_FINISHED"].includes(b.trade_status) && /^\d+(\.\d{1,2})?$/.test(b.total_amount));
    return {order:b.out_trade_no,transaction:b.trade_no,cents:Math.round(Number(b.total_amount)*100)};
  }
  verifyWechat(req.headers,req.rawPaymentBody);
  requireValid(b.event_type === "TRANSACTION.SUCCESS" && b.resource?.algorithm === "AEAD_AES_256_GCM");
  const r = b.resource, cipher = Buffer.from(r.ciphertext,"base64");
  const decrypt = crypto.createDecipheriv("aes-256-gcm",Buffer.from(key("WX_API_V3_KEY_FILE")),Buffer.from(r.nonce));
  decrypt.setAAD(Buffer.from(r.associated_data || ""));
  decrypt.setAuthTag(cipher.subarray(-16));
  const tx = JSON.parse(Buffer.concat([decrypt.update(cipher.subarray(0,-16)), decrypt.final()]).toString("utf8"));
  requireValid(tx.appid === process.env.WX_APP_ID && tx.mchid === process.env.WX_MCH_ID && tx.trade_state === "SUCCESS" && tx.amount.currency === "CNY");
  return {order:tx.out_trade_no,transaction:tx.transaction_id,cents:tx.amount.total};
}
module.exports = {enabled,requireChannel,requireValid,checkout,notification,query,close,refund};
