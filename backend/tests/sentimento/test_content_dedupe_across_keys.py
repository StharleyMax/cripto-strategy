"""`T-07.3` wired into the real dump ETL composition root: dedupe across DIFFERENT keys.

Every fixture here is fabricated — `nada de data/`, same discipline as
`test_dump_etl_queue_resumable.py`, which this file borrows its mirror-seeding shape from.
"""

from __future__ import annotations

import hashlib
from datetime import date
from pathlib import Path

from src.modules.sentimento.domain.dump_window import AGG_TRADES, enumerate_window
from src.modules.sentimento.infra.content_dedupe_store import JsonlContentDedupeStore
from src.modules.sentimento.infra.content_deduping_worker import (
    ContentDedupingWorker,
    verified_digest_source,
)
from src.modules.sentimento.infra.dump_etl_cli import (
    CHECKPOINT_FILE,
    CONTENT_DEDUPE_FILE,
    MIRROR_DIR,
    OUTPUT_DIR,
    run,
)
from src.modules.sentimento.infra.dump_ingest_worker import DumpIngestWorker
from src.modules.sentimento.infra.file_etl_worker import OUTPUT_SUFFIX
from src.modules.sentimento.infra.jsonl_checkpoint import JsonlCheckpoint

SYMBOL = "BTCUSDT"
DATASET = AGG_TRADES.name
END = date(2026, 8, 29)


def _write_object(mirror: Path, key: str, payload: bytes) -> None:
    """Write one mirror object plus its `.CHECKSUM` sidecar, in the form the vendor publishes."""
    target = mirror / key
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()
    sidecar = target.with_name(target.name + ".CHECKSUM")
    sidecar.write_text(f"{digest}  {target.name}\n", encoding="utf-8")


def test_two_keys_with_byte_identical_content_publish_only_once(tmp_path: Path) -> None:
    """THE DoD, end to end: a re-download under a different name never republishes.

    The window is 2 days deep (2 distinct keys); both are seeded with the EXACT SAME bytes —
    the scenario named in the handoff: "re-baixado do mesmo dump", or downloaded twice with a
    different name. Only the FIRST key's object may reach `OUTPUT_DIR`.
    """
    partitions = enumerate_window(AGG_TRADES, SYMBOL, END, 2, "daily")
    keys = tuple(p.object_key for p in partitions)
    assert len(keys) == 2, "o cenario exige duas chaves distintas com o mesmo conteudo"
    payload = b"17000000000,42.5,0.01,111,122,false\n" * 200

    mirror = tmp_path / MIRROR_DIR
    for key in keys:
        _write_object(mirror, key, payload)

    processed = run(tmp_path, SYMBOL, DATASET, END, 2, "daily")

    assert processed == keys, "as DUAS chaves sao 'processadas' — a segunda como duplicata"
    out = tmp_path / OUTPUT_DIR
    published = sorted(str(p.relative_to(out)) for p in out.rglob(f"*{OUTPUT_SUFFIX}"))
    assert published == [f"{keys[0]}{OUTPUT_SUFFIX}"], "so a PRIMEIRA chave publica um objeto"
    assert not (out / f"{keys[1]}{OUTPUT_SUFFIX}").exists()

    # A chave duplicata AINDA e marcada feita — nunca mais reprocessada num resumo.
    assert sorted(JsonlCheckpoint(tmp_path / CHECKPOINT_FILE).entries()) == sorted(keys)
    ledger = JsonlContentDedupeStore(tmp_path / CONTENT_DEDUPE_FILE).ledger()
    digest = hashlib.sha256(payload).hexdigest()
    assert ledger.first_key_by_digest == {digest: keys[0]}

    # Uma segunda rodada nao refaz nada: as duas chaves ja estao no checkpoint.
    assert not run(tmp_path, SYMBOL, DATASET, END, 2, "daily")


def test_the_dod_counter_example_same_key_reprocessed_with_corrected_content_is_not_hidden(
    tmp_path: Path,
) -> None:
    """The contra-exemplo the handoff names: correcting content under the SAME key still publishes.

    This does not resume a checkpoint (the key would already be `done`); it exercises the
    dedupe layer directly, the same way the composition root wires it, to prove that a
    single-key content change is treated as NEW content rather than swallowed as a duplicate
    of itself.
    """
    partitions = enumerate_window(AGG_TRADES, SYMBOL, END, 1, "daily")
    key = partitions[0].object_key
    mirror = tmp_path / MIRROR_DIR

    _write_object(mirror, key, b"truncado, 37,7 MB")
    store = JsonlContentDedupeStore(tmp_path / CONTENT_DEDUPE_FILE)
    worker = ContentDedupingWorker(
        DumpIngestWorker(mirror, tmp_path / OUTPUT_DIR),
        digest_of=verified_digest_source(mirror),
        store=store,
    )
    worker.process(key)
    corrected_payload = b"corrigido, 6,7 GB"
    _write_object(mirror, key, corrected_payload)
    fresh_worker = ContentDedupingWorker(
        DumpIngestWorker(mirror, tmp_path / OUTPUT_DIR),
        digest_of=verified_digest_source(mirror),
        store=JsonlContentDedupeStore(tmp_path / CONTENT_DEDUPE_FILE),
    )

    fresh_worker.process(key)  # mesma chave, conteudo corrigido: NAO e duplicata

    out = tmp_path / OUTPUT_DIR / f"{key}{OUTPUT_SUFFIX}"
    assert out.read_bytes() == corrected_payload, "correcao tem de sobrescrever, nunca esconder"
