const fs=require('fs'),path=require('path'),esbuild=require('esbuild'),cp=require('child_process');
const E=__dirname,B=path.resolve(E,'../security-owner-privacy-m2-20261021/source-web');
const out=path.join(E,'output/pdf');fs.mkdirSync(out,{recursive:true});
esbuild.buildSync({entryPoints:[path.join(B,'src/proforma/document.ts')],bundle:true,platform:'node',format:'cjs',outfile:path.join(E,'document.cjs')});
const {buildProformaHtml}=require('./document.cjs');
const id=n=>'21000000-0000-4000-8000-'+String(n).padStart(12,'0');
const q={id:id(950),reference:'M2-SYNTHETIC-NOT-A-SALE',revision:1,organizationId:id(100),storeId:id(200),createdBy:id(1),status:'DRAFT',reservationStatus:'NONE',issuedAt:'2026-10-21T10:00:00Z',validUntil:'2026-10-22T10:00:00Z',timeZone:'Africa/Dar_es_Salaam',currency:'TZS',business:{organizationId:id(100),storeId:id(200),businessName:'M2 SYNTHETIC 测试 متجر',storeName:'Local only'},customer:{name:'测试客户 عميل تجريبي'},items:[{productId:id(300),description:'测试商品 منتج اختبار',sku:'M2-SKU-UNCHANGED',unit:'pcs',quantity:'1',unitPrice:'101',gross:'101',discount:'0',tax:'0',total:'101'}],subtotal:'101',discount:'0',tax:'0',total:'101',notes:'LOCAL SYNTHETIC — NOT FINANCIAL EVIDENCE'};
for(const lang of ['ar','zh']){
const html=path.join(out,lang+'.html'),pdf=path.join(out,lang+'.pdf');fs.writeFileSync(html,buildProformaHtml(q,lang));
cp.execFileSync('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--disable-gpu','--no-pdf-header-footer','--user-data-dir='+path.join(E,'chrome-pdf-'+lang),'--print-to-pdf='+pdf,'file:///'+html.replaceAll('\\','/')],{timeout:60000,stdio:'ignore'});
console.log(lang,fs.statSync(pdf).size);
}
