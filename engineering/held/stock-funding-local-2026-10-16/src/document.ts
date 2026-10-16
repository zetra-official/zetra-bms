import type {Language} from '../../integration-2026-10-14/src/i18n/catalog';
import {formatExact} from '../../integration-2026-10-14/src/currency/engine';
import {text} from './messages';
import type {FundingRecord} from './contracts';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Original transaction currency only. No external assets, exchange rates or financial arithmetic. */
export function fundingDocument(language:Language,r:FundingRecord){
 const t=(key:Parameters<typeof text>[1])=>esc(text(language,key));
 return `<!doctype html><html lang="${language}" dir="${language==='ar'?'rtl':'ltr'}"><meta charset="utf-8"><title>${t('title')}</title><style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.6}td,th{padding:8px;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}th{text-align:start}</style><h1>${t('title')}</h1><p>${t('notExpense')}</p><p>${esc(r.purpose)}</p><p>${t('responsible')}: ${esc(r.responsibleName)}</p><p>${t('source')}: ${esc(r.sourceName)}</p><p>${t(r.status)}</p><table>${(['issued','spent','returned','outstanding'] as const).map((k,i)=>`<tr><th>${t(k)}</th><td>${esc(formatExact([r.amount,r.spent,r.returned,r.outstanding][i],language))} ${esc(r.currency)}</td></tr>`).join('')}</table></html>`;
}
