import {manualInvoiceAmount,currencyPrecision} from '../currency/engine';
export const PROFORMA_INVOICE_FX_READY=true; // Enable only after approved 1705 postflight.
export type InvoiceFxInput={currency:string;rate:string;source:string;acknowledged:boolean};
export function previewInvoiceFx(total:string,from:string,input:InvoiceFxInput){
 if(!/^[A-Z]{3}$/.test(input.currency)||input.currency===from||!input.source.trim()||input.source.length>200)throw Error('INVALID_INVOICE_FX');
 const precision=currencyPrecision(input.currency);return {amount:manualInvoiceAmount(total,input.rate,precision),precision};
}
