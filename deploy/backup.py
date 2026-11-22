import gzip
import json
import os
import tempfile
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


source = Path("/var/lib/ai-supermarket-live/db.json")
directory = Path(os.environ["STATE_DIRECTORY"])
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
# The service writes db.json by atomic rename, so one open reads one revision.
sqlite_path = source.with_name("market.sqlite")
if sqlite_path.exists():
    with sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True) as connection:
        connection.execute("BEGIN")
        data = {k: json.loads(v) for k, v in connection.execute("SELECT key,value FROM state")}
        for table in ("orders", "entitlements", "refunds"):
            data[table] = [json.loads(row[0]) for row in connection.execute(f"SELECT value FROM {table} ORDER BY rowid")]
        snapshot = json.dumps(data, ensure_ascii=False).encode()
else:
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
