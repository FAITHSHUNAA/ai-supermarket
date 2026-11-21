import gzip
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path


source = Path("/var/lib/ai-supermarket-live/db.json")
directory = Path(os.environ["STATE_DIRECTORY"])
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
# The service writes db.json by atomic rename, so one open reads one revision.
snapshot = source.read_bytes()
data = json.loads(snapshot)
if data.get("production") is not True or not isinstance(data.get("orders"), list):
    raise ValueError("Expected the production marketplace database")

with tempfile.NamedTemporaryFile(dir=directory, delete=False) as tmp:
    temp_path = Path(tmp.name)
try:
    temp_path.write_bytes(gzip.compress(snapshot))
    if gzip.decompress(temp_path.read_bytes()) != snapshot:
        raise ValueError("Backup round trip failed")
    temp_path.replace(directory / f"market-{stamp}.json.gz")
finally:
    temp_path.unlink(missing_ok=True)

for expired in sorted(directory.glob("market-*.json.gz"), reverse=True)[7:]:
    expired.unlink()
