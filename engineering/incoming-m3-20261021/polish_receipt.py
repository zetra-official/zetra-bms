from pathlib import Path
E=Path(__file__).resolve().parent
for platform in ['web','android']:
 p=E/f'source-{platform}/src/incoming/ReceiptScreen.tsx';s=p.read_text(encoding='utf-8');line="{l.pack_size&&<Text>{l.entered_quantity} {l.stock_mode} × {l.pack_size} {l.unit}</Text>}";s=s.replace(line+line,line);p.write_text(s,encoding='utf-8')
 p=E/f'source-{platform}/src/incoming/BulkScreen.tsx';s=p.read_text(encoding='utf-8').replace('Ã‚Â·','·').replace('Ã¢Å“â€œ','✓');p.write_text(s,encoding='utf-8')
print('Duplicate package row and pre-existing garbled button separators corrected in isolated candidate only')
