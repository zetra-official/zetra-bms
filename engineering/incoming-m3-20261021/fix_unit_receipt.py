from pathlib import Path
E=Path(__file__).resolve().parent
for platform in ['web','android']:
 root=E/f'source-{platform}'
 p=root/'src/incoming/receipt.ts';s=p.read_text(encoding='utf-8')
 old="${esc(l.entered_quantity)} ${esc(l.stock_mode)} × ${esc(l.pack_size)} ${esc(l.unit)}"
 new="${l.stock_mode==='UNIT'?`${esc(l.entered_quantity)} ${esc(l.unit)}`:`${esc(l.entered_quantity)} ${esc(l.stock_mode)} × ${esc(l.pack_size)} ${esc(l.unit)}`}"
 assert old in s;s=s.replace(old,new);p.write_text(s,encoding='utf-8')
 p=root/'src/incoming/ReceiptScreen.tsx';s=p.read_text(encoding='utf-8')
 old="{l.pack_size&&<Text>{l.entered_quantity} {l.stock_mode} × {l.pack_size} {l.unit}</Text>}"
 new="{l.pack_size&&<Text>{l.stock_mode==='UNIT'?`${l.entered_quantity} ${l.unit}`:`${l.entered_quantity} ${l.stock_mode} × ${l.pack_size} ${l.unit}`}</Text>}"
 assert old in s;s=s.replace(old,new);p.write_text(s,encoding='utf-8')
print('UNIT receipts display base quantity without falsely multiplying by pack size')
