"""`T-05.4`: the Coinalyze key is in `.env` and NOWHERE else in the versioned tree.

The DoD is a PAIR, and the pair is the point (`ADR-012`): an instrument that only ever returns
"nothing found" is indistinguishable from an instrument that cannot find anything. So this file
drives the same detector twice — over synthetic violating lines (it MUST bite) and over the
real tree (it MUST stay silent) — and reports the universe it swept in both directions.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from src.modules.sentimento.domain.secret_leak_scan import (
    SecretScanError,
    coinalyze_key_from,
    find_exact_value,
    find_leaks,
    scan_files,
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]

# Binary and vendored paths carry no hand-written credential and would only make the sweep
# slow and noisy. Everything else `git ls-files` reports is read.
_SKIPPED_SUFFIXES = frozenset({".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".pdf"})

# ── THE ONE STRUCTURAL EXCLUSION, AND IT IS NOT A BYPASS ───────────────────────────────────
#
# `corpus/cases/<rule>/violating/` is the rule engine's fixture set: every file under it EXISTS
# to be a violation, and `harness` reads them to prove its own rules still bite. Flagging them
# would make this test permanently red over files whose redness is the point.
#
# The exclusion is keyed on the CORPUS CONTRACT (a path shape the harness defines), never on a
# filename someone found inconvenient — and it is not silent: `test_the_sweep_still_bites_
# inside_the_corpus` asserts those files ARE flagged when handed to the detector directly. So
# the exclusion narrows the SWEEP and never the DETECTOR, which is the distinction that keeps
# an allowlist from being indistinguishable from a switch-off (`ADR-012`).
_CORPUS_VIOLATING_PREFIX = "corpus/cases/"
_CORPUS_VIOLATING_SEGMENT = "/violating/"


def _is_corpus_violating_fixture(relative_path: str) -> bool:
    """Return whether a path is a rule-corpus fixture whose purpose is to be a violation."""
    return relative_path.startswith(_CORPUS_VIOLATING_PREFIX) and (
        _CORPUS_VIOLATING_SEGMENT in relative_path
    )


def _versioned_files() -> list[Path]:
    """Return every file `git` tracks — the honest definition of "versioned"."""
    completed = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=REPOSITORY_ROOT,
        capture_output=True,
        check=True,
    )
    return [
        REPOSITORY_ROOT / name
        for name in completed.stdout.decode("utf-8").split("\0")
        if name and Path(name).suffix.lower() not in _SKIPPED_SUFFIXES
    ]


def _readable_versioned_files(include_corpus: bool = False) -> list[tuple[str, str]]:
    """Pair each versioned file with its text, skipping the ones that are not text."""
    pairs: list[tuple[str, str]] = []
    for path in _versioned_files():
        relative = str(path.relative_to(REPOSITORY_ROOT))
        if not include_corpus and _is_corpus_violating_fixture(relative):
            continue
        try:
            pairs.append((relative, path.read_text("utf-8")))
        except (UnicodeDecodeError, OSError):
            continue
    return pairs


# ── THE BITING HALF ────────────────────────────────────────────────────────────────────────


def test_it_bites_a_uuid_pasted_next_to_the_word_coinalyze() -> None:
    """The realistic leak: the key pasted where a note says what it is."""
    leaks = find_leaks(
        "docs/medicao-coinalyze.md",
        "rodei com a chave da Coinalyze 3f2504e0-4f89-11d3-9a0c-0305e82c3301 e deu 200",
    )
    assert [leak.rule for leak in leaks] == ["uuid-shaped-literal-on-a-credential-line"]
    assert leaks[0].line_number == 1


def test_it_bites_the_variable_assigned_a_literal_value() -> None:
    """`COINALYZE_API_KEY=<something real>` in any versioned file is a leak."""
    leaks = find_leaks(".env.example", "COINALYZE_API_KEY=3f2504e04f8911d39a0c0305e82c3301")
    assert {leak.rule for leak in leaks} == {"coinalyze-api-key-assigned-a-literal"}


def test_it_bites_a_literal_inside_a_compose_style_quoted_value() -> None:
    """Quoting the value does not make it indirection."""
    leaks = find_leaks("deploy/compose.yml", '      COINALYZE_API_KEY: "abcdef123456789"')
    assert [leak.rule for leak in leaks] == ["coinalyze-api-key-assigned-a-literal"]


def test_the_report_never_repeats_the_value_it_found() -> None:
    """A report that quoted the value would be another copy of the leak.

    The literal below is a FABRICATED UUID (`RFC 4122`'s own example namespace), never a key.
    The variable is not called `secret` on purpose: `ruff` `S105` flags that name bound to a
    literal, and the honest fix is to stop claiming it is a secret — not a `noqa`, which is
    what teaches the next reader to switch the check off.
    """
    fabricated = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
    leaks = find_leaks("docs/nota.md", f"coinalyze key {fabricated}")
    assert leaks
    for leak in leaks:
        assert fabricated not in leak.evidence
        assert fabricated not in repr(leak)


def test_the_exact_half_bites_a_key_of_a_shape_the_regex_would_miss() -> None:
    """Shape alone is not enough, which is exactly why the exact half exists."""
    odd_shaped = "NOT-A-UUID-BUT-STILL-THE-REAL-KEY-0000"
    assert find_leaks("docs/nota.md", f"a chave e {odd_shaped}") == []
    leaks = find_exact_value("docs/nota.md", f"a chave e {odd_shaped}", odd_shaped)
    assert [leak.rule for leak in leaks] == ["live-key-verbatim"]


# ── THE REFUSALS ───────────────────────────────────────────────────────────────────────────


def test_it_refuses_to_hunt_for_a_needle_too_short_to_mean_anything() -> None:
    """A short needle matches everywhere; an instrument that cries wolf gets switched off."""
    with pytest.raises(SecretScanError, match="shorter than 16"):
        find_exact_value("docs/nota.md", "qualquer texto", "abc")


def test_a_missing_key_reads_as_absent_and_never_as_an_empty_default() -> None:
    """`coinalyze_key_from` has NO default, so a caller can tell the strong half never ran."""
    assert coinalyze_key_from({}) is None
    assert coinalyze_key_from({"COINALYZE_API_KEY": "   "}) is None
    assert coinalyze_key_from({"COINALYZE_API_KEY": " abc "}) == "abc"


# ── THE STAYING-SILENT HALF, OVER THE REAL TREE ────────────────────────────────────────────


def test_a_declared_placeholder_value_is_not_a_credential() -> None:
    """`.env.example` may carry a stand-in that SAYS it is one, and that must not bite.

    The allowlist here is keyed on the VALUE, never on the FILE: every member is a word that
    announces "no key here". A real key matches none of them, because a real key is a UUID —
    which is what keeps this from being a per-file bypass.
    """
    assert find_leaks(".env.example", "COINALYZE_API_KEY=changeme-dev-only") == []
    assert find_leaks(".env.example", "COINALYZE_API_KEY=your-key-here") == []
    assert find_leaks("docs/exemplo.md", "COINALYZE_API_KEY=PLACEHOLDER") == []
    # And the negative that proves the allowlist is narrow: a value that merely LOOKS harmless
    # but announces nothing is still flagged.
    assert [leak.rule for leak in find_leaks(".env.example", "COINALYZE_API_KEY=a1b2c3d4e5f6")] == [
        "coinalyze-api-key-assigned-a-literal"
    ]


def test_the_indirection_forms_are_not_flagged() -> None:
    """`${VAR}`, `$VAR` and an EMPTY value are the CORRECT forms and must not bite."""
    assert find_leaks("deploy/compose.yml", "      COINALYZE_API_KEY: ${COINALYZE_API_KEY}") == []
    assert find_leaks("scripts/run.sh", 'curl -H "api_key: $COINALYZE_API_KEY" ...') == []
    assert find_leaks(".env.example", "COINALYZE_API_KEY=") == []


def test_the_sweep_still_bites_inside_the_corpus_it_excludes() -> None:
    """The exclusion narrows the SWEEP, never the DETECTOR — and here is the proof.

    `own.compose-hardcoded-secret`'s own violating fixture is an INDEPENDENT cross-check: a
    detector written here, from `RNF-4`, flags exactly what the repository's own rule was
    written to flag. If this ever stops biting, the exclusion above turned into a blind spot.
    """
    corpus = [
        pair
        for pair in _readable_versioned_files(include_corpus=True)
        if _is_corpus_violating_fixture(pair[0])
    ]
    assert corpus, "the rule corpus is empty: the cross-check below proves nothing"
    flagged = scan_files(corpus)
    assert any(leak.path.endswith("03_api_key_in_test_path.yml") for leak in flagged), (
        f"the corpus fixture for a hardcoded api key was NOT flagged; found {flagged}"
    )


def test_no_coinalyze_key_is_present_anywhere_in_the_versioned_tree() -> None:
    """The CALA half, and it reports the universe it swept rather than just passing."""
    pairs = _readable_versioned_files()
    assert len(pairs) > 100, f"swept only {len(pairs)} files; the sweep is not reaching the tree"
    leaks = scan_files(pairs)
    assert leaks == [], f"credencial versionada em: {[(k.path, k.line_number) for k in leaks]}"


def test_the_live_key_from_the_environment_is_in_no_versioned_file() -> None:
    """The strongest half — it needs the real key, so it runs where the key lives.

    SKIPPED rather than silently passing when `.env` carries no key: a skip says "this half did
    not run", while a pass would claim a guarantee the run never checked.
    """
    dotenv = REPOSITORY_ROOT / ".env"
    if not dotenv.exists():
        pytest.skip("no .env in this tree: the exact-value half cannot run here")
    environment: dict[str, str] = {}
    for line in dotenv.read_text("utf-8").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            name, value = line.split("=", 1)
            environment[name.strip()] = value.strip().strip('"').strip("'")
    secret = coinalyze_key_from(environment)
    if secret is None:
        pytest.skip("COINALYZE_API_KEY is not set: the exact-value half cannot run here")
    pairs = _readable_versioned_files()
    leaks = scan_files(pairs, secret=secret)
    assert leaks == [], f"credencial VIVA versionada em: {[(k.path, k.line_number) for k in leaks]}"


def test_the_env_example_declares_the_name_so_an_operator_knows_the_key_exists() -> None:
    """The NAME belongs in `.env.example`; the VALUE never does (`T-05.4`, `RNF-4`)."""
    example = (REPOSITORY_ROOT / ".env.example").read_text("utf-8")
    assert "COINALYZE_API_KEY=" in example, (
        "`.env.example` does not name COINALYZE_API_KEY: an operator cannot supply a key "
        "whose existence the repository never mentions, and the collector would spend quota "
        "collecting 401s"
    )
    assert find_leaks(".env.example", example) == []
