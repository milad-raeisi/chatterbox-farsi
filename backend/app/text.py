"""Persian text clean-up and chunking for Chatterbox Farsi.

The model reads Persian script directly (no G2P), so the job here is to:
  * unify Arabic code points with their Persian forms (ي → ی, ك → ک, ...),
  * spell out numbers, which the model card says are unreliable as digits,
  * split long text into sentence-sized chunks (one model call holds ~40 s),
  * make sure every chunk ends with sentence punctuation, which the card says matters.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# --------------------------------------------------------------------------- characters

_CHAR_MAP = str.maketrans(
    {
        "ي": "ی",
        "ى": "ی",
        "ك": "ک",
        "ە": "ه",
        "ۀ": "هٔ",
        "ـ": "",  # tatweel
        "‍": "",  # zero-width joiner
        "​": "",  # zero-width space
        "﻿": "",
        "?": "؟",
        ";": "؛",
        "“": "«",
        "”": "»",
    }
)
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
# Emoji and pictographs carry no speech and confuse the tokenizer.
_EMOJI_RE = re.compile("[\U0001f000-\U0001faff☀-➿️]")
_SPACES_RE = re.compile(r"[ \t   ]+")
_ZWNJ_RE = re.compile(r"[ \t]*‌[ \t]*")

SENTENCE_END = ".!؟…"

# ----------------------------------------------------------------------------- numbers

_ONES = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"]
_TEENS = ["ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده"]
_TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"]
_HUNDREDS = ["", "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"]
_SCALES = ["", "هزار", "میلیون", "میلیارد", "تریلیون"]
_DIGIT_NAMES = ["صفر", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"]


def _three_digits(n: int) -> str:
    parts: list[str] = []
    hundreds, rest = divmod(n, 100)
    if hundreds:
        parts.append(_HUNDREDS[hundreds])
    if 10 <= rest < 20:
        parts.append(_TEENS[rest - 10])
    else:
        tens, ones = divmod(rest, 10)
        if tens:
            parts.append(_TENS[tens])
        if ones:
            parts.append(_ONES[ones])
    return " و ".join(parts)


def _digit_by_digit(digits: str) -> str:
    return " ".join(_DIGIT_NAMES[int(d)] for d in digits)


def number_to_words(n: int) -> str:
    """Spell out a non-negative integer in Persian (e.g. 1402 → «هزار و چهارصد و دو»)."""
    if n == 0:
        return "صفر"
    if n >= 1000 ** len(_SCALES):
        return _digit_by_digit(str(n))
    groups: list[str] = []
    scale = 0
    while n:
        n, group = divmod(n, 1000)
        if group:
            words = _three_digits(group)
            if scale:
                # «هزار», not «یک هزار»; larger scales keep «یک» («یک میلیون»).
                words = _SCALES[scale] if (group == 1 and scale == 1) else f"{words} {_SCALES[scale]}"
            groups.append(words)
        scale += 1
    return " و ".join(reversed(groups))


_NUMBER_RE = re.compile(r"(?<![\w.])(\d{1,3}(?:[,٬]\d{3})+|\d+)(?:[.٫](\d+))?(\s*[%٪])?")


def _spell_number(match: re.Match[str]) -> str:
    integer, fraction, percent = match.group(1), match.group(2), match.group(3)
    digits = integer.replace(",", "").replace("٬", "")
    if (len(digits) > 1 and digits.startswith("0")) or len(digits) > 15:
        # Phone numbers, codes, IDs: read digit by digit.
        spoken = _digit_by_digit(digits)
    else:
        spoken = number_to_words(int(digits))
    if fraction:
        frac = _digit_by_digit(fraction) if fraction.startswith("0") else number_to_words(int(fraction))
        spoken += " ممیز " + frac
    if percent:
        spoken += " درصد"
    return f" {spoken} "


# ------------------------------------------------------------------------- normalization


def normalize(text: str, *, spell_numbers: bool = True) -> str:
    text = text.translate(_CHAR_MAP)
    text = _EMOJI_RE.sub("", text)
    text = text.translate(_DIGITS)
    if spell_numbers:
        text = _NUMBER_RE.sub(_spell_number, text)
    text = text.replace("...", "…")
    text = _ZWNJ_RE.sub("‌", text)
    lines = [_SPACES_RE.sub(" ", line).strip() for line in text.splitlines()]
    # Collapse runs of blank lines into a single paragraph break.
    out: list[str] = []
    for line in lines:
        if line or (out and out[-1]):
            out.append(line)
    text = "\n".join(out).strip()
    # Tidy spaces around punctuation: «سلام ، دنیا» → «سلام، دنیا».
    text = re.sub(r"[ ]+([،؛:.!؟…»)])", r"\1", text)
    text = re.sub(r"([«(])[ ]+", r"\1", text)
    return text


# ------------------------------------------------------------------------------ chunking


@dataclass(frozen=True)
class Chunk:
    text: str
    paragraph_end: bool  # a longer pause follows this chunk


_SENTENCE_RE = re.compile(rf"[^{SENTENCE_END}]+[{SENTENCE_END}]*[»)]?|[{SENTENCE_END}]+")
_CLAUSE_RE = re.compile(r"[^،,؛:]+[،,؛:]?")


def _ensure_terminal(text: str) -> str:
    text = text.strip().rstrip("،,؛: ")
    if not text:
        return text
    stripped = text.rstrip("»)")
    if stripped and stripped[-1] not in SENTENCE_END:
        text += "."
    return text


def _split_long(sentence: str, limit: int) -> list[str]:
    """Break an over-long sentence at clause punctuation, then at word boundaries."""
    if len(sentence) <= limit:
        return [sentence]
    pieces: list[str] = []
    current = ""
    for clause in (m.group(0).strip() for m in _CLAUSE_RE.finditer(sentence)):
        if not clause:
            continue
        tokens = [clause] if len(clause) <= limit else clause.split()
        for token in tokens:
            if current and len(current) + 1 + len(token) > limit:
                pieces.append(current)
                current = token
            else:
                current = f"{current} {token}".strip()
    if current:
        pieces.append(current)
    return pieces


def chunk_text(text: str, max_chars: int = 180, min_chars: int = 15) -> list[Chunk]:
    """One sentence per chunk, as the model card recommends for quality. Only fragments shorter
    than ``min_chars`` (e.g. «سلام!») are merged with a neighbour, because very short inputs make
    the model stop early or add stray sounds. The threshold stays low on purpose: merging a
    question with the next sentence carried its rising intonation over (heard in testing).
    Sentences longer than ``max_chars`` are split at clause punctuation."""
    chunks: list[Chunk] = []
    for paragraph in (p.strip() for p in text.split("\n")):
        if not paragraph:
            continue
        sentences = [m.group(0).strip() for m in _SENTENCE_RE.finditer(paragraph)]
        units: list[str] = []
        for sentence in sentences:
            if sentence.strip(SENTENCE_END + " »)"):
                units.extend(_split_long(sentence, max_chars))
            elif units:  # stray punctuation: glue it to the previous sentence
                units[-1] += sentence
        para_chunks: list[str] = []
        current = ""
        for unit in units:
            if not current:
                current = unit
            elif len(current) < min_chars and len(current) + 1 + len(unit) <= max_chars:
                current = f"{current} {unit}"
            else:
                para_chunks.append(current)
                current = unit
        if current:
            if para_chunks and len(current) < min_chars and len(para_chunks[-1]) + 1 + len(current) <= max_chars:
                para_chunks[-1] = f"{para_chunks[-1]} {current}"
            else:
                para_chunks.append(current)
        para_chunks = [p for p in (_ensure_terminal(p) for p in para_chunks) if p]
        for i, piece in enumerate(para_chunks):
            chunks.append(Chunk(piece, paragraph_end=i == len(para_chunks) - 1))
    if chunks:
        chunks[-1] = Chunk(chunks[-1].text, paragraph_end=False)
    return chunks


def estimate_seconds(text: str) -> float:
    """Rough speaking time for Persian at a natural pace (~13 characters per second)."""
    letters = sum(1 for ch in text if not ch.isspace())
    return round(letters / 13.0, 1)
