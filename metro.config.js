const {getDefaultConfig} = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Disposable financial databases and acceptance exports are never app modules.
// Keeping them outside Metro's crawl also prevents generated bundles recursing.
const escapedRoot = __dirname.split(/[/\\]/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[/\\\\]');
const ignored = new RegExp('^' + escapedRoot + '[/\\\\](?:engineering|output)[/\\\\]');
const previous = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(previous) ? previous : previous ? [previous] : []),
  ignored,
];
module.exports = config;
