// @vitest-environment happy-dom
// QA S-2: playFromRange stops playback before it can learn the target has
// nothing to narrate. It must then leave a state that Play restarts from
// (stop-paused), not 'stopped' that a caller's pause() turns into a resumable
// 'paused' over an engine that has nothing loaded.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { TTSController } from '@/services/tts/TTSController';
import type { TTSClient, TTSMessageEvent } from '@/services/tts/TTSClient';
import type { FoliateView } from '@/types/view';

const makeMockClient = (name: string): TTSClient =>
  ({
    name,
    initialized: true,
    init: vi.fn().mockResolvedValue(true),
    shutdown: vi.fn().mockResolvedValue(undefined),
    speak: vi.fn().mockImplementation(async function* (): AsyncIterable<TTSMessageEvent> {
      yield { code: 'end', message: 'done' };
    }),
    pause: vi.fn().mockResolvedValue(true),
    resume: vi.fn().mockResolvedValue(true),
    stop: vi.fn().mockResolvedValue(undefined),
    setPrimaryLang: vi.fn(),
    setRate: vi.fn().mockResolvedValue(undefined),
    setPitch: vi.fn().mockResolvedValue(undefined),
    setVoice: vi.fn().mockResolvedValue(undefined),
    getAllVoices: vi.fn().mockResolvedValue([]),
    getVoices: vi.fn().mockResolvedValue([]),
    getGranularities: vi.fn().mockReturnValue(['sentence']),
    getCapabilities: vi.fn().mockReturnValue({
      wordBoundaries: false,
      mediaClock: false,
      gapControl: false,
      liveRateChange: false,
    }),
    getVoiceId: vi.fn().mockReturnValue('v'),
    getSpeakingLang: vi.fn().mockReturnValue('en'),
  }) as unknown as TTSClient;

vi.mock('@/services/tts/WebSpeechClient', () => ({
  WebSpeechClient: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    Object.assign(this, makeMockClient('web-speech'));
  }),
}));
vi.mock('@/services/tts/EdgeTTSClient', () => ({
  DEFAULT_SENTENCE_GAP_SEC: 0.15,
  EdgeTTSClient: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    Object.assign(this, makeMockClient('edge-tts'));
  }),
}));
vi.mock('@/services/tts/NativeTTSClient', () => ({
  NativeTTSClient: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    Object.assign(this, makeMockClient('native'));
  }),
}));
vi.mock('@/services/tts/TTSUtils', () => ({
  TTSUtils: {
    getPreferredClient: vi.fn().mockReturnValue('edge-tts'),
    setPreferredClient: vi.fn(),
    setPreferredVoice: vi.fn(),
    getPreferredVoice: vi.fn().mockReturnValue(null),
  },
}));
vi.mock('foliate-js/overlayer.js', () => ({ Overlayer: { highlight: 'highlightFn' } }));
vi.mock('foliate-js/tts.js', () => ({
  TTS: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    Object.assign(this, {
      start: vi.fn().mockReturnValue('<speak>hello</speak>'),
      resume: vi.fn().mockReturnValue('<speak>hello</speak>'),
      next: vi.fn().mockReturnValue(undefined),
      prev: vi.fn().mockReturnValue(undefined),
      // Nothing to read from here.
      from: vi.fn().mockReturnValue(undefined),
      setMark: vi.fn().mockReturnValue(undefined),
      getLastRange: vi.fn().mockReturnValue(undefined),
      doc: null,
    });
  }),
  getSentences: vi.fn().mockImplementation(function* () {}),
}));
vi.mock('foliate-js/text-walker.js', () => ({ textWalker: vi.fn() }));
vi.mock('@/utils/ssml', () => ({
  filterSSMLWithLang: vi.fn((ssml: string) => ssml),
  parseSSMLMarks: vi.fn(() => ({
    plainText: 'hello',
    marks: [{ offset: 0, name: '0', text: 'hello', language: 'en' }],
  })),
}));
vi.mock('@/utils/node', () => ({ createRejectFilter: vi.fn(() => () => 1) }));
vi.mock('@/utils/lang', () => ({
  isValidLang: vi.fn(() => true),
  isCJKLang: vi.fn(() => false),
}));

describe('playFromRange with nothing to narrate after stopping (S-2)', () => {
  let controller: TTSController;
  let doc: Document;

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    doc = document.implementation.createHTMLDocument('t');
    doc.body.textContent = 'Some text.';
    const view = {
      book: { sections: [{ createDocument: vi.fn().mockResolvedValue(doc) }] },
      renderer: {
        getContents: () => [{ doc, index: 0, overlayer: { add: vi.fn(), remove: vi.fn() } }],
        primaryIndex: 0,
      },
      language: { isCJK: false },
      getCFI: vi.fn().mockReturnValue('epubcfi(/6/2!/4/2)'),
      resolveCFI: vi.fn().mockReturnValue({ anchor: () => new Range() }),
      tts: null,
    } as unknown as FoliateView;
    controller = new TTSController(null, view);
    await controller.init();
    await controller.initViewTTS(0);
  });

  test('leaves a stop-paused session that Play restarts', async () => {
    controller.state = 'playing';
    const range = doc.createRange();
    range.selectNodeContents(doc.body);
    const result = await controller.playFromRange(range, 0);
    expect(result).toBe('unnarrated');
    expect(controller.state).toBe('stop-paused');
  });
});
