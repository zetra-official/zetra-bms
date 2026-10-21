from pathlib import Path
E=Path(__file__).resolve().parent
for platform in ['web','android']:
 p=E/f'source-{platform}/app/stocks/inbound.tsx';s=p.read_text(encoding='utf-8')
 start=s.index('  const load = useCallback(async () => {');end=s.index('  useEffect(() => {',start)
 block=s[start:end]
 block=block.replace('if (!orgId) return;','if (!orgId) return [] as InboundOrder[];')
 block=block.replace('      setRows(\n  (Array.isArray(data)', '      const loaded = (Array.isArray(data)').replace('  })) as InboundOrder[]\n);','  })) as InboundOrder[];\n      setRows(loaded);\n      return loaded;')
 block=block.replace('      setRows([]);','      setRows([]);\n      return [] as InboundOrder[];')
 assert 'return loaded;' in block;s=s[:start]+block+s[end:]
 start=s.index('const receiveSelectedOrder =');end=s.index('const openEditItem =',start);block=s[start:end]
 block=block.replace('            await load();',"            const refreshed = await load();\n            await openOrderDetail(refreshed.find(o=>o.id===selectedOrder.id)??{...selectedOrder,status:'RECEIVED'});",1)
 block=block.replace('selectedItems, load, incomingLanguage','selectedItems, load, openOrderDetail, incomingLanguage');s=s[:start]+block+s[end:]
 start=s.index('const receivePartialOrder =');end=s.index('const safeText =',start);block=s[start:end]
 block=block.replace('          await load();\n          await openOrderDetail(selectedOrder);','          const refreshed = await load();\n          await openOrderDetail(refreshed.find(o=>o.id===selectedOrder.id)??selectedOrder);',1)
 s=s[:start]+block+s[end:];p.write_text(s,encoding='utf-8')
print('Receiving detail now reloads authoritative header and item quantities after partial/full success')
