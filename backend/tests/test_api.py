import io
import json
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from app import main
from app.config import BUILTIN_VOICES

SR = 24_000


def _wav_bytes(seconds: float, sr: int = 16_000) -> bytes:
    t = np.arange(int(seconds * sr)) / sr
    buf = io.BytesIO()
    sf.write(buf, 0.3 * np.sin(2 * np.pi * 220 * t).astype(np.float32), sr, format="WAV")
    return buf.getvalue()


@pytest.fixture()
def client(monkeypatch):
    # A built-in voice file so /api/voices has something to resolve.
    female = main.settings.model_dir / BUILTIN_VOICES["female"]["file"]
    female.parent.mkdir(parents=True, exist_ok=True)
    female.write_bytes(_wav_bytes(5))

    calls: list[str] = []

    def fake_generate(text, voice, params, seed=None):
        calls.append(text)
        return np.full(int(SR * 0.5), 0.1, dtype=np.float32)

    monkeypatch.setattr(main.engine, "status", "ready")
    monkeypatch.setattr(main.engine, "model", object())
    monkeypatch.setattr(main.engine, "generate_chunk", fake_generate)
    with TestClient(main.app) as c:
        c.calls = calls
        yield c


def _events(response) -> list[dict]:
    return [json.loads(line) for line in response.text.splitlines() if line.strip()]


def test_health_reports_offline(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ready"
    assert body["offline"] is True


def test_tts_streams_progress_and_writes_wav(client):
    text = "سلام! امروز ۲ بار به پارک رفتیم.\nبند دوم."
    res = client.post("/api/tts", json={"text": text, "voice_id": "female", "pause_ms": 100})
    assert res.status_code == 200
    events = _events(res)
    assert [e["type"] for e in events] == ["start", "progress", "progress", "done"]
    assert "دو بار" in client.calls[0]  # numbers were spelled out before synthesis
    done = events[-1]
    # two 0.5 s chunks + one paragraph pause (2 × 100 ms)
    assert done["duration"] == pytest.approx(1.2, abs=0.01)
    wav = client.get(done["url"])
    assert wav.status_code == 200
    audio, sr = sf.read(io.BytesIO(wav.content))
    assert sr == SR and len(audio) == int(SR * 1.2)

    history = client.get("/api/history").json()
    assert history[0]["id"] == done["id"]
    assert client.delete(f"/api/history/{done['id']}").status_code == 204
    assert client.get(done["url"]).status_code == 404


def test_tts_rejects_unknown_voice_and_unready_model(client, monkeypatch):
    assert client.post("/api/tts", json={"text": "سلام", "voice_id": "nope"}).status_code == 404
    monkeypatch.setattr(main.engine, "status", "missing_models")
    assert client.post("/api/tts", json={"text": "سلام"}).status_code == 503


def test_tts_validates_parameters(client):
    assert client.post("/api/tts", json={"text": "سلام", "cfg_weight": 3}).status_code == 422
    assert client.post("/api/tts", json={"text": ""}).status_code == 422


def test_custom_voice_lifecycle(client):
    files = {"file": ("me.wav", _wav_bytes(6), "audio/wav")}
    assert client.post("/api/voices", files=files, data={"name": "من"}).status_code == 400  # no consent
    res = client.post("/api/voices", files=files, data={"name": "صدای من", "consent": "true"})
    assert res.status_code == 201
    voice = res.json()
    assert voice["kind"] == "custom" and voice["name"] == "صدای من"
    assert any(v["id"] == voice["id"] for v in client.get("/api/voices").json())
    assert client.get(f"/api/voices/{voice['id']}/audio").status_code == 200

    res = client.post("/api/tts", json={"text": "آزمایش.", "voice_id": voice["id"]})
    assert _events(res)[-1]["voice_name"] == "صدای من"

    assert client.delete(f"/api/voices/{voice['id']}").status_code == 204
    assert client.delete(f"/api/voices/{voice['id']}").status_code == 404


def test_custom_voice_rejects_short_or_invalid_audio(client):
    short = {"file": ("s.wav", _wav_bytes(1), "audio/wav")}
    assert client.post("/api/voices", files=short, data={"consent": "true"}).status_code == 400
    junk = {"file": ("j.wav", b"not audio", "audio/wav")}
    assert client.post("/api/voices", files=junk, data={"consent": "true"}).status_code == 400


def test_paths_cannot_escape_data_dirs(client):
    assert client.get("/api/outputs/..%2F..%2Fsecret.wav").status_code == 404
    assert client.delete("/api/voices/female").status_code == 404  # built-ins can't be deleted
    assert client.delete("/api/history/../x").status_code in (404, 405)


def test_analyze_previews_chunks(client):
    body = client.post("/api/text/analyze", json={"text": "سال ۱۴۰۳. سلام"}).json()
    assert body["chunks"] == ["سال هزار و چهارصد و سه. سلام."]
    assert body["estimated_seconds"] > 0


def test_builtin_voice_paths_are_inside_model_dir():
    for meta in BUILTIN_VOICES.values():
        assert not Path(meta["file"]).is_absolute()
