// Per-screen indexes only: discard with the rows array. No global/user/tenant cache.
type CatalogRow={name?:string|null;sku?:string|null;unit?:string|null;category?:string|null;barcode?:string|null;is_active?:boolean|null};
const normalize=(value:unknown)=>String(value??'').toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ');
export function indexCatalog<T extends CatalogRow>(rows:T[]){
 return rows.filter(row=>row.is_active!==false).map(row=>{const text=[row.name,row.sku,row.unit,row.category,row.barcode].map(normalize);return {row,text,compact:text.map(v=>v.replace(/\s+/g,''))};});
}
export function searchCatalog<T extends CatalogRow>(index:ReturnType<typeof indexCatalog<T>>,query:string):T[]{
 const q=normalize(query),compact=q.replace(/\s+/g,'');
 if(!q&&!compact)return index.map(x=>x.row);
 return index.map(x=>({row:x.row,score:x.text.some(v=>v===q)||x.compact.some(v=>v===compact)?300:x.text.some(v=>v.startsWith(q))||x.compact.some(v=>v.startsWith(compact))?200:x.text.some(v=>v.includes(q))||x.compact.some(v=>v.includes(compact))?100:0})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||String(a.row.name??'').localeCompare(String(b.row.name??''))).map(x=>x.row);
}
type POSRow={name?:string|null;sku?:string|null;category?:string|null;barcode?:string|null};
export function indexPOS<T extends POSRow>(rows:T[]){return rows.map(row=>({row,text:[row.name,row.sku,row.category,row.barcode].map(v=>(v??'').toLowerCase())}));}
export function searchPOS<T extends POSRow>(index:ReturnType<typeof indexPOS<T>>,query:string):T[]{const q=query.trim().toLowerCase();return index.filter(x=>!q||x.text.some(v=>v.includes(q))).map(x=>x.row);}
