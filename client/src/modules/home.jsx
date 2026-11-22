import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DetailLink } from "../shell/detail";
import { api } from "../api";
import { Notice } from "../shell/ui";


const formats = [
  ["web","网页应用","在浏览器中直接使用工具。","卖家提交启动地址、使用条件和开通方式。"],
  ["api","API 服务","把模型或数据能力接入自己的产品。","卖家提供接入文档、调用样例和额度说明。"],
  ["resource","数字资源","领取工作流、提示词和可编辑模板。","卖家列明文件格式、适用版本和授权范围。"],
];

function Cover() {
  const ref=useRef(null);
  useEffect(()=>{
    const el=ref.current;
    const fine=matchMedia("(min-width: 761px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    let frame=0,x=0,y=0;
    function paint(){frame=0;el.style.setProperty("--shine-x",x+"px");el.style.setProperty("--shine-y",y+"px");}
    function move(e){
      if(!fine.matches || frame)return;
      const r=el.getBoundingClientRect();
      x=(e.clientX-r.left-r.width/2)/r.width*8;y=(e.clientY-r.top-r.height/2)/r.height*6;
      frame=requestAnimationFrame(paint);
    }
    function reset(){cancelAnimationFrame(frame);x=y=0;paint();}
    el.addEventListener("pointermove",move);el.addEventListener("pointerleave",reset);fine.addEventListener("change",reset);
    return ()=>{reset();el.removeEventListener("pointermove",move);el.removeEventListener("pointerleave",reset);fine.removeEventListener("change",reset);};
  },[]);
  return <div className="chuan-cover" ref={ref} aria-hidden="true"><img src="/muchuan-glass.webp" width="960" height="640" alt="" fetchPriority="high"/><i/></div>;
}

export function Home() {
  const [catalog,setCatalog]=useState(null);
  const [error,setError]=useState(null);
  useEffect(()=>{
    let active=true;
    api("/v1/platform/apps?page_size=3").then(data=>{if(active)setCatalog(data);}).catch(e=>{if(active)setError(e);});
    return ()=>{active=false;};
  },[]);
  const stocked=Boolean(catalog?.items.length);
  const actions=(stocked || !catalog) ? [["/store","浏览商品"],["/register-developer","申请成为卖家"]] : [["/register-developer","申请成为卖家"],["/store","浏览商品"]];
  return <div className="muchuan-home">
    <section className="brand-cover"><div className="cover-copy">
      <h1>沐川 <span>AI 超市</span></h1>
      <p>发现可直接使用的 AI 应用、工作流和数字资源。</p>
      <div className="row">{actions.map(([to,label],i)=><Link key={to} to={to} className={i?"btn ghost":"btn"}>{label}</Link>)}</div>
    </div><Cover/></section>
    <section className="discovery"><header><h2>{stocked?"在架商品":"按交付方式探索"}</h2><DetailLink className="guide-entry" to="/docs/listing">商品上架规范 <span aria-hidden="true">↗</span></DetailLink></header>
      <Notice error={error}/>
      <div className="discovery-grid">{stocked ? catalog.items.map(app=><DetailLink className="discovery-card" key={app.client_id} to={`/store/${app.client_id}`}>
        {app.commercial_offer?.listing?.preview_url && <img className="listing-preview" src={app.commercial_offer.listing.preview_url} alt="" loading="lazy" referrerPolicy="no-referrer"/>}
        <h3>{app.name}</h3><p>{app.summary}</p><small>{app.developer?.name}</small>
      </DetailLink>) : formats.map(([value,label,buyer,seller])=><Link className="discovery-card" key={value} to={`/store?format=${value}`}>
        <div className={"format-mark "+value} aria-hidden="true">{({web:"▤",api:"{ }",resource:"▱"})[value]}</div><h3>{label} <span aria-hidden="true">↗</span></h3><p>{buyer}</p><small>{seller}</small>
      </Link>)}</div>
    </section>
  </div>;
}