"""Affected legacy partial/full receiving regression; preserve prior evidence files."""
from pathlib import Path
E=Path(__file__).resolve().parent
s=(E/'test_remaining_db.py').read_text(encoding='utf-8').replace('CONCURRENCY-ATOMICITY-REGRESSION.json','MASTER-LEGACY-REGRESSION.json').replace('receipt-owner.private.json','receipt-legacy-master.private.json').replace('receiving-event.private.json','receiving-event-legacy-master.private.json')
exec(compile(s,str(E/'test_remaining_db.py'),'exec'))
