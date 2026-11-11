import numpy as np
import pytest
import torch

from app.audio import normalize_loudness, trim_edges
from app.config import Settings
from app.engine import GenParams, TTSEngine, VoiceRef, duration_window
from app.text import chunk_text

SR = 24_000


def tone(seconds: float, amp: float = 0.3) -> np.ndarray:
    t = np.arange(int(seconds * SR)) / SR
    return (amp * np.sin(2 * np.pi * 220 * t)).astype(np.float32)


def silence(seconds: float, level: float = 0.0) -> np.ndarray:
    return np.full(int(seconds * SR), level, dtype=np.float32)


def test_trim_edges_removes_silence_and_quiet_tail_but_keeps_speech():
    audio = np.concatenate([silence(0.5), tone(1.0), tone(1.5, amp=0.001)])  # -50 dB tail
    trimmed = trim_edges(audio, SR)
    assert 1.0 <= trimmed.size / SR <= 1.0 + 2 * 0.08 + 0.02


def test_trim_edges_keeps_audio_without_silence():
    audio = tone(1.0)
    assert trim_edges(audio, SR).size == audio.size


def test_normalize_loudness_levels_quiet_and_loud_sentences():
    quiet, loud = normalize_loudness(tone(2, 0.02), SR), normalize_loudness(tone(2, 0.6), SR)
    rms = lambda a: float(np.sqrt(np.mean(a**2)))  # noqa: E731
    assert rms(quiet) == pytest.approx(rms(loud), rel=0.05)
    assert np.max(np.abs(loud)) <= 0.89 + 1e-6


def test_duration_window():
    text = "سلام! امروز هوا خیلی خوب است."
    shortest, expected, longest = duration_window(text)
    assert shortest < expected < longest
    assert expected == pytest.approx(len(text.replace(" ", "")) / 13)


def test_one_sentence_per_chunk_and_short_ones_merged():
    text = (
        "این جملهٔ اول است که به اندازهٔ کافی بلند است. "
        "این هم جملهٔ دوم است که آن هم بلند است. خوب."
    )
    assert [c.text for c in chunk_text(text)] == [
        "این جملهٔ اول است که به اندازهٔ کافی بلند است.",
        "این هم جملهٔ دوم است که آن هم بلند است. خوب.",
    ]


class FakeModel:
    """Stands in for ChatterboxMultilingualTTS: returns a queued list of takes."""

    sr = SR

    def __init__(self, takes):
        self.takes = list(takes)
        self.calls = 0
        self.conds = None

    def prepare_conditionals(self, path, exaggeration=0.5):
        self.conds = object()

    def generate(self, text, **kwargs):
        self.calls += 1
        return torch.from_numpy(self.takes.pop(0)).unsqueeze(0)


@pytest.fixture()
def engine(tmp_path):
    e = TTSEngine(Settings())
    e.status, e.sample_rate = "ready", SR
    voice = tmp_path / "v.wav"
    voice.write_bytes(b"x")
    return e, VoiceRef("v", voice)


TEXT = "سلام! امروز هوا خیلی خوب است، بیا با هم به پارک برویم."  # expects ~3.4 s


def test_generate_accepts_first_good_take(engine):
    e, voice = engine
    e.model = FakeModel([tone(3.5), tone(9)])
    out = e.generate_chunk(TEXT, voice, GenParams())
    assert e.model.calls == 1 and out.size == tone(3.5).size


def test_generate_retries_rambling_take(engine):
    e, voice = engine
    e.model = FakeModel([tone(20), tone(3.2)])  # 20 s for one sentence: rambling
    out = e.generate_chunk(TEXT, voice, GenParams())
    assert e.model.calls == 2 and out.size == tone(3.2).size


def test_generate_retries_early_stop_then_picks_closest(engine):
    e, voice = engine
    e.model = FakeModel([tone(0.3), tone(0.9), tone(25)])  # all outside the window
    out = e.generate_chunk(TEXT, voice, GenParams())
    assert e.model.calls == 3 and out.size == tone(0.9).size
