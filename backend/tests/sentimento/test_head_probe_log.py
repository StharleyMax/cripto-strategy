"""The seam between `curl -sI` and the offline classification, and the checkpoint shape refusals.

Both halves are the same debt in two files: a record that cannot be read must land in the class
its own docstring declares, instead of escaping as whatever exception Python happened to raise.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from src.modules.sentimento.domain.dump_window import AGG_TRADES, DumpPartition, enumerate_window
from src.modules.sentimento.infra.head_probe_log import (
    CorruptedProbeLogError,
    UnreadableHeadResponseError,
    outcomes_for,
    parse_head_response,
    read_probe_log,
)
from src.modules.sentimento.infra.jsonl_checkpoint import CorruptedCheckpointError, JsonlCheckpoint

END = date(2026, 8, 29)
PROBE_FILENAME = "probe.jsonl"

PRESENT_HEAD = (
    "HTTP/1.1 200 OK\r\nContent-Type: application/zip\r\nContent-Length: 6712517585\r\n\r\n"
)
MISSING_HEAD = "HTTP/1.1 404 Not Found\r\nContent-Type: application/xml\r\n\r\n"
REDIRECTED_HEAD = (
    "HTTP/1.1 307 Temporary Redirect\r\n"
    "Location: https://example.invalid/x\r\n"
    "Content-Length: 0\r\n"
    "\r\n"
    "HTTP/1.1 200 OK\r\n"
    "Content-Length: 37761761\r\n"
    "\r\n"
)


def test_a_present_object_yields_its_status_and_length() -> None:
    """Read the two fields §5.8's probe actually needs off raw `curl -sI` output."""
    assert parse_head_response(PRESENT_HEAD) == (200, 6_712_517_585)


def test_a_missing_object_yields_404_and_no_length() -> None:
    """A `404` has no body, so inventing a length would invent evidence."""
    assert parse_head_response(MISSING_HEAD) == (404, None)


def test_the_last_response_wins_when_the_bucket_answers_through_a_redirect() -> None:
    """THE DEFECT THIS PREVENTS, and it is silent in both directions.

    Reading the FIRST status classifies a present object as a redirect; reading the first
    `content-length` reads the redirect's `0` and reports an EMPTY object. Both are wrong, and
    neither raises. The final response is the one that describes the object.
    """
    assert parse_head_response(REDIRECTED_HEAD) == (200, 37_761_761)


def test_output_with_no_status_line_is_refused_rather_than_read_as_a_404() -> None:
    """A `curl` that never reached the host reports NOTHING, and nothing is not a `404`.

    Coercing it to `404` would report the bucket as having deleted an object when the truth is
    that the probe failed — and §5.8's whole purpose is discovering real deletion.
    """
    with pytest.raises(UnreadableHeadResponseError):
        parse_head_response("")
    with pytest.raises(UnreadableHeadResponseError):
        parse_head_response("curl: (6) Could not resolve host\n")


def test_a_probe_log_that_does_not_exist_reads_as_no_observations(tmp_path: Path) -> None:
    """No probe log is no evidence — not evidence of health."""
    assert read_probe_log(tmp_path / "absent.jsonl") == ()

    empty = tmp_path / "empty.jsonl"
    empty.write_bytes(b"")
    assert read_probe_log(empty) == ()


def test_a_tail_written_without_a_newline_is_discarded_and_the_rest_survives(
    tmp_path: Path,
) -> None:
    """A monthly cron killed mid-write leaves a partial line; the complete ones still count."""
    log = tmp_path / PROBE_FILENAME
    log.write_text(
        json.dumps({"object_key": "a.zip", "status": 200, "content_length": 1})
        + "\n"
        + '{"object_key": "b.zi',
        encoding="utf-8",
    )

    records = read_probe_log(log)

    assert len(records) == 1
    assert records[0]["object_key"] == "a.zip"


def test_blank_lines_in_the_probe_log_are_skipped_rather_than_read_as_records(
    tmp_path: Path,
) -> None:
    """A shell loop that echoes an empty line must not manufacture an observation."""
    log = tmp_path / PROBE_FILENAME
    log.write_text(
        "\n   \n"
        + json.dumps({"object_key": "a.zip", "status": 200, "content_length": 1})
        + "\n\n",
        encoding="utf-8",
    )

    records = read_probe_log(log)

    assert len(records) == 1


@pytest.mark.parametrize(
    ("label", "line"),
    [
        ("not json", "definitely-not-json"),
        ("not an object", "[1, 2, 3]"),
        ("no object_key", '{"status": 200}'),
        ("no status", '{"object_key": "a.zip"}'),
    ],
)
def test_a_complete_but_unreadable_probe_line_lands_in_the_declared_class(
    tmp_path: Path, label: str, line: str
) -> None:
    """Every unreadable shape raises `CorruptedProbeLogError`, so one `except` really catches all.

    A caller written against the docstring of that class must not die on a `KeyError` or a
    `TypeError` that the class never mentions.
    """
    log = tmp_path / PROBE_FILENAME
    log.write_text(line + "\n", encoding="utf-8")

    with pytest.raises(CorruptedProbeLogError):
        read_probe_log(log)


def test_outcomes_follow_the_partition_order_and_never_the_order_of_the_file(
    tmp_path: Path,
) -> None:
    """`classify` reads the NEXT element, so a shuffled log must not decide who the neighbour is.

    A shell loop writes in whatever order it iterated. Trusting that order would make the
    `SUSPECT_LAST_BEFORE_ABSENT` rule answer confidently about the wrong period.
    """
    partitions = enumerate_window(AGG_TRADES, "BTCUSDT", END, 3, "daily")
    shuffled = tuple(
        {"object_key": p.object_key, "status": 200, "content_length": 10}
        for p in reversed(partitions)
    )

    outcomes = outcomes_for(partitions, shuffled)

    assert [o.partition.object_key for o in outcomes] == [p.object_key for p in partitions]


def test_a_partition_nobody_probed_is_skipped_rather_than_defaulted(tmp_path: Path) -> None:
    """Defaulting to 200 invents presence; defaulting to 404 invents loss. Absence is the report."""
    partitions = enumerate_window(AGG_TRADES, "BTCUSDT", END, 3, "daily")
    only_middle = ({"object_key": partitions[1].object_key, "status": 200, "content_length": 7},)

    outcomes = outcomes_for(partitions, only_middle)

    assert len(outcomes) == 1
    assert outcomes[0].partition is partitions[1]
    assert outcomes[0].content_length == 7


def test_an_observation_naming_a_key_outside_the_window_is_simply_unused() -> None:
    """The window comes from the DEPTH parameter; the file never gets to widen it."""
    partitions = enumerate_window(AGG_TRADES, "BTCUSDT", END, 2, "daily")
    stranger = DumpPartition(AGG_TRADES, "BTCUSDT", "daily", date(2001, 1, 1))

    outcomes = outcomes_for(
        partitions, ({"object_key": stranger.object_key, "status": 404, "content_length": None},)
    )

    assert outcomes == ()


@pytest.mark.parametrize(
    ("label", "line"),
    [
        ("wrong field name", '{"chave": "a.csv"}'),
        ("a bare number", "5"),
        ("a bare list", '["a.csv"]'),
        ("a null key", '{"key": null}'),
    ],
)
def test_a_checkpoint_line_that_is_not_a_string_key_is_corruption_not_a_key(
    tmp_path: Path, label: str, line: str
) -> None:
    """THE DEBT `jsonl_checkpoint` NAMED FOR `T-03.10`, and the fourth case was the dangerous one.

    `{"key": null}` used to raise NOTHING: `str(None)` coerced it into the four-character string
    `None`, and a key by that name was marked DONE in silence — defeating the "never loses"
    invariant by coercion, with the symptom surfacing one layer away as a
    `CheckpointOutsideWindowError` about a key nobody can find in the bucket.

    `[MEDIDO 2026-08-29, n=4 payloads: the four below now all land in
    `CorruptedCheckpointError`; before the fix they raised `KeyError`, `TypeError`, `TypeError`
    and NOTHING respectively]`.
    """
    ledger = tmp_path / "checkpoint.jsonl"
    ledger.write_text(line + "\n", encoding="utf-8")

    with pytest.raises(CorruptedCheckpointError):
        JsonlCheckpoint(ledger).entries()


def test_an_empty_string_key_is_refused_because_it_names_no_work(tmp_path: Path) -> None:
    """`EtlBacklog` already refuses an empty key in the WINDOW; the ledger refuses it too."""
    ledger = tmp_path / "checkpoint.jsonl"
    ledger.write_text('{"key": ""}\n', encoding="utf-8")

    with pytest.raises(CorruptedCheckpointError):
        JsonlCheckpoint(ledger).entries()


def test_a_well_formed_checkpoint_still_reads_exactly_as_before(tmp_path: Path) -> None:
    """The refusals are additions, not a change of behaviour on the happy path."""
    ledger = tmp_path / "checkpoint.jsonl"
    checkpoint = JsonlCheckpoint(ledger)
    checkpoint.record("a.zip")
    checkpoint.record("b.zip")

    assert checkpoint.entries() == ("a.zip", "b.zip")
    assert checkpoint.done() == frozenset({"a.zip", "b.zip"})
