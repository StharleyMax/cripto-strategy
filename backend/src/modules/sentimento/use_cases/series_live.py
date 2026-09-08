r"""`LiveBucketSource`: the read port behind `GET /series-live` (`ADR-005/D2`, `ADR-034/D1`).

`ADR-034/D9` names exactly two NEW components for F1, both for `/series-history` — a real
trade-stream producer for the live edge (the process that would actually compute
`cvd_delta_parcial`/`last_price`/`n_trades` as trades arrive) is not one of them, and nothing
in this tree computes those numbers yet (`grep -rn 'cvd_delta_parcial\|bucket_open_ts'
backend/src` finds no producer). This module therefore declares only the PORT — the shape a
future live-bucket producer satisfies — the same "port now, adapter later" shape
`get_series_window_reader_source` uses in `src/api/dependencies.py`. Wiring a real adapter
into `src.main.create_app` is out of this phase's declared scope (`ADR-034/D9` names only the
history read path); the stub in `dependencies.py` raises until that task exists.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Protocol

from src.modules.sentimento.domain.live_bucket_envelope import LiveBucketEnvelope


class LiveBucketSource(Protocol):
    """Read port: one envelope per bucket update, for one series/symbol.

    A real adapter streams `LiveBucketEnvelope`s as trades arrive; a fake in a test can be a
    finite generator — `stream` is a plain `Iterator`, not an `async` one, because nothing in
    this port's contract requires an event loop (the route wraps it into `StreamingResponse`,
    which iterates a sync generator in a worker thread when the endpoint itself is sync).
    """

    def stream(  # noqa: D102
        self, *, series_key_id: str, symbol: str
    ) -> Iterator[LiveBucketEnvelope]: ...
