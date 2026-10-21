from pathlib import Path
import re,json
E=Path(__file__).resolve().parent
messages={
'en':'Whole base-unit receipts only. Pack metadata stays unchanged. Current cost and selling prices follow the existing Products contract after successful receiving. Historical sales and receipts stay unchanged.',
'sw':'Pokea base units kamili pekee. Taarifa za pack hazibadiliki. Cost Price na Selling Price za sasa zinafuata Products baada ya receiving kufanikiwa. Mauzo na risiti za zamani hazibadilishwi.',
'fr':'Unités de base entières uniquement. Le conditionnement reste inchangé. Les prix actuels de coût et de vente suivent le contrat Produits après réception réussie. Les ventes et reçus historiques restent inchangés.',
'pt':'Apenas unidades base inteiras. A embalagem permanece inalterada. Os preços atuais de custo e venda seguem o contrato Produtos após receção bem-sucedida. Vendas e recibos históricos permanecem inalterados.',
'ar':'استلام وحدات أساسية كاملة فقط. لا تتغير بيانات العبوة. تتبع أسعار التكلفة والبيع الحالية عقد المنتجات بعد نجاح الاستلام. تبقى المبيعات والإيصالات التاريخية دون تغيير.',
'es':'Solo unidades base enteras. El embalaje no cambia. Los precios actuales de coste y venta siguen el contrato Productos tras una recepción correcta. Las ventas y recibos históricos no cambian.',
'zh':'仅接收完整的基础单位，包装资料保持不变。成功收货后，当前成本价和售价遵循现有商品编辑规则。历史销售和收据保持不变。'}
for platform in ['web','android']:
 p=E/f'source-{platform}/src/incoming/copy.ts';s=p.read_text(encoding='utf-8')
 for lang,value in messages.items():
  start=s.index(' "'+lang+'": {');end=s.index('\n }',start);block=s[start:end]
  block,n=re.subn(r'"precision": "[^\n]*",', '"precision": '+json.dumps(value,ensure_ascii=False)+',',block,count=1);assert n==1
  s=s[:start]+block+s[end:]
 p.write_text(s,encoding='utf-8')
print('Updated seven-language existing pricing guidance; no new translation features')
