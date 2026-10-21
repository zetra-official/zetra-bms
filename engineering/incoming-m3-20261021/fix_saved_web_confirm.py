from pathlib import Path
E=Path(__file__).resolve().parent
for platform in ['web','android']:
 p=E/f'source-{platform}/app/stocks/inbound.tsx';s=p.read_text(encoding='utf-8')
 pos=s.index('export default function InboundStockScreen()')
 bridge='''// React Native Web Alert.alert is a no-op; receiving must have an actual confirmation.
function receivingAlert(title:string,message:string,buttons?:Parameters<typeof Alert.alert>[2]){
 if(Platform.OS!=='web'){Alert.alert(title,message,buttons);return}
 const action=buttons?.find(b=>b.style!=='cancel'&&b.onPress);
 if(action){if(window.confirm(title+'\\n\\n'+message))action.onPress?.()}
 else window.alert(title+'\\n\\n'+message);
}
'''
 s=s[:pos]+bridge+s[pos:]
 for start,end in [('const receiveSelectedOrder =','const openEditItem ='),('const receivePartialOrder =','const safeText =')]:
  a=s.index(start);b=s.index(end,a);s=s[:a]+s[a:b].replace('Alert.alert(','receivingAlert(')+s[b:]
 p.write_text(s,encoding='utf-8')
print('Saved full/partial receiving now uses real Web confirmation and unchanged native Alert')
