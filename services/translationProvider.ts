import EventSource from 'react-native-sse';
import { proxyPost } from '@/lib/apiProxy';
import { HIGH_QUALITY_LANGUAGES } from '@/lib/constants';
import { dynamoService } from '@/services/dynamoService';

const STREAM_URL = (process.env.EXPO_PUBLIC_API_STREAM_URL || '').replace(/\/$/, '');

// Sentence-boundary punctuation across the scripts this app translates into —
// Latin/most-European .!?, Devanagari-family danda ।, Arabic/Urdu/Persian ؟،
// and CJK full-width 。！？, each optionally followed by a closing quote/paren.
const SENTENCE_BOUNDARY = /([.!?।؟。！？][”"’'）)]?)(\s+|$)/;

export type TranslationProviderName = 'openai' | 'device';

// Full language names for translation prompts
const LANG_NAMES: Record<string, string> = {
  en: 'English',    hi: 'Hindi',       ta: 'Tamil',       te: 'Telugu',
  kn: 'Kannada',    ml: 'Malayalam',   mr: 'Marathi',     bn: 'Bengali',
  gu: 'Gujarati',   pa: 'Punjabi',     ur: 'Urdu',        es: 'Spanish',
  fr: 'French',     de: 'German',      it: 'Italian',     pt: 'Portuguese',
  ru: 'Russian',    ja: 'Japanese',    ko: 'Korean',      zh: 'Chinese',
  ar: 'Arabic',     tr: 'Turkish',     th: 'Thai',        vi: 'Vietnamese',
  id: 'Indonesian', nl: 'Dutch',       pl: 'Polish',      uk: 'Ukrainian',
  cs: 'Czech',      fil: 'Filipino',   sv: 'Swedish',     da: 'Danish',
  no: 'Norwegian',  fi: 'Finnish',     el: 'Greek',       hu: 'Hungarian',
  ro: 'Romanian',   sk: 'Slovak',      bg: 'Bulgarian',   sr: 'Serbian',
  he: 'Hebrew',     ca: 'Catalan',     fa: 'Persian',     ms: 'Malay',
  sw: 'Swahili',    hr: 'Croatian',    ne: 'Nepali',      si: 'Sinhala',
};

function langName(code: string): string {
  return LANG_NAMES[code] || code;
}

class TranslationProvider {
  private provider: TranslationProviderName = 'openai';
  // Cache for device translators / models
  private deviceCache: Record<string, any> = {};

  setProvider(name: TranslationProviderName) {
    this.provider = name;
  }

  getProvider(): TranslationProviderName {
    return this.provider;
  }

  isDeviceReady(): boolean {
    // Return true if any device model has been preloaded, or allow caller to check specific model via cache
    return Object.keys(this.deviceCache).length > 0;
  }

  async initializeDeviceModel(modelId: string): Promise<boolean> {
    try {
      // Lazy-import transformers and preload pipeline/model
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const transformers: any = await import('@xenova/transformers');

      if (transformers.pipeline) {
        this.deviceCache[modelId] = await transformers.pipeline('translation', modelId);
        console.log(`[translationProvider] Preloaded device model pipeline: ${modelId}`);
        return true;
      }

      // Fallback low-level load
      const tokenizer = await transformers.AutoTokenizer.from_pretrained(modelId);
      const model = await transformers.AutoModelForSeq2SeqLM.from_pretrained(modelId);
      this.deviceCache[modelId] = { tokenizer, model };
      console.log(`[translationProvider] Preloaded device model (tokenizer+model): ${modelId}`);
      return true;
    } catch (err) {
      console.warn('[translationProvider] initializeDeviceModel failed:', err);
      return false;
    }
  }

  // Native-script examples embedded in the prompt anchor GPT to the correct Unicode block.
  private static readonly SCRIPT_EXAMPLES: Record<string, string> = {
    ml: 'ഉദാഹരണം: "നന്ദി" (not "nandi")',
    ta: 'உதாரணம்: "நன்றி" (not "nandri")',
    te: 'ఉదాహరణ: "ధన్యవాదాలు" (not "dhanyavaadaalu")',
    kn: 'ಉದಾಹರಣೆ: "ಧನ್ಯವಾದಗಳು" (not "dhanyavaadagalu")',
    hi: 'उदाहरण: "धन्यवाद" (not "dhanyavaad")',
    mr: 'उदाहरण: "धन्यवाद" (not "dhanyavaad")',
    bn: 'উদাহরণ: "ধন্যবাদ" (not "dhônyôbad")',
    gu: 'ઉદાહરણ: "આભાર" (not "aabhar")',
    pa: 'ਉਦਾਹਰਨ: "ਧੰਨਵਾਦ" (not "dhanyavaad")',
    ur: 'مثال: "شکریہ" (not "shukriya")',
    si: 'නිදසුන: "ස්තූතියි" (not "sthootiyi")',
    ne: 'उदाहरण: "धन्यवाद" (not "dhanyavaad")',
    ar: 'مثال: "شكراً" (not "shukran")',
    fa: 'مثال: "ممنون" (not "mamnoon")',
    he: 'דוגמה: "תודה" (not "toda")',
  };

  /** Shared by translate() and translateStreaming() so both routes prompt the
   *  model identically — only how the response is fetched differs. */
  private buildTranslationPrompt(sourceLanguage: string, targetLanguage: string): { model: string; systemPrompt: string } {
    // gpt-4o for languages where gpt-4o-mini produces transliteration or wrong-script output
    const model = HIGH_QUALITY_LANGUAGES.has(targetLanguage) ? 'gpt-4o' : 'gpt-4o-mini';
    const srcName = langName(sourceLanguage);
    const tgtName = langName(targetLanguage);
    const scriptHint = TranslationProvider.SCRIPT_EXAMPLES[targetLanguage] ? ` ${TranslationProvider.SCRIPT_EXAMPLES[targetLanguage]}.` : '';

    const systemPrompt =
      `You are a professional translator. Translate the user's text from ${srcName} to ${tgtName}. ` +
      `Return ONLY the ${tgtName} translation written entirely in the correct native script — ` +
      `no explanation, no transliteration, no romanization, no Latin characters, no quotation marks.` +
      scriptHint;

    return { model, systemPrompt };
  }

  async translate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    if (this.provider === 'device') {
      return await this.deviceTranslate(text, sourceLanguage, targetLanguage, onChunk);
    }

    const { model, systemPrompt } = this.buildTranslationPrompt(sourceLanguage, targetLanguage);
    const translation = await this.callProxyChat(model, systemPrompt, text, onChunk);
    return translation.trim();
  }

  /**
   * Streaming variant for Plus/Live plans — calls onSentence() once per
   * complete sentence as it arrives, instead of once with the full text at
   * the end, so the caller can start TTS on sentence 1 while later sentences
   * are still being translated. Falls through to the same prompt-building as
   * the batch translate() above; only the transport differs.
   *
   * React Native has no native EventSource and fetch() can't read a response
   * body incrementally the way a browser can, hence react-native-sse (XHR-based
   * under the hood, which *does* support incremental reads on RN) rather than
   * hand-rolled stream parsing here.
   */
  async translateStreaming(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    onSentence: (sentence: string) => void,
  ): Promise<string> {
    if (this.provider === 'device') {
      // No streaming story for on-device translation — caller should not
      // route here when provider is 'device'; this exists as a safety net.
      const full = await this.deviceTranslate(text, sourceLanguage, targetLanguage, () => {});
      onSentence(full);
      return full;
    }

    if (!STREAM_URL) throw new Error('EXPO_PUBLIC_API_STREAM_URL is not set in .env');
    const idToken = dynamoService.getIdToken();
    if (!idToken) throw new Error('Not signed in — cannot reach AI services');

    const { model, systemPrompt } = this.buildTranslationPrompt(sourceLanguage, targetLanguage);

    return new Promise<string>((resolve, reject) => {
      let full = '';
      let pending = ''; // text received but not yet emitted as a complete sentence
      let settled = false;

      const es = new EventSource(STREAM_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          temperature: 0.2,
          max_tokens: 1024,
        }),
        // The server response itself has no fixed size — this is an idle-gap
        // timeout (no event received in N ms), not a total-duration cap.
        timeout: 20000,
      });

      const finish = (result: string | Error) => {
        if (settled) return;
        settled = true;
        es.removeAllEventListeners();
        es.close();
        if (result instanceof Error) reject(result);
        else resolve(result);
      };

      es.addEventListener('message', (event) => {
        if (!event.data) return;
        let payload: { delta?: string; done?: boolean; error?: string };
        try {
          payload = JSON.parse(event.data);
        } catch {
          return; // Ignore a malformed event rather than failing the whole stream over it
        }

        if (payload.error) {
          finish(new Error(payload.error));
          return;
        }

        if (payload.delta) {
          full += payload.delta;
          pending += payload.delta;

          // Emit every complete sentence found in `pending`, keep the trailing
          // partial fragment buffered for the next chunk.
          let match: RegExpMatchArray | null = pending.match(SENTENCE_BOUNDARY);
          while (match) {
            const cut = (match.index ?? 0) + match[0].length;
            const sentence = pending.slice(0, cut).trim();
            pending = pending.slice(cut);
            if (sentence) onSentence(sentence);
            match = pending.match(SENTENCE_BOUNDARY);
          }
        }

        if (payload.done) {
          const leftover = pending.trim();
          if (leftover) onSentence(leftover); // model's reply didn't end in sentence punctuation
          finish(full.trim());
        }
      });

      es.addEventListener('error', (event) => {
        if (event.type === 'timeout') {
          finish(new Error('Streaming translation timed out'));
          return;
        }

        // 'error' (HTTP-level failure) has message + xhrStatus; 'exception'
        // (thrown before/outside the XHR lifecycle) has message only.
        const rawMessage = event.message || 'Streaming translation failed';
        const xhrStatus = event.type === 'error' ? event.xhrStatus : undefined;

        // Pre-stream failures (auth/plan/validation) come back as plain JSON
        // in event.message — see streamChat.mjs's header comment for why
        // those aren't SSE-formatted. A real transport error has none of
        // that structure, so a JSON-parse failure just falls back to the raw text.
        let detail = rawMessage;
        try {
          const parsed = JSON.parse(rawMessage);
          if (parsed.error) detail = parsed.error;
        } catch {
          // not JSON — use rawMessage as-is
        }
        finish(new Error(`${detail}${xhrStatus ? ` (${xhrStatus})` : ''}`));
      });
    });
  }

  /** Translate via our backend's /v1/proxy/openai/chat route (keys live server-side). */
  private async callProxyChat(
    model: string,
    systemPrompt: string,
    userMessage: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const response = await proxyPost('/v1/proxy/openai/chat', {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 1024,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`Translation API error ${response.status}: ${errText.substring(0, 200)}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) throw new Error('Translation API returned an empty result');
    onChunk(text);
    return text;
  }

  private async deviceTranslate(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    // Basic device implementation using transformers.js (@xenova/transformers)
    // This is a best-effort integration: devices must bundle or download models.
    // If the library or model isn't available, throw a descriptive error.
    const modelIdCandidates = [
      `Helsinki-NLP/opus-mt-${sourceLanguage}-${targetLanguage}`,
      `Helsinki-NLP/opus-mt-${sourceLanguage}-en`,
      `Helsinki-NLP/opus-mt-en-${targetLanguage}`,
    ];

    try {
      // Lazy-import to avoid loading heavy libs on platforms that don't support them
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const transformers: any = await import('@xenova/transformers');

      // Try model candidates and cache pipelines
      for (const modelId of modelIdCandidates) {
        try {
          if (!this.deviceCache[modelId]) {
            if (transformers.pipeline) {
              // pipeline returns a callable pipeline object — store it directly
              this.deviceCache[modelId] = await transformers.pipeline('translation', modelId);
            } else {
              // Fallback low-level load
              const tokenizer = await transformers.AutoTokenizer.from_pretrained(modelId);
              const model = await transformers.AutoModelForSeq2SeqLM.from_pretrained(modelId);
              this.deviceCache[modelId] = { tokenizer, model };
            }
          }

          const cached = this.deviceCache[modelId];

          // The pipeline object IS callable — invoke it directly (not as .pipeline())
          if (cached && typeof cached === 'function') {
            const res = await cached(text);
            const translated = Array.isArray(res)
              ? (res[0]?.translation_text || res[0]?.generated_text || '')
              : (res?.translation_text || res?.generated_text || String(res));
            if (translated.trim()) { onChunk(translated); return translated; }
          }

          // Pipeline object may also be callable as an object (some versions)
          if (cached && cached.tokenizer && cached.model) {
            const tokenizer = cached.tokenizer;
            const model = cached.model;
            const inputs = await tokenizer(text);
            const outputs = await model.generate(inputs.input_ids);
            const decoded = await tokenizer.decode(outputs[0], { skip_special_tokens: true });
            onChunk(decoded);
            return decoded;
          }

        } catch (err) {
          // Try next candidate
          console.warn(`[translationProvider] model ${modelId} load/exec failed:`, (err as any)?.message || err);
          continue;
        }
      }

      throw new Error('No suitable on-device translation model found. Please bundle a Helsinki-NLP opus-mt model or use the cloud provider.');
    } catch (err: any) {
      // Import or runtime failure
      throw new Error(`Device translation unavailable: ${err?.message || err}`);
    }
  }
}

export const translationProvider = new TranslationProvider();

/*
Integration notes:
- To enable on-device translation, implement the `device` branch in `translate()`.
- Possible options:
  - Use `@xenova/transformers` (transformers.js) with a small Marian/OPUS-MT model bundled for the target languages.
  - Use `onnxruntime-react-native` or a native module that runs an exported translation model.
  - Expose a native bridge that calls a local server (e.g., a bundled tiny translation engine) when offline.
- Device implementations should support incremental streaming where possible (call `onChunk`).
*/
