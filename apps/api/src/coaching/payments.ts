export type PromiseAmount={id:string;amount:number;currency:string;createdAt:Date};
export type RecordedPayment={amount:number;currency:string;at:Date};
/** Allocate each recorded payment once, so two promises cannot both consume the same deposit. */
export function allocatePayments(promises:PromiseAmount[],payments:RecordedPayment[]) {
  const remaining=payments.map((p)=>({...p,remaining:p.amount})).sort((a,b)=>a.at.getTime()-b.at.getTime());
  const result=new Map<string,number>();
  for(const promise of [...promises].sort((a,b)=>a.createdAt.getTime()-b.createdAt.getTime())) {
    let paid=0;
    for(const payment of remaining) {
      if(payment.currency!==promise.currency || payment.at<promise.createdAt || payment.remaining<=0) continue;
      const contribution=Math.min(payment.remaining,promise.amount-paid);
      payment.remaining-=contribution;paid+=contribution;
      if(paid>=promise.amount) break;
    }
    result.set(promise.id,paid);
  }
  return result;
}
