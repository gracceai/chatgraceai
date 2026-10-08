import type { AvatarVariant } from '../components/Avatar';

const SOUND_KEY = 'graceai.sound';
const MASTER_LEVEL = 0.2;
const PITCH_JITTER_CENTS = 12;

interface Graph {
  ctx: AudioContext;
  bus: GainNode;
  filter: BiquadFilterNode;
}

type Recipe = (graph: Graph) => void;
type HumSource = (ctx: AudioContext, out: AudioNode) => AudioScheduledSourceNode[];

export type SoundEvent = 'send' | 'reply' | 'thinking' | 'support';
type RecordedUrls = Record<string, Record<string, string>>;

let enabled = localStorage.getItem(SOUND_KEY) === 'on';
let graph: Graph | undefined;
let stopHum: (() => void) | undefined;
let recordedUrls: RecordedUrls = {};
let recorded: Promise<void> | undefined;
const buffers = new Map<string, AudioBuffer>();

export function soundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(on: boolean, companion: AvatarVariant) {
  enabled = on;
  localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  if (on) void loadRecorded().then(() => playReply(companion));
  else stopThinking();
}

export function setRecordedSources(urls: RecordedUrls) {
  recordedUrls = urls;
  recorded = undefined;
  if (enabled) void loadRecorded();
}

function loadRecorded(): Promise<void> {
  recorded ??= (async () => {
    buffers.clear();
    const decoder = new OfflineAudioContext(1, 1, 44100);
    const files = Object.entries(recordedUrls).flatMap(([companion, events]) =>
      Object.entries(events).map(([event, url]) => ({ key: `${companion}/${event}`, url })),
    );
    await Promise.allSettled(
      files.map(async ({ key, url }) => {
        const response = await fetch(url);
        buffers.set(key, await decoder.decodeAudioData(await response.arrayBuffer()));
      }),
    );
  })();
  return recorded;
}

function isLateNight(): boolean {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 6;
}

function output(): Graph {
  if (!graph) {
    const ctx = new AudioContext();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const bus = ctx.createGain();
    bus.gain.value = MASTER_LEVEL;
    bus.connect(filter).connect(ctx.destination);
    graph = { ctx, bus, filter };
  }
  graph.filter.frequency.value = isLateNight() ? 1800 : 5000;
  void graph.ctx.resume();
  return graph;
}

const jitter = (frequency: number) =>
  frequency * 2 ** (((Math.random() * 2 - 1) * PITCH_JITTER_CENTS) / 1200);

function tone({ ctx, bus }: Graph, frequency: number, delay: number, attack: number, decay: number, peak: number, endFrequency?: number) {
  const start = ctx.currentTime + delay;
  const level = peak * (0.85 + Math.random() * 0.15);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(jitter(frequency), start);
  if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, start + attack + decay);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level, start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  osc.connect(gain).connect(bus);
  osc.start(start);
  osc.stop(start + attack + decay + 0.05);
}

function playSample(key: string, { ctx, bus }: Graph): boolean {
  const buffer = buffers.get(key);
  if (!buffer) return false;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.detune.value = (Math.random() * 2 - 1) * PITCH_JITTER_CENTS;
  source.connect(bus);
  source.start();
  return true;
}

function marimba(g: Graph, frequency: number, delay: number, peak: number) {
  tone(g, frequency, delay, 0.025, 0.9, peak);
  tone(g, frequency * 4, delay, 0.025, 0.25, peak * 0.2);
}

function bowl(g: Graph, frequency: number, delay: number, peak: number, decay: number) {
  tone(g, frequency, delay, 0.05, decay, peak);
  tone(g, frequency * 1.004, delay, 0.05, decay, peak * 0.6);
  tone(g, frequency * 2, delay, 0.05, decay * 0.7, peak * 0.25);
  tone(g, frequency * 3, delay, 0.05, decay * 0.5, peak * 0.1);
}

const SEND: Record<AvatarVariant, Recipe> = {
  pebble: (g) => tone(g, 130, 0, 0.025, 0.28, 0.9, 75),
  sprout: (g) => {
    tone(g, 420, 0, 0.02, 0.1, 0.7, 300);
    tone(g, 840, 0, 0.02, 0.06, 0.15, 600);
  },
  orb: (g) => bowl(g, 196, 0, 0.35, 1.6),
};

const REPLY: Record<AvatarVariant, Recipe> = {
  pebble: (g) => {
    tone(g, 261.6, 0, 0.04, 1.6, 0.5);
    tone(g, 523.2, 0, 0.04, 1.2, 0.08);
    tone(g, 440, 0.09, 0.04, 1.6, 0.35);
    tone(g, 880, 0.09, 0.04, 1.2, 0.05);
  },
  sprout: (g) => {
    marimba(g, 392, 0, 0.5);
    marimba(g, 587.3, 0.12, 0.4);
  },
  orb: (g) => {
    bowl(g, 261.6, 0, 0.45, 3.5);
    bowl(g, 392, 0.15, 0.3, 3.2);
  },
};

const SUPPORT: Recipe = (g) => {
  tone(g, 146.8, 0, 0.6, 3.5, 0.6);
  tone(g, 220, 0.2, 0.6, 3.2, 0.3);
};

function perform(event: 'send' | 'reply' | 'support', companion: AvatarVariant) {
  const out = output();
  if (playSample(`${companion}/${event}`, out)) return;
  if (event === 'send') SEND[companion](out);
  else if (event === 'reply') REPLY[companion](out);
  else SUPPORT(out);
}

export function playSend(companion: AvatarVariant) {
  if (enabled) perform('send', companion);
}

export function playReply(companion: AvatarVariant) {
  if (enabled) perform('reply', companion);
}

export function playSupport(companion: AvatarVariant) {
  if (enabled) perform('support', companion);
}

function pinkNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buffer;
}

const noiseHum =
  (type: BiquadFilterType, cutoff: number): HumSource =>
  (ctx, out) => {
    const source = ctx.createBufferSource();
    source.buffer = pinkNoise(ctx);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    source.connect(filter).connect(out);
    source.start();
    return [source];
  };

const droneHum: HumSource = (ctx, out) =>
  [110, 164.8].map((frequency) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = frequency;
    const level = ctx.createGain();
    level.gain.value = 0.15;
    osc.connect(level).connect(out);
    osc.start();
    return osc;
  });

const HUM: Record<AvatarVariant, HumSource> = {
  pebble: noiseHum('lowpass', 380),
  sprout: noiseHum('bandpass', 900),
  orb: droneHum,
};

const loopSample =
  (buffer: AudioBuffer): HumSource =>
  (ctx, out) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(out);
    source.start();
    return [source];
  };

export function startThinking(companion: AvatarVariant) {
  if (enabled) beginHum(companion);
}

function beginHum(companion: AvatarVariant) {
  if (stopHum) return;
  const { ctx, bus } = output();
  const recordedHum = buffers.get(`${companion}/thinking`);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(recordedHum ? 1 : 0.35, ctx.currentTime + 1.2);
  gain.connect(bus);
  const swell = ctx.createOscillator();
  swell.frequency.value = 0.12;
  const swellDepth = ctx.createGain();
  swellDepth.gain.value = 0.12;
  swell.connect(swellDepth).connect(gain.gain);
  swell.start();
  const hum = recordedHum ? loopSample(recordedHum) : HUM[companion];
  const sources = [...hum(ctx, gain), swell];
  stopHum = () => {
    const end = ctx.currentTime;
    const current = gain.gain.value;
    gain.gain.cancelScheduledValues(end);
    gain.gain.setValueAtTime(current, end);
    gain.gain.setTargetAtTime(0, end, 0.25);
    sources.forEach((node) => node.stop(end + 1.5));
  };
}

export function stopThinking() {
  stopHum?.();
  stopHum = undefined;
}

export async function previewSound(companion: AvatarVariant, event: SoundEvent) {
  await loadRecorded();
  if (event === 'thinking') {
    stopThinking();
    beginHum(companion);
    setTimeout(stopThinking, 3500);
  } else {
    perform(event, companion);
  }
}
