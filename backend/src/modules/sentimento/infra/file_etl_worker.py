"""File-backed ETL worker: it publishes by atomic rename, so reprocessing is harmless."""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from pathlib import Path

logger = logging.getLogger(__name__)

OUTPUT_SUFFIX = ".out"
PARTIAL_SUFFIX = ".partial"


class FileEtlWorker:
    """Read `source_dir/<key>`, apply `transform` and publish `output_dir/<key>.out`."""

    def __init__(
        self,
        source_dir: Path,
        output_dir: Path,
        transform: Callable[[bytes], bytes],
    ) -> None:
        """Bind the source directory, the output directory and the transform to apply."""
        self._source_dir = source_dir
        self._output_dir = output_dir
        self._transform = transform

    def process(self, key: str) -> None:
        """Publish `key` idempotently — the target is a function of the key, the rename atomic."""
        payload = (self._source_dir / key).read_bytes()
        self._output_dir.mkdir(parents=True, exist_ok=True)
        destination = self._output_dir / f"{key}{OUTPUT_SUFFIX}"
        partial = destination.parent / f"{destination.name}{PARTIAL_SUFFIX}"
        with partial.open("wb") as handle:
            handle.write(self._transform(payload))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(partial, destination)
        logger.info("etl_item_publicado", extra={"etl_key": key, "destino": str(destination)})
