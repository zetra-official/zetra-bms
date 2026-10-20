const path=require('path'),cp=require('child_process');
const root=process.cwd(),E=__dirname,source=path.join(E,'release-source-android');
require('@expo/env').load(root,{silent:true});
const child=cp.spawn(process.execPath,[path.join(root,'node_modules/expo/bin/cli'),'start','--localhost','--port','55641'],{cwd:source,env:{...process.env,CI:'1',EXPO_ROUTER_APP_ROOT:path.join(source,'app')},stdio:'inherit'});
child.on('exit',code=>process.exit(code||0));
