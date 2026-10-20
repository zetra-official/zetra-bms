"""Read-only original-currency verification of PDFs generated on physical Android."""
from pathlib import Path
from decimal import Decimal as D
import json,hashlib,re
from pypdf import PdfReader
E=Path(__file__).resolve().parent;R=E.parent.parent
documents=json.loads((E/'NATIVE-PDF-EVIDENCE.json').read_text(encoding='utf-8'))['documents']
events=json.loads((E/'ORIGINAL-WORKFLOW-RUNTIME-EVENTS.json').read_text(encoding='utf-8'))['events']
codes=['TZS','USD','KES','UGX','EUR','AED','JPY','KWD'];rows=[]
for code in codes:
 document=next(d for d in reversed(documents) if d['currency']==code)
 pdf=R/document['file'];assert hashlib.sha256(pdf.read_bytes()).hexdigest()==document['sha256']
 reader=PdfReader(pdf);assert len(reader.pages)==1
 text=reader.pages[0].extract_text().replace('\xa0',' ')
 fact=next(e['data'] for e in reversed(events) if e['rpc']=='refund_original_sale_v1' and e.get('data',{}).get('refundId')==document['refundId'])
 assert fact['refundId'] in text and fact['saleId'] in text
 assert re.search(r'Currency\s+'+code+r'\b',text),'EXPLICIT_ORIGINAL_CURRENCY_REQUIRED '+code
 for label,value in [('Net reversal',fact['originalSlice']['net']),('Tax reversal',fact['originalSlice']['tax']),('Refunded',fact['amount'])]:
  match=re.search(label+r'\s+[^0-9]*([0-9][0-9,]*(?:\.[0-9]+)?)',text)
  assert match and D(match[1].replace(',',''))==D(value),(code,label,value,text)
 assert 'COGS' not in text and 'sourceAccountId' not in text
 rows.append({'currency':code,'refundId':fact['refundId'],'file':document['file'],'sha256':document['sha256'],'pages':1,'originalAmount':fact['amount'],'originalNet':fact['originalSlice']['net'],'originalTax':fact['originalSlice']['tax']})
out={'status':'PASS','scope':'Actual physical Android Expo Print files, canonical original refund amounts and explicit currency codes. Android share-sheet observation is separate UI evidence. No external recipient or paper print job.','documents':rows,'productionFinancialWrites':False}
(E/'NATIVE-PDF-VERIFICATION.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
print(json.dumps({'status':'PASS','currencies':len(rows)}))
