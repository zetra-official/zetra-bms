import type {Language} from '../i18n/catalog';
const copy:Record<Language,{loading:string;unavailable:string;blocked:string}>={
 en:{loading:'Checking accounting currency…',unavailable:'Accounting currency could not be verified. Reconnect and try again.',blocked:'Native financial posting in this currency is not yet certified.'},
 sw:{loading:'Inathibitisha sarafu ya hesabu…',unavailable:'Sarafu ya hesabu haikuweza kuthibitishwa. Unganisha mtandao na ujaribu tena.',blocked:'Miamala ya fedha kwa sarafu hii bado haijathibitishwa.'},
 fr:{loading:'Vérification de la devise comptable…',unavailable:'Impossible de vérifier la devise comptable. Reconnectez-vous et réessayez.',blocked:'Les écritures financières dans cette devise ne sont pas encore certifiées.'},
 pt:{loading:'A verificar a moeda contabilística…',unavailable:'Não foi possível verificar a moeda contabilística. Volte a ligar e tente novamente.',blocked:'Os lançamentos financeiros nesta moeda ainda não estão certificados.'},
 ar:{loading:'جارٍ التحقق من عملة المحاسبة…',unavailable:'تعذر التحقق من عملة المحاسبة. أعد الاتصال وحاول مجدداً.',blocked:'لم يتم اعتماد تسجيل المعاملات المالية بهذه العملة بعد.'},
 es:{loading:'Verificando la moneda contable…',unavailable:'No se pudo verificar la moneda contable. Vuelve a conectarte e inténtalo de nuevo.',blocked:'Los registros financieros en esta moneda aún no están certificados.'},
 zh:{loading:'正在验证记账币种…',unavailable:'无法验证记账币种。请重新连接后重试。',blocked:'此币种的原生财务记账尚未通过认证。'},
};
export function financialText(language:Language,key:keyof typeof copy.en){return copy[language][key]}
const review:Record<Language,string>={en:'Review this queued sale: its accounting currency or revision could not be verified. No sale was posted.',sw:'Kagua mauzo haya yaliyohifadhiwa: sarafu ya hesabu au toleo lake halijathibitishwa. Hakuna mauzo yaliyorekodiwa.',fr:'Vérifiez cette vente en attente : sa devise comptable ou sa version n’a pas pu être vérifiée. Aucune vente n’a été enregistrée.',pt:'Reveja esta venda em fila: não foi possível verificar a moeda contabilística ou a revisão. Nenhuma venda foi registada.',ar:'راجع هذه العملية المعلقة: تعذر التحقق من عملة المحاسبة أو إصدارها. لم يتم تسجيل أي عملية بيع.',es:'Revisa esta venta en cola: no se pudo verificar su moneda contable o revisión. No se registró ninguna venta.',zh:'请检查此排队销售：无法验证其记账币种或版本。未记入任何销售。'};
export function financialErrorText(language:Language,code:string):string|null{
 if(code==='NATIVE_FINANCIAL_POSTING_NOT_CERTIFIED')return financialText(language,'blocked');
 if(['OFFLINE_CURRENCY_REVIEW_REQUIRED','INVALID_OFFLINE_CURRENCY_CONTEXT','CURRENCY_TENANT_MISMATCH'].includes(code))return review[language];
 if(code==='ACCOUNTING_AUTHORITY_UNAVAILABLE'||code==='UNVERIFIED_ACCOUNTING_AUTHORITY'||code==='CURRENCY_PRECISION_MISMATCH')return financialText(language,'unavailable');
 return null;
}
