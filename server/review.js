const express = require("express");
const domain = require("./domain");
const {reviewOffer} = require("./routes/admin");

// 此监听器只绑定 systemd 创建的私有运行目录内的 Unix 套接字。
function listen(store, socket) {
  const review = express();
  review.use(express.json({limit:"8kb"}));
  review.get("/pending", (req,res) => {
    const db = store.get();
    res.json({sellers:db.users.filter(u => u.developerStatus === "pending").map(u => ({id:u.id,username:u.username,pitch:u.developerPitch})),
      offers:db.offers.filter(o => o.status === "pending").map(o => ({...o,app:db.clients.find(c => c.id === o.clientId)?.name}))});
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
