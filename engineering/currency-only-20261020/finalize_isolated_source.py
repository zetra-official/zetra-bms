"""Finalize existing isolated copies only; never publish or traverse node_modules."""
from pathlib import Path
import hashlib,json,re
E=Path(__file__).resolve().parent
for platform in ['web','android']:
    source=E/('release-source-'+platform)
    mp=E/('isolated-'+platform+'-source-manifest.json')
    manifest=json.loads(mp.read_text())
    for rel in list(manifest['allSourceFiles']):
        p=source/rel
        if rel.startswith('app/') and p.suffix=='.tsx':
            text=p.read_text(encoding='utf-8')
            text=re.sub(r'\{label:"(Expenses|Stock Value|Stock In|Profit|Net profit|Outstanding credit)",amount:([^{}]+?)\}',lambda m:m.group(0) if 'ownerOnly:' in m.group(0) else m.group(0)[:-1]+',ownerOnly:true}',text)
            p.write_text(text,encoding='utf-8')
        if rel=='public/_redirects':
            text=p.read_text(encoding='utf-8')
            for rule in ['/api/reference-fx/bot https://bot.go.tz/ExchangeRate/excRates?lang=en 200!','/api/reference-fx/ecb https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml 200!']:
                if rule not in text:text=text.replace('/* /index.html 200',rule+'\n/* /index.html 200')
            p.write_text(text,encoding='utf-8')
        h=hashlib.sha256(p.read_bytes()).hexdigest()
        if h!=manifest['allSourceFiles'][rel]:
            change=manifest['changes'].setdefault(rel,{'before':manifest['allSourceFiles'][rel]})
            change['after']=h
            manifest['allSourceFiles'][rel]=h
    mp.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('Isolated finalization complete; no publication')
