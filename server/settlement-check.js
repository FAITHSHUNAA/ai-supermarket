const assert=require("node:assert/strict");
const domain=require("./domain");
const {seed}=require("./seed");
const {settle}=require("./settlement");

function check(){
  const db=seed(), buyer=db.users.find(u=>u.roles.includes("user"));
  db.entitlements=[];
  const offers=db.offers.filter(o=>o.status==="approved" && o.pricePoints>0);
  assert(offers.length>=1);
  const offer=offers[0],client=db.clients.find(c=>c.id===offer.clientId);
  client.minMemberLevel=0;
  db.plans.find(p=>p.id===buyer.planId).maxAuthorizedApps=1;
  const purchase=()=>domain.createAppOrder(db,buyer,{client_id:client.id,channel:"wechat"});
  const first=purchase();
  assert.equal(first.order.out_trade_no,purchase().order.out_trade_no);
  const order=db.orders.find(r=>r.outTradeNo===first.order.out_trade_no);
  const tx={order:order.outTradeNo,cents:order.amountCents,transaction:"controlled-test-transaction"};
  assert.throws(()=>settle(db,"wechat",{...tx,cents:0}));
  settle(db,"wechat",tx);settle(db,"wechat",tx);
  assert.equal(db.entitlements.length,1);
  const refund=domain.requestRefund(db,buyer,{entitlement_id:db.entitlements[0].id});
  db.production=true;
  const before=domain.walletOf(db,buyer.id).points;
  domain.decideRefund(db,{id:"operator"},refund.id,true);
  assert.equal(refund.status,"refund_requested");
  assert.equal(db.entitlements[0].status,"active");
  domain.finishRefund(db,{id:"provider"},refund,true);
  assert.equal(domain.walletOf(db,buyer.id).points,before);
  assert.equal(db.entitlements[0].status,"revoked");
}
module.exports={check};
