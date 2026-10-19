import {Language} from './catalog';
import {translateCommon} from './commonMessages';
import {systemMessageSources,initialGuideMessage} from './systemMessageSources';
const exact = new Set<string>([initialGuideMessage,...systemMessageSources].filter(source=>!/{p\d+}/.test(source)));
const escapePattern = (value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templates = systemMessageSources.filter(source=>/{p\d+}/.test(source)).map(source=>{
  const names = Array.from(source.matchAll(/{(p\d+)}/g),match=>match[1]);
  const parts = source.split(/{p\d+}/g);
  return {source,names,pattern:new RegExp('^'+parts.map(escapePattern).join('([\\s\\S]*?)')+'$')};
});
// Render-boundary localization keeps stored errors and backend state language-neutral.
// Unknown remote diagnostics and user-controlled text are returned verbatim.
export function translateSystemMessage(language:Language,value:string|null|undefined):string {
  const text=value??'';
  if(exact.has(text))return translateCommon(language,text);
  if(text.length>32768)return text;
  for(const template of templates){
    const match=template.pattern.exec(text);
    if(!match)continue;
    const params:Record<string,string>={};
    template.names.forEach((name,index)=>{params[name]=match[index+1]});
    // Boolean labels belong to the owned closing-summary UI, not stored record values.
    if(template.source.startsWith("Date: {p0}\nLocked: {p1}") && (params.p1 === "YES" || params.p1 === "NO"))params.p1=translateCommon(language,params.p1);
    return translateCommon(language,template.source,params);
  }
  return text;
}
