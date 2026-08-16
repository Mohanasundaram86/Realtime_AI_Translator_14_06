/**
 * Streaming translation — Phase 1 "Plus" tier.
 *
 * A Lambda Function URL with InvokeMode=RESPONSE_STREAM, NOT an API Gateway
 * route. API Gateway buffers the entire Lambda response before it reaches the
 * client, which defeats the whole point here — Function URLs are the only way
 * to actually stream. The tradeoff: Function URLs don't get the
 * CognitoJwtAuthorizer that every /v1/* route gets for free from API Gateway,
 * so this handler verifies the bearer token itself via aws-jwt-verify before
 * doing anything else. Nothing here is reachable without a valid, current
 * Cognito ID token — AuthType is NONE at the infrastructure level (Function
 * URLs don't support the Cognito authorizer type API Gateway has), but that
 * just means auth enforcement moved from config into code, not that it's gone.
 *
 * Wire format is newline-delimited JSON, not raw OpenAI SSE — this keeps the
 * client decoupled from OpenAI's exact stream shape (same reasoning as every
 * other provider proxy in this backend). Each line is one of:
 *   {"delta": "text chunk"}
 *   {"done": true}
 *   {"error": "message"}   — can appear even after a 200, since headers are
 *                             already committed once streaming starts; the
 *                             client must watch for this on every line, not
 *                             just rely on the HTTP status.
 *
 * Request body contract matches proxyOpenAIChat in aiProxy.mjs on purpose —
 * { model, messages[], temperature?, max_tokens? } — so the client reuses the
 * exact same prompt-building logic for both the batch and streaming routes.
 */

import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { requirePlan } from '../lib/entitlement.mjs';

const jwtVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.USER_POOL_ID,
  tokenUse:   'id',
  clientId:   process.env.USER_POOL_CLIENT_ID,
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function extractBearerToken(event) {
  const headers = event.headers || {};
  const raw = headers.authorization || headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match ? match[1] : null;
}

/** Sends a single JSON error response and ends the stream — used for
 *  failures that happen before any real streaming has begun, so a normal
 *  status code still means something to the client. */
function sendStreamError(responseStream, statusCode, message) {
  const stream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
  stream.write(JSON.stringify({ error: message }));
  stream.end();
}

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  // ── Auth + entitlement — before a single byte is sent ────────────────
  let userId;
  try {
    const token = extractBearerToken(event);
    if (!token) throw Object.assign(new Error('Missing bearer token'), { statusCode: 401 });

    let payload;
    try {
      payload = await jwtVerifier.verify(token);
    } catch {
      throw Object.assign(new Error('Invalid or expired token'), { statusCode: 401 });
    }
    userId = payload.sub;

    await requirePlan(userId, 'plus');
  } catch (err) {
    sendStreamError(responseStream, err.statusCode || 401, err.message || 'Unauthorized');
    return;
  }

  // ── Body validation ────────────────────────────────────────────────
  let model, messages, temperature, max_tokens;
  try {
    const body = JSON.parse(event.body || '{}');
    ({ model, messages, temperature, max_tokens } = body);
    if (!model || !Array.isArray(messages) || messages.length === 0) {
      throw Object.assign(new Error('model and messages[] are required'), { statusCode: 400 });
    }
  } catch (err) {
    sendStreamError(responseStream, err.statusCode || 400, err.message || 'Invalid request body');
    return;
  }

  // ── The real streaming response starts here ──────────────────────────
  const stream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 200,
    headers: { 'Content-Type': 'application/x-ndjson', ...CORS_HEADERS },
  });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    stream.write(JSON.stringify({ error: 'OpenAI is not configured on the server' }) + '\n');
    stream.end();
    return;
  }

  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature: temperature ?? 0.2,
        max_tokens:  max_tokens ?? 1024,
        stream:      true,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => '');
      stream.write(JSON.stringify({ error: `Upstream error ${upstream.status}: ${errText.substring(0, 300)}` }) + '\n');
      stream.end();
      return;
    }

    // Parse OpenAI's SSE stream, relay only the text deltas as NDJSON.
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep the last (possibly partial) line for the next chunk

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue; // the outer read loop's `done` handles this

        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) stream.write(JSON.stringify({ delta }) + '\n');
        } catch {
          // Malformed/split SSE chunk (rare, e.g. a chunk boundary mid-JSON) —
          // skip it rather than aborting the whole stream over one bad line.
        }
      }
    }

    stream.write(JSON.stringify({ done: true }) + '\n');
  } catch (err) {
    // Mid-stream failure — the 200 + headers already went out, so a normal
    // error response isn't possible anymore; this NDJSON line is the only
    // way left to signal it, which is why the client must check every line
    // for `error`, not just trust a 200 status.
    stream.write(JSON.stringify({ error: err.message || 'Streaming failed' }) + '\n');
  } finally {
    stream.end();
  }
});
