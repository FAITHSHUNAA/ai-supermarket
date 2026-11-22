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
  const [step,setStep] = useState(0);
  const [revision,setRevision] = useState(0);
  const [ready,setReady] = useState(false);
  const [reviewNotes,setReviewNotes] = useState("");
  const [privateNotes,setPrivateNotes] = useState(false);
  const endpoint = `/v1/developer/clients/${clientId}/commercial-offer`;
  const steps = ["商品展示","内容与使用","价格与授权","交付与售后"];
  function update(key, value) { setListing(prev => ({...prev, [key]:value})); }
  useEffect(() => {
    let active = true;
    api(endpoint).then(({items,draft,private_notes_enabled}) => {
      if (!active) return;
      setReady(true);
      setPrivateNotes(private_notes_enabled);
      const row = items.at(-1);
      setLatest(row || null);
      if (draft) {
        setRevision(draft.revision); setStep(draft.step); setPrice(draft.price);
        setListing({format:"web",...draft.listing}); setReviewNotes(draft.reviewNotes || "");
        setMessage("已恢复上次保存的草稿");
        return;
      }
      if (!row) return;
      setReviewNotes(row.reviewNotes || "");
      setPrice(String(row.pricePoints));
      if (row.listing) setListing({...row.listing, rights_confirmed:false});
    }).catch(err => { if (active) setMessage(err.message); });
    return () => { active = false; };
  }, [clientId]);
  async function submit(event) {
    event.preventDefault();
    if (step < 3) {setStep(step+1);return;}
    setBusy(true);
    try {
      setLatest(await api(endpoint, {method:"POST", body:{price_points:Number(price), listing,revision,review_notes:reviewNotes}}));
      setRevision(0);
      setMessage("已提交审核");
    } catch (err) { setMessage(err.message); } finally { setBusy(false); }
  }
  async function save() {
    setBusy(true);
    try {
      const draft = await api(endpoint,{method:"PUT",body:{listing,price,step,revision,review_notes:reviewNotes}});
      setRevision(draft.revision);
      setMessage("草稿已保存，可以稍后继续");
    } catch(err) { setMessage(err.message); } finally {setBusy(false);}
  }
  return <details><summary>上架申请{latest && " · " + ({pending:"审核中",approved:"已通过",rejected:"已退回",superseded:"已替换"}[latest.status] || latest.status)}</summary>
    {latest?.reason && <p>退回原因：{latest.reason}</p>}
    <form onSubmit={submit}><fieldset disabled={!ready || busy || latest?.status === "pending"}>
      <legend>第 {step+1} 步，共 4 步 · {steps[step]}</legend>
      {step === 0 && <>
      <label>交付格式<select value={listing.format} onChange={e => update("format", e.target.value)}>{Object.entries(formats).map(([key,[label]]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <p>{formats[listing.format][1]}</p>
      </>}
      {step === 1 && <label>{specifications[listing.format]}<textarea required maxLength={2000} value={listing.specification || ""} onChange={e => update("specification", e.target.value)} /></label>}
      {[["contents"],["usage","privacy"],["limits","license"],["support"]][step].map(key => <label key={key}>{fields[key]}<textarea required maxLength={2000} value={listing[key] || ""} onChange={e => update(key,e.target.value)} /></label>)}
      {step === 2 && <label>一次性开通价格（整数积分，免费填 0）<input type="number" required min="0" step="1" value={price} onChange={e => setPrice(e.target.value)} /></label>}
      {step === 3 && <>
      <label>买家交付地址<input type="url" required pattern="https://.+" placeholder="https://" value={listing.delivery_url || ""} onChange={e => update("delivery_url",e.target.value)} /></label>
      {privateNotes ? <label>审核说明（仅卖家和审核员可见）<textarea maxLength={2000} value={reviewNotes} onChange={e=>setReviewNotes(e.target.value)} placeholder="填写审核步骤或授权说明，请勿填写永久密钥"/></label> : <p>本站启用 HTTPS 后可提交私密审核资料。</p>}
      <label><input type="checkbox" required checked={!!listing.rights_confirmed} onChange={e => update("rights_confirmed",e.target.checked)} />我拥有商品及所附素材的分发权，已核对交付入口及上述说明。</label>
      </>}
      <div className="row">
        {step > 0 && <button className="btn ghost" type="button" onClick={()=>setStep(step-1)}>上一步</button>}
        <button className="btn ghost" type="button" onClick={save}>保存草稿</button>
        <button className="btn">{step===3 ? "提交审核" : "下一步"}</button>
      </div>
    </fieldset></form><p role="status">{message}</p></details>;
}
