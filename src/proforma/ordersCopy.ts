import type {Language} from '../i18n/catalog';
const rows={
 orders:['Proforma Orders','Oda za Proforma','Commandes pro forma','Pedidos proforma','طلبات الفواتير الأولية','Pedidos proforma','形式发票订单'],
 saved:['Proforma saved','Proforma imehifadhiwa','Pro forma enregistrée','Proforma salva','تم حفظ الفاتورة الأولية','Proforma guardada','形式发票已保存'],
 returnPOS:['Return to POS','Rudi POS','Retour à la caisse','Voltar ao PDV','العودة إلى نقطة البيع','Volver al TPV','返回销售点'],
 brandingFailed:['Business logo could not be loaded. Retry PDF sharing.','Nembo ya biashara haijapakiwa. Jaribu PDF tena.','Le logo n’a pas pu être chargé. Réessayez le PDF.','Não foi possível carregar o logotipo. Tente o PDF novamente.','تعذر تحميل شعار النشاط. أعد محاولة مشاركة PDF.','No se pudo cargar el logotipo. Reintente el PDF.','无法加载企业标志，请重试 PDF。'],
} as const;
export function ordersText(language:Language,key:keyof typeof rows){return rows[key][['en','sw','fr','pt','ar','es','zh'].indexOf(language)]??rows[key][0]}
