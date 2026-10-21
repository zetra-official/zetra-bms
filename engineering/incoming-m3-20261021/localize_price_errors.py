from pathlib import Path
import json
E=Path(__file__).resolve().parent
copy={
'en':['The current price changed. Refresh the product and review the intended price before receiving.','This purchase cost needs an approved inventory cost-basis policy. No stock was received.','This product is shared across stores. A store-specific pricing contract is required.','The saved order changed. Review it before receiving.'],
'sw':['Bei ya sasa imebadilika. Pakia bidhaa upya na uhakiki bei inayokusudiwa kabla ya kupokea.','Gharama hii inahitaji sera iliyoidhinishwa ya cost basis. Hakuna stock iliyopokelewa.','Bidhaa hii inatumika kwenye stores zaidi ya moja. Inahitaji mkataba wa bei kwa kila store.','Order iliyohifadhiwa imebadilika. Ihakiki kabla ya kupokea.'],
'fr':['Le prix actuel a changé. Actualisez le produit et vérifiez le prix prévu avant la réception.','Ce coût nécessite une méthode de valorisation approuvée. Aucun stock reçu.','Ce produit est partagé entre magasins. Un contrat de prix par magasin est requis.','La commande enregistrée a changé. Vérifiez-la avant réception.'],
'pt':['O preço atual mudou. Atualize o produto e reveja o preço pretendido antes de receber.','Este custo exige uma política de valorização aprovada. Nenhum estoque recebido.','Este produto é partilhado entre lojas. É necessário um contrato de preço por loja.','O pedido guardado mudou. Reveja-o antes de receber.'],
'ar':['تغير السعر الحالي. حدّث المنتج وراجع السعر المقصود قبل الاستلام.','تحتاج هذه التكلفة إلى سياسة معتمدة لتقييم المخزون. لم يتم استلام مخزون.','هذا المنتج مشترك بين متاجر. يلزم عقد تسعير خاص بكل متجر.','تغير الطلب المحفوظ. راجعه قبل الاستلام.'],
'es':['El precio actual cambió. Actualice el producto y revise el precio previsto antes de recibir.','Este coste requiere una política de valoración aprobada. No se recibió inventario.','Este producto se comparte entre tiendas. Se requiere un contrato de precios por tienda.','El pedido guardado cambió. Revíselo antes de recibir.'],
'zh':['当前售价已更改。请刷新商品并核对预期售价后再收货。','此采购成本需要经过批准的库存成本计价政策。尚未入库。','此商品由多个门店共用，需要明确的门店定价约定。','已保存的订单发生变更，请核对后再收货。']}
keys=['priceConflict','costPolicy','sharedPrice','savedChanged']
for platform in ['web','android']:
 root=E/f'source-{platform}';p=root/'src/incoming/copy.ts';s=p.read_text(encoding='utf-8')
 for lang,values in copy.items():
  mark=' "'+lang+'": {';assert mark in s
  if '"priceConflict"' not in s[s.index(mark):s.index(mark)+1000]:s=s.replace(mark,mark+'\n'+''.join('  '+json.dumps(k)+': '+json.dumps(v,ensure_ascii=False)+',\n' for k,v in zip(keys,values)),1)
 if 'export function priceErrorKey' not in s:s+='''\nexport function priceErrorKey(code:string):CopyKey|null{return code==='PRICE_CONFLICT'||code==='PRICE_CONFIRMATION_REQUIRED'?'priceConflict':code==='COST_BASIS_POLICY_REQUIRED'?'costPolicy':code==='SHARED_PRODUCT_PRICE_POLICY_REQUIRED'?'sharedPrice':code==='SAVED_ORDER_CHANGED'?'savedChanged':null}\n'''
 p.write_text(s,encoding='utf-8')
 p=root/'app/stocks/inbound.tsx';s=p.read_text(encoding='utf-8');s="import {useLanguage} from '@/src/i18n/LanguageProvider';\nimport {text as incomingText,priceErrorKey} from '@/src/incoming/copy';\n"+s
 s=s.replace(' const systemText=useSystemMessageText();'," const incomingLanguage=useLanguage().language;\n const incomingError=(e:any,fallback:string)=>{const k=priceErrorKey(e?.message??'');return k?incomingText(incomingLanguage,k):(e?.message??fallback)};\n const systemText=useSystemMessageText();",1)
 s=s.replace('e?.message ?? uiText("Failed to receive incoming stock")','incomingError(e,uiText("Failed to receive incoming stock"))').replace('e?.message ?? uiText("Failed to receive partial stock.")','incomingError(e,uiText("Failed to receive partial stock."))')
 s=s.replace('}, [selectedOrder, selectedItems, load]);','}, [selectedOrder, selectedItems, load, incomingLanguage]);',1).replace('}, [selectedOrder, selectedItems, receiveQtyMap, load, openOrderDetail]);','}, [selectedOrder, selectedItems, receiveQtyMap, load, openOrderDetail, incomingLanguage]);',1)
 p.write_text(s,encoding='utf-8')
 p=root/'src/incoming/BulkScreen.tsx';s=p.read_text(encoding='utf-8').replace('import {text,CopyKey}', 'import {text,CopyKey,priceErrorKey}')
 s=s.replace("}catch{if(g===generation.current){setError(true);const restored", "}catch(e:any){if(g===generation.current){setError(true);const restored")
 s=s.replace("setStatus(restored.status==='EDITING'?'validation':'uncertain')", "setStatus(restored.status==='EDITING'?(priceErrorKey(e?.message??'')??'validation'):'uncertain')")
 p.write_text(s,encoding='utf-8')
print('Localized selling-price conflicts and costing gates in all seven languages')
