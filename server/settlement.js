const merchant=require("./merchant");
const domain=require("./domain");

function settle(db,channel,tx) {
  const order=db.orders.find(row=>row.outTradeNo===tx.order);
  merchant.requireValid(order && order.channel===channel && Number.isSafeInteger(tx.cents) && tx.cents>0 && order.amountCents===tx.cents && typeof tx.transaction==="string" && tx.transaction.length>0);
  merchant.requireValid(!db.orders.some(row=>row!==order && row.channel===channel && row.providerTransaction===tx.transaction));
  if(order.providerTransaction){merchant.requireValid(order.providerTransaction===tx.transaction);return;}
  if(order.status==="closed") order.status="pending";
  domain.confirmOrder(db,null,tx.order);
  order.providerTransaction=tx.transaction;
}

// External requests run outside the store's transaction. Re-read status before committing.
async function reconcile(store) {
  for(const order of store.get().orders.filter(row=>row.status==="pending" && merchant.enabled(row.channel))){
    try{
      const expired=Date.now()>=Date.parse(order.expiresAt || new Date(Date.parse(order.createdAt)+1800000).toISOString());
      if(order.checkoutStarted===false && !expired) continue;
      let status=order.checkoutStarted!==false ? await merchant.query(order) : {status:"missing"};
      if(status.status==="pending" && expired){await merchant.close(order);status={status:"closed"};}
      await store.mutate(db=>{
        const fresh=db.orders.find(r=>r.id===order.id);
        if(status.status==="paid") settle(db,order.channel,status);
        else if(fresh.status==="pending" && (status.status==="closed" || (expired && status.status==="missing"))) fresh.status="closed";
      });
    } catch(error){console.error("payment reconciliation",order.id,error.code || error.name);}
  }
  for(const refund of store.get().refunds.filter(r=>["refund_requested","refund_processing"].includes(r.status))){
    const order=store.get().orders.find(r=>r.id===refund.orderId);
    if(!order || !merchant.enabled(order.channel)) continue;
    try{
      const result=await merchant.refund(order,refund.id,refund.status==="refund_processing");
      await store.mutate(db=>{
        const row=db.refunds.find(r=>r.id===refund.id);
        if(row.status==="approved") return;
        if(result==="success"){domain.finishRefund(db,{id:"payment-provider"},row,true);db.orders.find(r=>r.id===order.id).status="refunded";}
        else row.status=result==="processing"?"refund_processing":"refund_failed";
      });
    }catch(error){console.error("refund reconciliation",refund.id,error.code || error.name);}
  }
  const today=new Date().toISOString().slice(0,10);
  for(const order of store.get().orders.filter(o=>o.providerTransaction && ["paid","paid_unfulfilled"].includes(o.status) && merchant.enabled(o.channel) && o.lastCheckedDay!==today)){
    try{
      const result=await merchant.query(order);
      await store.mutate(db=>{
        const current=db.orders.find(o=>o.id===order.id);
        current.lastCheckedDay=today;
        current.reconciliationIssue=result.status!=="paid" || result.transaction!==current.providerTransaction || result.cents!==current.amountCents;
      });
    }catch(error){console.error("daily order check",order.id,error.code || error.name);}
  }
}
function start(store){
  async function run(){try {await reconcile(store);}finally{setTimeout(run,60000).unref();}}
  run().catch(console.error);
}
module.exports={settle,reconcile,start};
