from pathlib import Path
p=Path('src/currency/originalReport.ts');s=p.read_text(encoding='utf-8')
a="esc(originalFactText(r,s.kind==='SALE'?'total':'amount',input.language))"
b="esc(r.values[s.kind==='SALE'?'total':'amount']==null?'—':originalFactText(r,s.kind==='SALE'?'total':'amount',input.language))"
assert a in s;s=s.replace(a,b);p.write_text(s,encoding='utf-8')
