from pathlib import Path
E=Path(__file__).resolve().parent;W=E/'source-web'
p=W/'src/incoming/model.ts';s=p.read_text(encoding='utf-8');s="import {baseQuantity} from '../precision/unitPack';\n"+s
s=s.replace('note:string};','note:string;isPrecision?:boolean;packSize?:string;baseUnit?:string;stockMode?:\'UNIT\'|\'PACK\'|\'BOX\'|\'CARTON\';allowBox?:boolean;allowUnit?:boolean;packCost?:string;packSelling?:string;calculatorValid?:boolean;expectedSelling?:string};',1)
s=s.replace("decimal(l.quantity,true);if(!/^[1-9]\\d{0,8}$/.test(l.quantity))throw Error('WHOLE_QUANTITY_REQUIRED');", "decimal(l.quantity,true);const base=baseQuantity(l.quantity,l.isPrecision?(l.stockMode??'UNIT'):'UNIT',l.packSize);if(!/^[1-9]\\d{0,8}$/.test(base))throw Error('WHOLE_QUANTITY_REQUIRED');if(l.calculatorValid===false)throw Error('INVALID_AMOUNT');")
s=s.replace('quantity:l.quantity,unit_cost:l.cost,','quantity:baseQuantity(l.quantity,l.isPrecision?(l.stockMode??\'UNIT\'):\'UNIT\',l.packSize),entered_quantity:l.quantity,stock_mode:l.isPrecision?(l.stockMode??\'UNIT\'):\'UNIT\',is_precision:l.isPrecision??false,pack_size:l.packSize??null,base_unit:l.baseUnit??null,expected_selling_price:l.expectedSelling??l.selling,unit_cost:l.cost,')
p.write_text(s,encoding='utf-8')
p=W/'src/incoming/BulkScreen.tsx';s=p.read_text(encoding='utf-8');s="import {PrecisionEditor} from './PrecisionEditor';\nimport {multiplyExact} from '../currency/engine';\n"+s
s=s.replace("[verified,setVerified]=useState(false)","[verified,setVerified]=useState(false),[storeType,setStoreType]=useState('')")
s=s.replace("const [p,s]=await Promise.all([", "const [p,s,c]=await Promise.all([")
s=s.replace("p_kind:'SUPPLIER',p_query:''})]);", "p_kind:'SUPPLIER',p_query:''}),supabase.rpc('m3_incoming_catalog_v1',{p_org_id:orgId,p_store_id:storeId,p_kind:'CONTEXT',p_query:''})]);",1)
s=s.replace('if(p.error||s.error)', 'if(p.error||s.error||c.error)',1).replace('setVerified(true);setProducts','setStoreType(c.data?.store_type??\'\');setVerified(true);setProducts',1)
s=s.replace("'REGISTER_PRICE_CHANGE_FIRST',","'REGISTER_PRICE_CHANGE_FIRST','PRICE_CONFLICT','PRICE_CONFIRMATION_REQUIRED','COST_BASIS_POLICY_REQUIRED','PRECISION_METADATA_CHANGED','UNSUPPORTED_QUANTITY_PRECISION','SHARED_PRODUCT_PRICE_POLICY_REQUIRED',")
s=s.replace("{input('note',l.note,v=>lineChange(l.key,{note:v}))}","{storeType==='PRECISION_RETAIL'&&<PrecisionEditor line={l} editable={canEdit} onChange={p=>lineChange(l.key,p)}/ >}{input('note',l.note,v=>lineChange(l.key,{note:v}))}")
old="selling:String(p.selling_price??'0')"
new="selling:String(p.selling_price??'0'),expectedSelling:String(p.selling_price??'0'),isPrecision:!!p.is_precision_product,packSize:p.precision_pack_size==null?undefined:String(p.precision_pack_size),baseUnit:p.precision_base_unit??undefined,stockMode:'UNIT',allowBox:p.precision_allow_box_sales,allowUnit:p.precision_allow_unit_sales,packCost:p.precision_pack_size?multiplyExact(String(p.cost_price??'0'),String(p.precision_pack_size)):undefined,packSelling:p.precision_pack_size?multiplyExact(String(p.selling_price??'0'),String(p.precision_pack_size)):undefined,calculatorValid:true"
assert old in s;s=s.replace(old,new);p.write_text(s,encoding='utf-8')
p=W/'app/(tabs)/products.tsx';s=p.read_text(encoding='utf-8');s="import {unitPackPrices} from '../../src/precision/unitPack';\n"+s
start=s.index('  const unitCost = packCost / packQty;');end=s.index('\n  if (!category.trim())',start)
s=s[:start]+"  try {const calculated=unitPackPrices(normalizeDecimalInput(precisionPackQty),normalizeDecimalInput(precisionPackCost),normalizeDecimalInput(precisionPackSelling));setCostPrice(calculated.cost);setSellingPrice(calculated.selling)} catch {Alert.alert(uiText('Missing'),uiText('Invalid value'));return;}\n"+s[end:]
old='  setEditCostPrice(fmtFormulaNumber(packCost / packQty));\n  setEditSellingPrice(fmtFormulaNumber(packSelling / packQty));'
assert old in s;s=s.replace(old,"  try {const calculated=unitPackPrices(normalizeDecimalInput(editPrecisionPackQty),normalizeDecimalInput(editPrecisionPackCost),normalizeDecimalInput(editPrecisionPackSelling));setEditCostPrice(calculated.cost);setEditSellingPrice(calculated.selling)} catch {Alert.alert(uiText('Missing'),uiText('Invalid value'));return;}")
p.write_text(s,encoding='utf-8')
for name in ['src/precision/unitPack.ts','src/incoming/PrecisionEditor.tsx','src/incoming/model.ts','src/incoming/BulkScreen.tsx','app/(tabs)/products.tsx']:
 target=E/'source-android'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((W/name).read_bytes())
print('Shared Products/Incoming calculator and persisted Precision inputs integrated into isolated candidates')
