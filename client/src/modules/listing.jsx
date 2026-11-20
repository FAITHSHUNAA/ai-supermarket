import { useEffect, useState } from "react";
import { api } from "../api";

const formats = {
  web: ["网页应用", "填写可直接打开的应用地址，说明浏览器、注册要求和首次使用步骤。"],
  api: ["API 服务", "填写接入文档地址，说明认证方式、请求与响应示例、限流和密钥领取方式。"],
  resource: ["数字资源", "填写文件领取页，说明文件类型、大小、依赖工具、导入步骤和授权范围。"],
};
const fields = {
  contents: "交付内容和版本", usage: "使用步骤和适用条件", limits: "使用限制和额外费用",
  privacy: "收集哪些数据、用途和保留期限", license: "个人、商用和再分发权限", support: "售后联系方式、响应时间和退款条件",
};
const specifications = {web:"支持的浏览器、设备和账号要求",api:"认证方式、请求与响应示例",resource:"文件格式、大小、清单和打开方式"};

export function ListingDetails({ listing }) {
  if (!listing) return null;
  return <dl><dt>交付格式</dt><dd>{formats[listing.format]?.[0]}</dd>
    <dt>{specifications[listing.format]}</dt><dd style={{whiteSpace:"pre-wrap"}}>{listing.specification}</dd>
    {Object.entries(fields).map(([key, label]) => <div key={key}><dt>{label}</dt><dd style={{whiteSpace:"pre-wrap"}}>{listing[key]}</dd></div>)}</dl>;
}

export function ListingForm({ clientId }) {
  const [listing, setListing] = useState({format:"web"});
  const [price, setPrice] = useState("");
  const [latest, setLatest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  function update(key, value) { setListing(prev => ({...prev, [key]:value})); }
  useEffect(() => {
    let active = true;
    api(`/v1/developer/clients/${clientId}/commercial-offer`).then(({items}) => {
      if (!active || !items.length) return;
      const row = items.at(-1);
      setLatest(row);
      setPrice(String(row.pricePoints));
      if (row.listing) setListing({...row.listing, rights_confirmed:false});
    }).catch(err => { if (active) setMessage(err.message); });
    return () => { active = false; };
  }, [clientId]);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      setLatest(await api(`/v1/developer/clients/${clientId}/commercial-offer`, {method:"POST", body:{price_points:Number(price), listing}}));
      setMessage("已提交审核");
    } catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }
  return <details><summary>上架申请{latest && " · " + ({pending:"审核中",approved:"已通过",rejected:"已退回",superseded:"已替换"}[latest.status] || latest.status)}</summary>
    {latest?.reason && <p>退回原因：{latest.reason}</p>}
    <form onSubmit={submit}><fieldset disabled={busy || latest?.status === "pending"}>
      <label>交付格式<select value={listing.format} onChange={e => update("format", e.target.value)}>{Object.entries(formats).map(([key,[label]]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <p>{formats[listing.format][1]}</p>
      <label>{specifications[listing.format]}<textarea required maxLength={2000} value={listing.specification || ""} onChange={e => update("specification", e.target.value)} /></label>
      {Object.entries(fields).map(([key,label]) => <label key={key}>{label}<textarea required maxLength={2000} value={listing[key] || ""} onChange={e => update(key,e.target.value)} /></label>)}
      <label>开通后展示的 HTTPS 入口<input type="url" required placeholder="https://" value={listing.delivery_url || ""} onChange={e => update("delivery_url",e.target.value)} /></label>
      <label>一次性开通价格（整数积分，免费填 0）<input type="number" required min="0" step="1" value={price} onChange={e => setPrice(e.target.value)} /></label>
      <label><input type="checkbox" required checked={!!listing.rights_confirmed} onChange={e => update("rights_confirmed",e.target.checked)} />我拥有商品及所附素材的分发权，已核对交付入口及上述说明。</label>
      <button className="btn">提交审核</button>
    </fieldset></form><p role="status">{message}</p></details>;
}
