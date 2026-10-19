from pathlib import Path
p=Path(__file__).resolve().parent/'1911-procurement-bindings.sql';s=p.read_text()
for a,b in [('debtpay uuid;amount numeric;','debtpay uuid;v_amount numeric;'),(";amount:=(body->>'amount')::numeric;",";v_amount:=(body->>'amount')::numeric;"),('IF amount<=0 OR amount<>round(amount,digits) OR amount>o.total_balance_amount','IF v_amount<=0 OR v_amount<>round(v_amount,digits) OR v_amount>o.total_balance_amount'),('principal_amount-paid_amount>=amount','principal_amount-paid_amount>=v_amount'),('(o.id,amount,','(o.id,v_amount,'),('(link.debt_id,amount,','(link.debt_id,v_amount,'),('pay_bound_supplier_v1.amount','v_amount'),("'amount',amount::text","'amount',v_amount::text")]:
 assert a in s,a;s=s.replace(a,b)
p.write_text(s)
