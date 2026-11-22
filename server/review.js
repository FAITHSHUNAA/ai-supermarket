const express = require("express");
const domain = require("./domain");
const {reviewOffer} = require("./routes/admin");

// 此监听器只绑定 systemd 创建的私有运行目录内的 Unix 套接字。
function listen(store, socket) {
  const review = express();
  review.use(express.json({limit:"8kb"}));
  review.get("/pending", (req,res) => {
    const db = store.get();
    res.json({paymentDifferences:db.orders.filter(o=>o.reconciliationIssue).map(o=>domain.publicOrder(o)),refunds:db.refunds.filter(r=>!["approved","rejected"].includes(r.status)),deliveryReports:(db.deliveryReports || []).filter(r=>r.status==="pending"),sellers:db.users.filter(u => u.developerStatus === "pending").map(u => ({id:u.id,username:u.username,pitch:u.developerPitch})),
      offers:db.offers.filter(o => o.status === "pending").map(o => ({...o,app:db.clients.find(c => c.id === o.clientId)?.name}))});
  });
  review.post("/operations/:type/:id",async(req,res,next)=>{
    try{
      const {action,reason,url}=req.body, operator={id:"server-operator",roles:["admin"]};
      if(!reason?.trim())return res.status(400).json({error:"请填写处理原因"});
      await store.mutate(db=>{
        const {type,id}=req.params;
        if(type==="product"){
          const c=db.clients.find(row=>row.id===id);
          if(!c || !["pause","block","resume"].includes(action) || !db.offers.some(o=>o.clientId===id && o.status==="approved"))throw Error("商品或状态无效");
          c.status=action==="resume"?"listed":"unlisted";c.deliveryBlocked=action==="block" || (action==="pause" && !!c.deliveryBlocked);
        }else if(type==="delivery"){
          const report=(db.deliveryReports||[]).find(r=>r.id===id && r.status==="pending");
          if(!report || action!=="replace")throw Error("无待处理记录");
          const link=new URL(url || report.proposedUrl);
          if(link.protocol!=="https:" || link.username || link.password)throw Error("需要 HTTPS 交付地址");
          const e=db.entitlements.find(e=>e.id===report.entitlementId && e.status==="active");
          if(!e?.snapshot?.listing)throw Error("缺少有效的购买快照");
          e.replacementUrl=link.href;report.status="replaced";
        }else if(type==="refund"){
          const r=db.refunds.find(r=>r.id===id);
          if(action==="retry" && r?.status==="refund_failed") r.status="refund_requested";
          else if(["approve","reject"].includes(action))domain.decideRefund(db,operator,id,action==="approve");
          else throw Error("退款操作无效");
        }else throw Error("未知操作");
        domain.audit(db,operator,type+"."+action,id,reason);
      });
      res.json({ok:true});
    }catch(err){next(err);}
  });
  review.post("/:kind/:id", async (req,res,next) => {
    try {
      const {approve,reason} = req.body;
      if (!["seller","offer"].includes(req.params.kind) || typeof approve !== "boolean" || (!approve && !String(reason || "").trim())) return res.sendStatus(400);
      const operator = {id:"server-operator",roles:["admin"]};
      await store.mutate(db => {
        if (req.params.kind === "offer") return reviewOffer(db,operator,{id:req.params.id,approve,reason});
        const user = db.users.find(u => u.id === req.params.id);
        if (user?.developerStatus !== "pending") throw new Error("没有待审申请");
        return domain.reviewDeveloper(db,operator,user.id,approve,reason);
      });
      res.json({ok:true});
    } catch (err) { next(err); }
  });
  review.use((err,req,res,next) => res.status(err.status || 400).json({error:err.message}));
  const fs = require("node:fs");
  if (fs.existsSync(socket)) fs.unlinkSync(socket);
  review.listen(socket);
}
module.exports = {listen};
