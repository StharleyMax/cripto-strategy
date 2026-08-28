"""Worker de ETL sobre arquivo: publica por rename atomico, logo reprocessar e inocuo."""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from pathlib import Path

logger = logging.getLogger(__name__)

OUTPUT_SUFFIX = ".out"
PARTIAL_SUFFIX = ".partial"


class FileEtlWorker:
    """Le `source_dir/<key>`, aplica `transform` e publica `output_dir/<key>.out`."""

    def __init__(
        self,
        source_dir: Path,
        output_dir: Path,
        transform: Callable[[bytes], bytes],
    ) -> None:
        self._source_dir = source_dir
        self._output_dir = output_dir
        self._transform = transform

    def process(self, key: str) -> None:
        """Idempotente por construcao: o destino e funcao da chave e o rename e atomico."""
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
