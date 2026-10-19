from pathlib import Path
import json,subprocess,hashlib
from pypdf import PdfReader
from PIL import Image,ImageOps,ImageDraw
E=Path(__file__).resolve().parent;D=E/'document-evidence';poppler=Path('C:/Users/ZetraAdmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin/pdftoppm.exe');checks=[];thumbs=[]
for p in sorted(D.glob('*.pdf')):
 reader=PdfReader(p);text='\n'.join(page.extract_text() for page in reader.pages);assert len(reader.pages)==1 and 'ZETRA BMS' in text and not any(x in text for x in ['NaN','undefined','Infinity'])
 if p.stem=='KWD-en':assert '1.389' in text and '12.345' in text
 prefix=D/(p.stem+'-page');subprocess.run([str(poppler),'-png','-r','90','-singlefile',str(p),str(prefix)],check=True,capture_output=True)
 im=Image.open(str(prefix)+'.png').convert('RGB');thumb=ImageOps.contain(im,(300,425));canvas=Image.new('RGB',(320,455),'#dbe3ea');canvas.paste(thumb,((320-thumb.width)//2,25));ImageDraw.Draw(canvas).text((10,7),p.stem,fill='black');thumbs.append(canvas)
 checks.append({'file':p.name,'pages':1,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'textVerified':True,'fullPageRendered':True})
 sheet=Image.new('RGB',(960,455*3),'#dbe3ea')
 for i,im in enumerate(thumbs):sheet.paste(im,((i%3)*320,(i//3)*455))
 sheet.save(D/'contact-sheet.png')
assert len(checks)==9
(E/'PDF-INTEGRITY-RESULTS.json').write_text(json.dumps({'status':'PASS','documents':checks,'scope':'Actual Chromium PDFs generated from final application builder and synthetic canonical facts. Physical Android sharing NOT TESTED.'},indent=2));print('PASS 9 PDFs: render/text/hash')
