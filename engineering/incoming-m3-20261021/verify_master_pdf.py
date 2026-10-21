from pathlib import Path
from pypdf import PdfReader
import json,subprocess,re
E=Path(__file__).resolve().parent;P=E/'output/pdf';checks=[]
def check(name,ok):checks.append({'name':name,'status':'PASS' if ok else 'FAIL'});assert ok,name
for role in ['owner','operational']:
 for lang in ['ar','zh']:
  stem=f'master-{role}-{lang}';p=P/(stem+'.pdf');r=PdfReader(p);txt='\n'.join(page.extract_text() for page in r.pages)
  check(stem+' multipage',len(r.pages)>1);check(stem+' all 105 original SKUs',all('MASTER-'+str(n) in txt for n in range(1,106)));check(stem+' Chinese product identity preserved','商品' in txt)
  if role=='operational':check(stem+' no acquisition cost columns',not re.search(r'(?<![0-9A-Za-z])500(?:\.0+)?(?![0-9A-Za-z])',txt))
  for page in ([1,len(r.pages)] if role=='owner' else [1]):
   args=['pdftoppm','-f',str(page),'-l',str(page),'-singlefile','-scale-to','1400','-png',str(p),str(P/f'{stem}-page-{page}')];subprocess.run(args,check=True,capture_output=True)
out={'checks':checks,'pass':sum(c['status']=='PASS' for c in checks),'fail':sum(c['status']=='FAIL' for c in checks),'visualReview':'PENDING','nativePrintShare':'NOT TESTED'};(E/'MASTER-PDF-RESULTS.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
