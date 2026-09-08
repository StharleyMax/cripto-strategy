"""`extract_force_order_natural_key` reads BOTH the raw and the combined-stream envelope shape.

Binance sends the SAME `forceOrder` event under two different wrappers depending on the endpoint:
`/ws/!forceOrder@arr` (raw, `{"e": "forceOrder", ..., "o": {...}}`) and
`/stream?streams=<symbol>@forceOrder/...` (combined, `{"stream": "...", "data": {"e": ...,
"o": {...}}}`). `docs/context/captura-em-producao/gates/forceorder-fix-quant-architect.md` moved
the LIVE collector to the combined endpoint — this file pins that `extract_force_order_natural_key`
reads the SAME five B2 fields out of either shape, and still refuses cleanly when neither is
present.
"""

from __future__ import annotations

import pytest

from src.modules.sentimento.domain.force_order_natural_key import (
    ForceOrderKeyExtractionError,
    ForceOrderNaturalKey,
    extract_force_order_natural_key,
)

# Real `forceOrder` event body, `BTCUSDT` — identical `o` object under both wrappers below.
_RAW_SHAPE = (
    '{"e":"forceOrder","E":0,"o":{"s":"BTCUSDT","S":"SELL","o":"LIMIT","f":"IOC","q":"0.010",'
    '"p":"78000.00","ap":"78006.30","X":"FILLED","l":"0.010","z":"0.010","T":1788869519500}}'
)
_COMBINED_SHAPE = (
    '{"stream":"btcusdt@forceOrder","data":{"e":"forceOrder","E":0,"o":{"s":"BTCUSDT",'
    '"S":"SELL","o":"LIMIT","f":"IOC","q":"0.010","p":"78000.00","ap":"78006.30","X":"FILLED",'
    '"l":"0.010","z":"0.010","T":1788869519500}}}'
)
_EXPECTED_KEY = ForceOrderNaturalKey(
    symbol="BTCUSDT", side="SELL", price="78000.00", orig_qty="0.010", trade_time=1788869519500
)


def test_raw_forceorder_arr_shape_still_keys() -> None:
    """The `/ws/!forceOrder@arr` shape (no `stream`/`data` wrapper) keys exactly as before."""
    assert extract_force_order_natural_key(_RAW_SHAPE) == _EXPECTED_KEY


def test_combined_stream_envelope_shape_keys_identically() -> None:
    """The `/stream?streams=...` wrapper unwraps to the SAME key as the raw shape."""
    assert extract_force_order_natural_key(_COMBINED_SHAPE) == _EXPECTED_KEY


def test_a_subscription_ack_on_the_combined_endpoint_is_unkeyable_not_a_crash() -> None:
    """Binance's `{"result": null, "id": 1}` ack has no `o` field either wrapper reaches."""
    with pytest.raises(ForceOrderKeyExtractionError, match="ADR-004"):
        extract_force_order_natural_key('{"result":null,"id":1}')


def test_a_bare_json_list_is_unkeyable_not_a_typeerror_leak() -> None:
    """A non-dict top-level JSON value must raise the DECLARED exception, never `AttributeError`.

    Regression for the `isinstance` guard the envelope unwrap needs: `[1, 2, 3].get(...)` would
    raise `AttributeError`, which this function's declared exception set does not name.
    """
    with pytest.raises(ForceOrderKeyExtractionError, match="ADR-004"):
        extract_force_order_natural_key("[1, 2, 3]")
