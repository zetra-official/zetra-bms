from pathlib import Path
import json,hashlib,re,shutil
R=Path.cwd();E=Path(__file__).resolve().parent;base=R/'engineering/currency-final-release-20261019/catalog-only/build-source'
for platform in ['web','android']:
 source=E/('release-source-'+platform);manifest=E/('isolated-'+platform+'-source-manifest.json');d=json.loads(manifest.read_text());changes={}
 config="const path=require('path'),{getDefaultConfig}=require('expo/metro-config');const c=getDefaultConfig(__dirname);c.projectRoot=__dirname;c.watchFolders=[path.resolve(__dirname,'../../../node_modules')];c.resolver.nodeModulesPaths=c.watchFolders;module.exports=c;\n"
 changes['metro.config.js']=(config,'Isolated build root only')
 for rel in ['scripts/release-guard.cjs','src/proforma/invoiceFx.ts']:
  if rel.endswith('invoiceFx.ts'):
   prior=(source/rel).read_text(encoding='utf-8');current=(R/rel).read_text(encoding='utf-8');assert prior.replace('currencyPrecision(input.currency)',"currencyPrecision(input.currency,'LEGACY_PROFORMA')")==current
  changes[rel]=((R/rel).read_text(encoding='utf-8'),'Existing release guard / preserve original Proforma quotation precision')
 if platform=='android':
  rel='src/ai/business/types.ts';text=(base/rel).read_text(encoding='utf-8');assert not re.search(r'export\s+(const|function|class|enum)\b',text);changes[rel]=(text,'Baseline type-only definitions')
  rel='src/types/maniac-tech-react-native-expo-read-sms.d.ts';changes[rel]=((base/rel).read_text(encoding='utf-8'),'Baseline module declaration only')
  text=(base/'src/proforma/supabaseTransport.ts').read_text(encoding='utf-8');changes['src/proforma/supabaseTransport.d.ts']=(next(line for line in text.splitlines() if line.startswith('export type RpcPort ='))+'\n','Baseline RpcPort type only; no runtime transport added')
  changes['src/components/LanguagePickerAll.d.ts']=("import type {ComponentType} from 'react';\nexport declare const LanguagePickerAll:ComponentType<{value:string|null;onChange:(locale:string)=>void;title?:string;disabled?:boolean;hint?:string}>;\n",'Unused import declaration only; no runtime language feature added')
 for rel,(text,purpose) in changes.items():
  p=source/rel;before=d['changes'].get(rel,{}).get('before',d['allSourceFiles'].get(rel));p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text,encoding='utf-8');h=hashlib.sha256(p.read_bytes()).hexdigest();d['allSourceFiles'][rel]=h;d['changes'][rel]={'before':before,'after':h,'purpose':purpose}
 manifest.write_text(json.dumps(d,indent=2),encoding='utf-8')
print('Isolated baseline compatibility files complete; no publication')
