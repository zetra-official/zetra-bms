const fs=require('fs'),path=require('path'),cp=require('child_process');const E=__dirname,out=path.join(E,'output/pdf');fs.mkdirSync(out,{recursive:true});const {receivingHtml}=require('./receipt.test.cjs');
for(const role of ['owner','operational'])for(const lang of ['ar','zh']){
 const receipt=JSON.parse(fs.readFileSync(path.join(E,`receipt-master-${role}.private.json`),'utf8')),stem=`master-${role}-${lang}`,html=path.join(out,stem+'.html'),pdf=path.join(out,stem+'.pdf');fs.writeFileSync(html,receivingHtml(receipt,lang));
 const r=cp.spawnSync('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless','--disable-gpu','--no-pdf-header-footer',`--user-data-dir=${path.join(E,'chrome-pdf-'+stem)}`,`--print-to-pdf=${pdf}`,require('url').pathToFileURL(html).href],{timeout:60000,encoding:'utf8'});
 if(r.status!==0||!fs.existsSync(pdf))throw Error(stem+' renderer failed: '+String(r.error??r.stderr).slice(-500));console.log(stem+' created from genuine permission-projected 105-line receipt');
}
