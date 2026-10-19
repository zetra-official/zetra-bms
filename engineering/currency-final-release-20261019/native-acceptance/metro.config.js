const path=require('path');
const {getDefaultConfig}=require('expo/metro-config');
const config=getDefaultConfig(__dirname);
const root=path.resolve(__dirname,'../../..');
config.watchFolders=[path.join(root,'src'),path.join(root,'node_modules')];
config.resolver.nodeModulesPaths=[path.join(root,'node_modules')];
config.resolver.disableHierarchicalLookup=true;
module.exports=config;
