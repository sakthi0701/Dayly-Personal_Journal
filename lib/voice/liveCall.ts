/**
 * lib/voice/liveCall.ts — browser only
 *
 * Audio engine for a Jarvis check-in call over the Gemini Live API.
 *   mic → AudioWorklet (downsample to 16 kHz PCM16) → session.sendRealtimeInput
 *   session audio (24 kHz PCM16) → gap-free scheduled AudioBufferSources → speaker
 * Barge-in: Gemini's server-side VAD sends `interrupted`; we drop queued audio instantly.
 * Subtitles come from the session's input/output transcription streams.
 */

import type { LiveServerMessage, Session } from '@google/genai';
import { END_CALL_TOOL, LIVE_API_VERSION, LIVE_MODEL, MAX_CALL_MS } from './constants';

export type CallStatus = 'connecting' | 'live' | 'ended' | 'error';

export interface TranscriptLine {
  id: number;
  role: 'user' | 'Jarvis' | 'action';
  text: string;
  /** false while the line is still being spoken / the tool is still running */
  final: boolean;
  interrupted?: boolean;
  ok?: boolean;
}

export interface CallCallbacks {
  onStatus: (status: CallStatus, detail?: string) => void;
  onTranscript: (lines: TranscriptLine[]) => void;
  /** Jarvis is running a tool (e.g. "Updating your tasks…") */
  onBusy?: (busy: boolean) => void;
}

const IN_RATE = 16000;
const OUT_RATE = 24000;

// Runs on the audio thread. Box-filter downsample to 16 kHz, emit 100 ms PCM16 chunks + mic RMS.
const CAPTURE_WORKLET = `
class SenseiCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${IN_RATE};
    this.phase = 0; this.acc = 0; this.accN = 0;
    this.energy = 0; this.energyN = 0;
    this.out = new Int16Array(${IN_RATE / 10}); this.outN = 0;
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      const s = input[i];
      this.acc += s; this.accN++;
      this.energy += s * s; this.energyN++;
      this.phase += 1;
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.acc / this.accN));
        this.acc = 0; this.accN = 0;
        this.out[this.outN++] = v * 0x7fff;
        if (this.outN === this.out.length) {
          const rms = Math.sqrt(this.energy / Math.max(1, this.energyN));
          this.energy = 0; this.energyN = 0;
          this.port.postMessage({ pcm: this.out.buffer, rms }, [this.out.buffer]);
          this.out = new Int16Array(${IN_RATE / 10}); this.outN = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('Jarvis-capture', SenseiCapture);
`;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function pcm16ToFloat(b64: string): Float32Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 0x8000;
  return out;
}

export class SenseiLiveCall {
  private cb: CallCallbacks;
  private session: Session | null = null;
  private stream: MediaStream | null = null;
  private inCtx: AudioContext | null = null;
  private outCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelBuf: Uint8Array<ArrayBuffer> | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private nextPlayAt = 0;
  private micLevel = 0;
  private muted = false;
  private ended = false;
  private hangupPending = false;
  private hangupTimer: ReturnType<typeof setTimeout> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;

  private lines: TranscriptLine[] = [];
  private nextId = 1;
  private openUser: TranscriptLine | null = null;
  private openSensei: TranscriptLine | null = null;

  constructor(cb: CallCallbacks) {
    this.cb = cb;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.cb.onStatus('connecting');
    try {
      // Ask for the mic first: if it's denied there's no point minting a token
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      // Every await below re-checks `ended`: the user may hang up mid-connect, and anything
      // created after finish() ran must still be released (otherwise the mic stays on).
      if (this.ended) return this.release();

      // Output context at Gemini's native 24 kHz so chunks play without resampling
      this.outCtx = new AudioContext({ sampleRate: OUT_RATE });
      this.analyser = this.outCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.levelBuf = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
      this.analyser.connect(this.outCtx.destination);

      const res = await fetch('/api/voice/token', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (this.ended) return this.release();
      if (!res.ok || !data.token) throw new Error(data.error || 'Could not reach Jarvis');

      // Loaded lazily so the SDK never weighs on normal page loads
      const { GoogleGenAI, Modality } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: data.token, httpOptions: { apiVersion: LIVE_API_VERSION } });

      this.session = await ai.live.connect({
        model: LIVE_MODEL,
        // Everything else (persona, voice, tools, transcription) is locked server-side in the token
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onmessage: (m) => this.handleMessage(m),
          onerror: (e) => this.finish('error', e.message || 'Connection error'),
          onclose: (e) => {
            if (this.ended) return;
            const clean = e.code === 1000 || this.hangupPending;
            this.finish(clean ? 'ended' : 'error', clean ? undefined : e.reason || 'Call dropped');
          },
        },
      });
      if (this.ended) return this.release();

      await this.startMic();
      if (this.ended) return this.release();
      this.cb.onStatus('live');
      this.maxTimer = setTimeout(() => this.hangup(), MAX_CALL_MS);

      // Jarvis placed the call, so Jarvis speaks first
      this.session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: '[I just picked up your call.]' }] }],
        turnComplete: true,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      this.finish('error', denied ? 'Microphone permission is needed for calls' : msg);
    }
  }

  /** User pressed the end button. */
  hangup(): void {
    this.finish('ended');
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /** 0..1 levels for the HUD animation. Cheap; call from requestAnimationFrame. */
  getLevels(): { mic: number; speaker: number } {
    let speaker = 0;
    if (this.analyser && this.levelBuf) {
      this.analyser.getByteTimeDomainData(this.levelBuf);
      let sum = 0;
      for (let i = 0; i < this.levelBuf.length; i++) {
        const v = (this.levelBuf[i] - 128) / 128;
        sum += v * v;
      }
      speaker = Math.sqrt(sum / this.levelBuf.length);
    }
    return { mic: this.muted ? 0 : Math.min(1, this.micLevel * 4), speaker: Math.min(1, speaker * 4) };
  }

  getTranscript(): TranscriptLine[] {
    return this.lines.map((l) => ({ ...l }));
  }

  private finish(status: 'ended' | 'error', detail?: string): void {
    if (this.ended) return;
    this.ended = true;
    if (this.hangupTimer) clearTimeout(this.hangupTimer);
    if (this.maxTimer) clearTimeout(this.maxTimer);
    this.release();
    this.cb.onBusy?.(false);
    this.cb.onStatus(status, detail);
  }

  /** Free the mic, audio contexts and socket. Safe to call repeatedly. */
  private release(): void {
    try { this.session?.close(); } catch { /* already closed */ }
    this.session = null;
    this.stopPlayback();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.inCtx && this.inCtx.state !== 'closed') this.inCtx.close().catch(() => {});
    if (this.outCtx && this.outCtx.state !== 'closed') this.outCtx.close().catch(() => {});
  }

  // ── Mic ──────────────────────────────────────────────────────────────────────

  private async startMic(): Promise<void> {
    if (!this.stream) return;
    // Device-native rate; the worklet does the 16 kHz downsampling (more portable than
    // asking Chrome/WebView to resample a MediaStream into a 16 kHz context)
    this.inCtx = new AudioContext();
    const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: 'application/javascript' }));
    try {
      await this.inCtx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const src = this.inCtx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(this.inCtx, 'Jarvis-capture');
    node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
      this.micLevel = e.data.rms;
      if (this.muted || this.ended || !this.session) return;
      this.session.sendRealtimeInput({ audio: { data: toBase64(e.data.pcm), mimeType: `audio/pcm;rate=${IN_RATE}` } });
    };
    src.connect(node);
    // Not connected to destination: we never want to hear our own mic
  }

  // ── Server messages ──────────────────────────────────────────────────────────

  private handleMessage(m: LiveServerMessage): void {
    const sc = m.serverContent;
    if (sc) {
      if (sc.interrupted) {
        // User talked over Jarvis — silence it now and mark the cut-off line
        this.stopPlayback();
        if (this.openSensei) {
          this.openSensei.interrupted = true;
          this.openSensei.final = true;
          this.openSensei = null;
        }
      }
      for (const part of sc.modelTurn?.parts ?? []) {
        if (part.inlineData?.data) this.playChunk(part.inlineData.data);
      }
      if (sc.inputTranscription?.text) this.appendText('user', sc.inputTranscription.text);
      if (sc.outputTranscription?.text) this.appendText('Jarvis', sc.outputTranscription.text);
      if (sc.turnComplete) {
        this.closeLine('user');
        this.closeLine('Jarvis');
        if (this.hangupPending) this.hangupWhenQuiet();
      }
      this.emit();
    }

    if (m.toolCall?.functionCalls?.length) {
      void this.runTools(m.toolCall.functionCalls);
    }

    if (m.goAway) {
      // Server is about to close the socket (session limit) — end gracefully rather than drop
      this.hangupPending = true;
      this.hangupWhenQuiet();
    }
  }

  private async runTools(calls: NonNullable<LiveServerMessage['toolCall']>['functionCalls'] = []): Promise<void> {
    const responses = [];
    for (const call of calls) {
      if (call.name === END_CALL_TOOL) {
        this.hangupPending = true;
        responses.push({ id: call.id, name: call.name, response: { result: 'Call will end after your goodbye.' } });
        continue;
      }

      const line = this.pushLine('action', 'Updating…', false);
      this.cb.onBusy?.(true);
      this.emit();
      let summary = 'Something went wrong while updating.';
      let ok = false;
      try {
        const res = await fetch('/api/voice/tool', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: call.id, name: call.name, args: call.args ?? {} }),
        });
        const data = await res.json();
        summary = data.summary || data.error || summary;
        ok = res.ok && data.success !== false;
      } catch (err) {
        summary = `Update failed: ${err instanceof Error ? err.message : String(err)}`;
      }
      line.text = summary;
      line.ok = ok;
      line.final = true;
      this.cb.onBusy?.(false);
      this.emit();
      responses.push({ id: call.id, name: call.name, response: ok ? { result: summary } : { error: summary } });
    }

    if (!this.ended && this.session && responses.length) {
      this.session.sendToolResponse({ functionResponses: responses });
    }
    if (this.hangupPending) this.hangupWhenQuiet();
  }

  /** Let the goodbye finish playing, then hang up (with a safety cap). */
  private hangupWhenQuiet(): void {
    if (this.ended) return;
    if (this.sources.size === 0 && this.openSensei === null) {
      this.hangupTimer = setTimeout(() => this.finish('ended'), 600);
    } else if (!this.hangupTimer) {
      this.hangupTimer = setTimeout(() => this.finish('ended'), 8000);
    }
  }

  // ── Playback ─────────────────────────────────────────────────────────────────

  private playChunk(b64: string): void {
    if (!this.outCtx || !this.analyser || this.ended) return;
    const samples = pcm16ToFloat(b64);
    if (!samples.length) return;
    const buffer = this.outCtx.createBuffer(1, samples.length, OUT_RATE);
    buffer.copyToChannel(samples, 0);
    const src = this.outCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.analyser);
    const startAt = Math.max(this.outCtx.currentTime + 0.03, this.nextPlayAt);
    src.start(startAt);
    this.nextPlayAt = startAt + buffer.duration;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      if (this.sources.size === 0 && this.hangupPending) {
        if (this.hangupTimer) clearTimeout(this.hangupTimer);
        this.hangupTimer = null;
        this.hangupWhenQuiet();
      }
    };
  }

  private stopPlayback(): void {
    for (const s of this.sources) {
      try { s.stop(); } catch { /* not started */ }
    }
    this.sources.clear();
    this.nextPlayAt = 0;
  }

  // ── Transcript ───────────────────────────────────────────────────────────────

  private pushLine(role: TranscriptLine['role'], text: string, final: boolean): TranscriptLine {
    const line: TranscriptLine = { id: this.nextId++, role, text, final };
    this.lines.push(line);
    return line;
  }

  /** Transcription arrives in fragments; keep appending to the role's open line. */
  private appendText(role: 'user' | 'Jarvis', text: string): void {
    const open = role === 'user' ? this.openUser : this.openSensei;
    if (open) {
      open.text += text;
      return;
    }
    const line = this.pushLine(role, text.trimStart(), false);
    if (role === 'user') this.openUser = line;
    else this.openSensei = line;
  }

  private closeLine(role: 'user' | 'Jarvis'): void {
    const open = role === 'user' ? this.openUser : this.openSensei;
    if (!open) return;
    open.text = open.text.trim();
    open.final = true;
    if (role === 'user') this.openUser = null;
    else this.openSensei = null;
  }

  private emit(): void {
    this.cb.onTranscript(this.getTranscript());
  }
}
