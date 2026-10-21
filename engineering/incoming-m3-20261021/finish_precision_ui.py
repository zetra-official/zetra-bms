from pathlib import Path
import json
E=Path(__file__).resolve().parent;W=E/'source-web'
p=W/'src/incoming/receipt.ts';s=p.read_text(encoding='utf-8')
if 'package_unit?:' not in s:s=s.replace('selling_price:string;','selling_price:string;package_unit?:string;pack_size?:string;entered_quantity?:string;stock_mode?:string;previous_selling_price?:string;',1)
if 'esc(l.entered_quantity)' not in s:s=s.replace('${esc(l.product_name)}<br>','${esc(l.product_name)}${l.pack_size?`<br><bdi>${esc(l.entered_quantity)} ${esc(l.stock_mode)} × ${esc(l.pack_size)} ${esc(l.unit)}</bdi>`:\'\'}<br>',1)
p.write_text(s,encoding='utf-8')
p=W/'src/incoming/ReceiptScreen.tsx';s=p.read_text(encoding='utf-8').replace("{t('quantity')}: {l.qty} {l.unit}</Text>","{t('quantity')}: {l.qty} {l.unit}</Text>{l.pack_size&&<Text>{l.entered_quantity} {l.stock_mode} × {l.pack_size} {l.unit}</Text>}");p.write_text(s,encoding='utf-8')
p=W/'src/incoming/copy.ts';s=p.read_text(encoding='utf-8');start=s.index('{',s.index('export const incomingCopy'));end=s.index(' as const;');data=json.loads(s[start:end]);updates={
'en':'Whole base-unit receipts only. Pack metadata stays unchanged. Current selling-price changes apply only on confirmed receiving. A different purchase cost requires verified cost-basis policy; no historical revaluation.',
'sw':'Pokea base units kamili tu. Pack metadata haibadilishwi. Bei ya sasa ya kuuza hubadilika baada ya receiving kuthibitishwa. Purchase cost tofauti inahitaji cost-basis policy iliyothibitishwa; hakuna historical revaluation.',
'fr':'Unités de base entières uniquement. Métadonnées des packs conservées. Prix de vente actualisé seulement après réception confirmée. Un coût d’achat différent exige une règle de valorisation vérifiée ; aucun historique réévalué.',
'pt':'Apenas unidades base inteiras. Metadados das embalagens preservados. Preço de venda atualizado só na receção confirmada. Custo de compra diferente exige política de valorização verificada; sem reavaliar o histórico.',
'ar':'استلام وحدات أساسية كاملة فقط. تبقى بيانات العبوة ثابتة. يتغير سعر البيع الحالي بعد تأكيد الاستلام فقط. تتطلب تكلفة شراء مختلفة سياسة تكلفة موثقة؛ لا إعادة تقييم للسجلات التاريخية.',
'es':'Solo unidades base enteras. Se conservan los metadatos del paquete. El precio de venta cambia solo al confirmar la recepción. Un coste de compra distinto requiere una política de valoración verificada; sin revaloración histórica.',
'zh':'仅接收完整基本单位。保留包装元数据。仅在确认收货后更新当前售价。不同采购成本需要经验证的成本计价规则；不重估历史记录。'}
for lang,v in updates.items():data[lang]['precision']=v
p.write_text(s[:start]+json.dumps(data,ensure_ascii=False,indent=1)+s[end:],encoding='utf-8')
for name in ['src/incoming/receipt.ts','src/incoming/ReceiptScreen.tsx','src/incoming/copy.ts']:(E/'source-android'/name).write_bytes((W/name).read_bytes())
print('Receipt package/base evidence and seven-language policy copy updated')
