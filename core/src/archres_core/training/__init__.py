"""Training data pipeline (W1.5) - scripted, verified, reproducible.

Public surface:

- ``generators.build_chat_dataset`` - build + verify the deterministic chat dataset.
- ``generators.sample_records`` - the committed review slice.
- ``records.write_jsonl`` / ``load_jsonl`` - canonical JSONL.
- ``verify.verify_record`` - the deterministic gate (schema, labels, language, numbers,
  citations, register).
- ``teacher.build_teacher_records`` - paraphrases as candidates (never auto-verified).

See ``docs/spec/training-data-v0.md`` and ADR-0009.
"""

from __future__ import annotations

from .generators import (
    GENERATOR_VERSION,
    Dataset,
    GeneratorError,
    Question,
    build_chat_dataset,
    counts_of,
    load_flow_book,
    sample_records,
)
from .records import (
    SCHEMA_VERSION,
    RecordError,
    dumps_record,
    load_jsonl,
    make_id,
    record_sort_key,
    sha256_file,
    sha256_text,
    validate_record,
    write_jsonl,
)
from .split import SPLITTER_VERSION, SftSplit, SplitError, source_question_id, split_sft_records
from .teacher import (
    TEACHER_PROMPT_VERSION,
    ChatCompletionClient,
    TeacherError,
    build_teacher_records,
)
from .verify import VerifyContext, numbers_in, verify_record

__all__ = [
    "GENERATOR_VERSION",
    "SCHEMA_VERSION",
    "SPLITTER_VERSION",
    "TEACHER_PROMPT_VERSION",
    "ChatCompletionClient",
    "Dataset",
    "GeneratorError",
    "Question",
    "RecordError",
    "SftSplit",
    "SplitError",
    "TeacherError",
    "VerifyContext",
    "build_chat_dataset",
    "build_teacher_records",
    "counts_of",
    "dumps_record",
    "load_flow_book",
    "load_jsonl",
    "make_id",
    "numbers_in",
    "record_sort_key",
    "sample_records",
    "sha256_file",
    "sha256_text",
    "source_question_id",
    "split_sft_records",
    "validate_record",
    "verify_record",
    "write_jsonl",
]
