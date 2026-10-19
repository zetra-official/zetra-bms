from pathlib import Path
import subprocess,json
D=Path(__file__).resolve().parent;cli='C:/Users/ZetraAdmin/AppData/Roaming/npm/node_modules/eas-cli/bin/run'
p=subprocess.run(['node',cli,'channel:view','production','--json','--non-interactive'],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=90);(D/'eas-channel.private.log').write_text(p.stdout+'\n'+p.stderr,encoding='utf-8');assert p.returncode==0
v=json.loads(p.stdout[p.stdout.index('{'):]);page=v.get('currentPage',v);branches=page.get('updateBranches',[]);updates=[u for b in branches for group in b.get('updateGroups',[]) for u in (group if isinstance(group,list) else [group]) if u.get('platform')=='android']
result={'channel':page.get('name'),'paused':page.get('isPaused'),'branches':[{'id':b['id'],'name':b['name']} for b in branches],'latestAndroid':[{k:u.get(k) for k in ['id','group','runtimeVersion','gitCommitHash','isGitWorkingTreeDirty','createdAt','message']} for u in updates[:3]],'readOnly':True}
assert result['channel']=='production' and result['paused'] is False
(D/'EAS-PRODUCTION-DELIVERY.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
apk=D/'installed.private.apk';aapt='C:/Users/ZetraAdmin/AppData/Local/Android/Sdk/build-tools/36.0.0/aapt2.exe';p=subprocess.run([aapt,'dump','resources',str(apk)],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=60);assert p.returncode==0
lines=p.stdout.splitlines();r=['\n'.join(lines[i:i+5]) for i,x in enumerate(lines) if '0x7f1300a9' in x or 'expo_runtime_version' in x]
installed=json.loads((D/'INSTALLED-APK-DELIVERY.json').read_text());installed['runtimeResource']=r;(D/'INSTALLED-APK-DELIVERY.json').write_text(json.dumps(installed,indent=2),encoding='utf-8');print(json.dumps(result));print('Runtime resource: '+str(r))
