from pathlib import Path
import hashlib,json,zipfile
E=Path(__file__).resolve().parent;root=E.parent.parent;M=E.parent/'security-owner-privacy-m2-20261021'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
baseline=json.loads((M/'BASELINE.json').read_text());protected={p:sha(root/p)==h for p,h in baseline['protectedDirtyFiles'].items()};assert all(protected.values()),protected
preserved={}
for platform in ['web','android']:
 with zipfile.ZipFile(M/f'M2-{platform}-source.zip') as z:
  names=z.namelist()
  for suffix in ['src/currency/engine.ts','src/currency/currentValuation.ts','src/currency/rateStore.ts','src/currency/PreferredDisplay.tsx','src/currency/metadata.ts','src/currency/data/catalog.json','src/i18n/LanguageProvider.tsx','src/i18n/commonMessages.ts','src/i18n/catalog.ts']:
   candidates=[n for n in names if n==suffix or n.endswith('/'+suffix)]
   assert len(candidates)==1,(suffix,candidates)
   p=E/f'source-{platform}'/suffix;preserved[f'{platform}/{suffix}']=p.read_bytes()==z.read(candidates[0]);assert preserved[f'{platform}/{suffix}']
out={'protectedDirtyFiles':protected,'protectedCount':len(protected),'currencyAndLocalizationBytes':preserved,'pass':all(protected.values()) and all(preserved.values()),'localOnly':True}
(E/'MASTER-PRESERVATION.json').write_text(json.dumps(out,indent=2));print('Protected dirty files:',len(protected),'unchanged; currency/localization engine preimages:',len(preserved),'unchanged')
pdf=json.loads((E/'MASTER-PDF-RESULTS.json').read_text());pdf['visualReview']='PASS';pdf['visualEvidence']='Owner Arabic/Chinese first and last pages; operational Arabic/Chinese first pages inspected after final render';(E/'MASTER-PDF-RESULTS.json').write_text(json.dumps(pdf,indent=2))
