import snapshot from './data/catalog.json';
export const currencyDataVersion={asOf:snapshot.asOf,sources:snapshot.sources};
export const currentCurrencyMetadata=snapshot.currencies;
export const historicalCurrencyMetadata=snapshot.historical;
export function currencyMetadata(code:string){return currentCurrencyMetadata.find(c=>c.code===code);}
export function isSelectableCurrency(code:string){return currencyMetadata(code)?.status==='ACTIVE';}
/** Accounting precision from ISO; CLDR cash rounding is a separate preview rule. */
export function isoMinorUnits(code:string):number{
 const units=currencyMetadata(code)?.decimals;
 if(typeof units!=='number'||!Number.isInteger(units)||units<0||units>6)throw Error('CURRENCY_METADATA_UNAVAILABLE');return units;
}
