import {Language} from './catalog';
const rows:Record<Language,string[]>={
 en:['Currency','Select currency','Search by currency code or name','Search currency…','Choose a currency','Available currencies: {count}','Currencies ready: {count}','Offline • using available currency data','Symbol','Decimal places','No matching currency'],
 sw:['Sarafu','Chagua sarafu','Tafuta kwa msimbo au jina la sarafu','Tafuta sarafu…','Chagua sarafu','Sarafu zinazopatikana: {count}','Sarafu zilizo tayari: {count}','Offline • inatumia taarifa za sarafu zilizopo','Alama','Nafasi za desimali','Hakuna sarafu inayolingana'],
 fr:['Devise','Sélectionner une devise','Rechercher par code ou nom de devise','Rechercher une devise…','Choisir une devise','Devises disponibles : {count}','Devises prêtes : {count}','Hors ligne • données de devises disponibles','Symbole','Décimales','Aucune devise correspondante'],
 pt:['Moeda','Selecionar moeda','Pesquisar pelo código ou nome da moeda','Pesquisar moeda…','Escolha uma moeda','Moedas disponíveis: {count}','Moedas prontas: {count}','Sem ligação • dados de moeda disponíveis','Símbolo','Casas decimais','Nenhuma moeda correspondente'],
 ar:['العملة','اختيار العملة','البحث برمز العملة أو اسمها','البحث عن عملة…','اختر عملة','العملات المتاحة: {count}','العملات الجاهزة: {count}','دون اتصال • استخدام بيانات العملات المتاحة','الرمز','المنازل العشرية','لا توجد عملة مطابقة'],
 es:['Moneda','Seleccionar moneda','Buscar por código o nombre de moneda','Buscar moneda…','Elige una moneda','Monedas disponibles: {count}','Monedas disponibles: {count}','Sin conexión • usando datos de monedas disponibles','Símbolo','Decimales','No hay monedas coincidentes'],
 zh:['货币','选择货币','按货币代码或名称搜索','搜索货币…','请选择货币','可用货币：{count}','已就绪货币：{count}','离线 • 使用现有货币数据','符号','小数位数','没有匹配的货币'],
};
const keys=['currency','select','hint','search','any','available','loaded','offline','symbol','digits','empty'] as const;
export const currencyMessages=Object.fromEntries(Object.entries(rows).map(([language,values])=>[language,Object.fromEntries(keys.map((key,index)=>[key,values[index]]))])) as Record<Language,Record<typeof keys[number],string>>;
