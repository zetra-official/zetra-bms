from urllib.request import urlopen,Request
from pathlib import Path
from datetime import datetime,timezone
import json,hashlib
E=Path(__file__).resolve().parent;url='https://bot.go.tz/ExchangeRate/excRates?lang=en'
with urlopen(Request(url,headers={'User-Agent':'ZETRA-local-ui-evidence'}),timeout=20) as r:
 assert r.url==url;raw=r.read(400001);assert len(raw)<=400000
(E/'bot-acceptance.public-feed').write_bytes(raw);(E/'bot-acceptance.json').write_text(json.dumps({'source':url,'retrievedAt':datetime.now(timezone.utc).isoformat(),'sha256':hashlib.sha256(raw).hexdigest()},indent=2));print('Official BoT snapshot saved; public rates only')
