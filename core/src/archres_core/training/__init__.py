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
from .repair import (
    GENERATOR as REPAIR_GENERATOR,
    MUTATIONS,
    REPAIR_PROMPT_VERSION,
    REPAIR_SCHEMA_VERSION,
    REPAIR_SEED,
    Mutation,
    RepairError,
    apply_mutation,
    build_repair_record,
    mutation_by_id,
    normalize_failure,
    record_id,
    render_trace,
    verification_failure,
    verify_repair_record,
)
from .rft import (
    RFT_VERSION,
    SOURCE_KIND,
    Sample,
    build_rft_records,
    judge_answer,
    round_document,
    sample_round,
    same_value,
)
from .split import SPLITTER_VERSION, SftSplit, SplitError, source_question_id, split_sft_records
from .teacher import (
    TEACHER_PROMPT_VERSION,
    ChatCompletionClient,
    TeacherError,
    build_teacher_records,
    dedupe_teacher_records,
    train_ask_records,
)
from .verify import VerifyContext, numbers_in, verify_record

__all__ = [
    "GENERATOR_VERSION",
    "MUTATIONS",
    "REPAIR_GENERATOR",
    "REPAIR_PROMPT_VERSION",
    "REPAIR_SCHEMA_VERSION",
    "REPAIR_SEED",
    "SCHEMA_VERSION",
    "RFT_VERSION",
    "SOURCE_KIND",
    "Sample",
    "SPLITTER_VERSION",
    "TEACHER_PROMPT_VERSION",
    "ChatCompletionClient",
    "Dataset",
    "GeneratorError",
    "Mutation",
    "Question",
    "RecordError",
    "RepairError",
    "SftSplit",
    "SplitError",
    "TeacherError",
    "VerifyContext",
    "apply_mutation",
    "build_chat_dataset",
    "build_rft_records",
    "build_repair_record",
    "build_teacher_records",
    "counts_of",
    "dedupe_teacher_records",
    "dumps_record",
    "load_flow_book",
    "judge_answer",
    "load_jsonl",
    "make_id",
    "mutation_by_id",
    "normalize_failure",
    "numbers_in",
    "record_id",
    "record_sort_key",
    "render_trace",
    "round_document",
    "sample_records",
    "sample_round",
    "same_value",
    "sha256_file",
    "sha256_text",
    "source_question_id",
    "split_sft_records",
    "train_ask_records",
    "validate_record",
    "verification_failure",
    "verify_record",
    "verify_repair_record",
    "write_jsonl",
]
