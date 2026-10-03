"""F-A of `T-06.4-prova.md` §4: one sha256 per `/series-history` envelope, run INSIDE the api.

Executed by `compact.sh envelopes` as `docker exec -i deploy-api-1 python -c <this file>`, with
the plan on stdin, one request per line: `series_key_id|interval|horizon|bar_policy|
window_start_ms|window_end_ms|knowledge_time_ms`. Prints one TSV line per request:
`key  status  sha256  latest_bucket_ms`.

The hash covers the whole JSON body EXCEPT `server_now_ms` (anywhere) and
`panel.coverage.latest_bucket_ms`: `read_bounds` ignores `knowledge_time` and the live writer
moves the `MAX` (§4). `earliest_bucket_ms` stays IN the hash. `latest_bucket_ms` is printed apart
so `compact.sh verify` can check it never goes back.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

_BASE = f"http://127.0.0.1:{os.environ.get('APP_PORT', '8000')}"
_PREFIX = os.environ.get("API_PREFIX", "/api/v1")
_SYMBOL = os.environ.get("SYMBOL", "BTCUSDT")
_TIMEOUT_S = 300


def _strip(node: object, parent: str = "") -> tuple[object, object]:
    """Return `(node without the volatile keys, the latest_bucket_ms found or None)`."""
    latest: object = None
    if isinstance(node, dict):
        kept = {}
        for key, value in node.items():
            if key == "server_now_ms":
                continue
            if key == "latest_bucket_ms" and parent == "coverage":
                latest = value
                continue
            cleaned, found = _strip(value, key)
            latest = found if found is not None else latest
            kept[key] = cleaned
        return kept, latest
    if isinstance(node, list):
        items = []
        for value in node:
            cleaned, found = _strip(value, parent)
            latest = found if found is not None else latest
            items.append(cleaned)
        return items, latest
    return node, None


def _fetch(line: str) -> str:
    sid, interval, horizon, bar_policy, start, end, knowledge = line.split("|")
    key = f"{sid}:{interval}:{horizon}:{bar_policy}"
    query = urllib.parse.urlencode(
        {
            "series_key_id": sid,
            "symbol": _SYMBOL,
            "interval": interval,
            "window_start_ms": start,
            "window_end_ms": end,
            "knowledge_time_ms": knowledge,
            "bar_policy": bar_policy,
        }
    )
    url = f"{_BASE}{_PREFIX}/series-history?{query}"
    try:
        with urllib.request.urlopen(url, timeout=_TIMEOUT_S) as response:  # noqa: S310
            status, body = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, body = error.code, error.read()
    try:
        cleaned, latest = _strip(json.loads(body))
        canonical = json.dumps(cleaned, sort_keys=True, separators=(",", ":")).encode()
    except ValueError:
        canonical, latest = body, None
    digest = hashlib.sha256(canonical).hexdigest()
    return f"{key}\t{status}\t{digest}\t{'' if latest is None else latest}"


def main() -> int:
    """Hash every planned request, in plan order."""
    for raw in sys.stdin:
        line = raw.strip()
        if line:
            print(_fetch(line), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
