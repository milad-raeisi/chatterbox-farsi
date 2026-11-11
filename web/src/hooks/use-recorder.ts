"use client";

import * as React from "react";
import { useMotionValue } from "motion/react";

type RecorderState = "idle" | "recording";

/**
 * Microphone recorder with a live input level (as a MotionValue, so the meter animates
 * without re-rendering) and an automatic stop at `maxSeconds`.
 */
export function useRecorder(maxSeconds = 15) {
  const [state, setState] = React.useState<RecorderState>("idle");
  const [elapsed, setElapsed] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const level = useMotionValue(0);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const cleanupRef = React.useRef<(() => void) | null>(null);

  const stop = React.useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") recorder.stop();
  }, []);

  const start = React.useCallback(async (): Promise<Blob | null> => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("مرورگر شما ضبط صدا را پشتیبانی نمی‌کند.");
      return null;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError("دسترسی به میکروفون داده نشد. اجازهٔ میکروفون را در مرورگر فعال کنید.");
      return null;
    }

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    const startedAt = performance.now();
    let frame = 0;
    let shownTenth = -1;

    const loop = () => {
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
      level.set(Math.min(1, Math.sqrt(sum / buffer.length) * 5));
      const seconds = (performance.now() - startedAt) / 1000;
      const tenth = Math.floor(seconds * 10);
      if (tenth !== shownTenth) {
        shownTenth = tenth;
        setElapsed(seconds);
      }
      if (seconds >= maxSeconds) recorder.stop();
      else frame = requestAnimationFrame(loop);
    };

    const cleanup = () => {
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((track) => track.stop());
      void ctx.close();
      level.set(0);
      cleanupRef.current = null;
    };
    cleanupRef.current = cleanup;

    return new Promise<Blob | null>((resolve) => {
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        cleanup();
        recorderRef.current = null;
        setState("idle");
        resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : null);
      };
      recorder.start(250);
      setElapsed(0);
      setState("recording");
      frame = requestAnimationFrame(loop);
    });
  }, [level, maxSeconds]);

  React.useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state === "recording") {
        recorder.onstop = null;
        recorder.stop();
      }
      cleanupRef.current?.();
    },
    [],
  );

  return { state, elapsed, error, level, start, stop };
}
