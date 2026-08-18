import { spawn } from 'node:child_process';
import { resolveTool, spawnTool } from './resolve-tool.mjs';

function fail(message) {
  throw new Error(message);
}

function localEnvironment() {
  const result = spawnTool('supabase', ['status', '-o', 'env'], { encoding: 'utf8' });
  if (result.status !== 0) fail('LOCAL_SUPABASE_REQUIRED');
  const values = {};
  for (const line of (result.stdout ?? '').split(/\r?\n/u)) {
    const match = /^([A-Z_]+)="([^"]*)"$/u.exec(line.trim());
    if (match?.[1] && match[2]) values[match[1]] = match[2];
  }
  if (!values.API_URL || !values.PUBLISHABLE_KEY || !values.SECRET_KEY) {
    fail('LOCAL_SUPABASE_ENV_INVALID');
  }
  return {
    apiUrl: values.API_URL,
    publishableKey: values.PUBLISHABLE_KEY,
    secretKey: values.SECRET_KEY,
  };
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function expectOk(response, label) {
  const body = await readBody(response);
  if (!response.ok) fail(`${label}:${response.status}:${JSON.stringify(body)}`);
  return body;
}

function headers(key, token = key, extra = {}) {
  return {
    apikey: key,
    authorization: `Bearer ${token}`,
    ...extra,
  };
}

function storagePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function ensureFunctions(config) {
  const ready = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/functions/v1/scan-upload`, {
        method: 'OPTIONS',
      });
      return response.ok;
    } catch {
      return false;
    }
  };
  const resolved = resolveTool('supabase', ['functions', 'serve']);
  const child = spawn(resolved.command, resolved.args, {
    cwd: process.cwd(),
    detached: process.platform !== 'win32',
    shell: resolved.shell,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', (chunk) => {
    output = `${output}${String(chunk)}`.slice(-4000);
  });
  child.stderr?.on('data', (chunk) => {
    output = `${output}${String(chunk)}`.slice(-4000);
  });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (output.includes('Serving functions on') && (await ready())) return child;
    if (child.exitCode !== null) fail(`EDGE_FUNCTION_SERVER_EXITED:${output}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  child.kill('SIGTERM');
  fail(`EDGE_FUNCTION_SERVER_TIMEOUT:${output}`);
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    child.once('exit', onExit);
  });
}

function signalFunctionServer(child, signal) {
  if (process.platform !== 'win32' && child.pid) {
    try {
      if (process.kill(-child.pid, signal)) return;
    } catch {
      // Fall back to the direct child when the process group has already exited.
    }
  }
  child.kill(signal);
}

async function stopFunctions(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  signalFunctionServer(child, 'SIGTERM');
  if (!(await waitForExit(child, 5_000))) {
    signalFunctionServer(child, 'SIGKILL');
    if (!(await waitForExit(child, 5_000))) fail('EDGE_FUNCTION_SERVER_SHUTDOWN_TIMEOUT');
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
}

async function createUser(config, prefix) {
  const nonce = crypto.randomUUID();
  const email = `${prefix}-${nonce}@test.invalid`;
  const password = `Local-${nonce}-A9!`;
  const created = await expectOk(
    await fetch(`${config.apiUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: headers(config.secretKey, config.secretKey, { 'content-type': 'application/json' }),
      body: JSON.stringify({ email, password, email_confirm: true }),
    }),
    `${prefix}_admin_create`,
  );
  const session = await expectOk(
    await fetch(`${config.apiUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: headers(config.publishableKey, config.publishableKey, {
        'content-type': 'application/json',
      }),
      body: JSON.stringify({ email, password }),
    }),
    `${prefix}_sign_in`,
  );
  if (!created?.id || !session?.access_token) fail(`${prefix}_session_invalid`);
  return { id: created.id, token: session.access_token };
}

async function rpc(config, user, name, body) {
  return await fetch(`${config.apiUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: headers(config.publishableKey, user.token, {
      'content-type': 'application/json',
    }),
    body: JSON.stringify(body),
  });
}

async function invoke(config, user, name, body) {
  return await fetch(`${config.apiUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: headers(config.publishableKey, user.token, {
      'content-type': 'application/json',
    }),
    body: JSON.stringify(body),
  });
}

async function runStorageFlow(config, owner, outsider) {
  const png = Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  );
  const ticket = await expectOk(
    await rpc(config, owner, 'create_unbound_file_upload', {
      p_purpose: 'request_media',
      p_filename: 'integration.png',
      p_declared_mime_type: 'image/png',
      p_size_bytes: png.byteLength,
    }),
    'upload_ticket',
  );
  if (!ticket?.uploadId || ticket.bucket !== 'quarantine' || !ticket.path) {
    fail('upload_ticket_contract_invalid');
  }
  await expectOk(
    await fetch(`${config.apiUrl}/storage/v1/object/quarantine/${storagePath(ticket.path)}`, {
      method: 'POST',
      headers: headers(config.publishableKey, owner.token, {
        'content-type': 'image/png',
        'x-upsert': 'false',
      }),
      body: png,
    }),
    'quarantine_upload',
  );
  const quarantineRead = await fetch(
    `${config.apiUrl}/storage/v1/object/authenticated/quarantine/${storagePath(ticket.path)}`,
    { headers: headers(config.publishableKey, owner.token) },
  );
  if (quarantineRead.ok) fail('quarantine_object_became_directly_readable');

  const clean = await expectOk(
    await invoke(config, owner, 'scan-upload', { uploadId: ticket.uploadId }),
    'scan_upload',
  );
  if (clean?.status !== 'clean' || !clean.storagePath) fail('clean_upload_contract_invalid');

  const directCleanRead = await fetch(
    `${config.apiUrl}/storage/v1/object/authenticated/request-media/${storagePath(clean.storagePath)}`,
    { headers: headers(config.publishableKey, owner.token) },
  );
  if (directCleanRead.ok) fail('service_promoted_object_bypassed_signed_media');

  const authorization = await expectOk(
    await invoke(config, owner, 'media-access', {
      uploadId: ticket.uploadId,
      expiresInSeconds: 60,
    }),
    'signed_media_owner',
  );
  if (!authorization?.signedUrl || !authorization?.expiresAt) {
    fail('signed_media_contract_invalid');
  }
  const signedRead = await fetch(authorization.signedUrl);
  if (!signedRead.ok || (await signedRead.arrayBuffer()).byteLength === 0) {
    fail('signed_media_download_failed');
  }
  const outsiderRead = await invoke(config, outsider, 'media-access', {
    uploadId: ticket.uploadId,
    expiresInSeconds: 60,
  });
  if (outsiderRead.ok) fail('unrelated_user_received_signed_media');

  await expectOk(
    await fetch(`${config.apiUrl}/storage/v1/object/request-media`, {
      method: 'DELETE',
      headers: headers(config.secretKey, config.secretKey, { 'content-type': 'application/json' }),
      body: JSON.stringify({ prefixes: [clean.storagePath] }),
    }),
    'clean_object_cleanup',
  );
}

async function runAiPublicationFlow(config, owner) {
  const first = await expectOk(
    await invoke(config, owner, 'ai-diagnostic', {
      locale: 'en',
      clientMessageId: `turn-${crypto.randomUUID()}`,
      confirmedCategorySlug: 'general-handyman',
      categoryHints: ['general-handyman'],
      messages: [{ role: 'user', text: 'The kitchen sink is leaking under the cabinet.' }],
    }),
    'ai_turn_one',
  );
  if (!first?.metadata?.sessionId || first.enoughInformation !== false) {
    fail('ai_turn_one_contract_invalid');
  }
  const secondUserText = 'It started last night. Tomorrow morning in Riyadh, Al Malqa district.';
  const second = await expectOk(
    await invoke(config, owner, 'ai-diagnostic', {
      locale: 'en',
      sessionId: first.metadata.sessionId,
      clientMessageId: `turn-${crypto.randomUUID()}`,
      confirmedCategorySlug: 'general-handyman',
      categoryHints: ['general-handyman'],
      messages: [
        { role: 'user', text: 'The kitchen sink is leaking under the cabinet.' },
        { role: 'assistant', text: first.followUpQuestions[0] ?? first.confirmationQuestion },
        { role: 'user', text: secondUserText },
      ],
    }),
    'ai_turn_two',
  );
  if (
    second.enoughInformation !== true ||
    second.metadata?.turnNumber !== 2 ||
    !second.customerSummary?.includes('kitchen sink') ||
    !second.customerSummary?.includes('Al Malqa')
  )
    fail('multi_turn_history_not_preserved');

  const messages = await expectOk(
    await fetch(
      `${config.apiUrl}/rest/v1/ai_messages?session_id=eq.${first.metadata.sessionId}` +
        '&select=actor,sequence_number,original_content&order=sequence_number.asc',
      { headers: headers(config.publishableKey, owner.token) },
    ),
    'ai_message_history',
  );
  if (!Array.isArray(messages) || messages.length !== 4) fail('ai_messages_not_persisted');

  const publication = {
    title: 'Kitchen sink leak',
    original_text: 'The kitchen sink is leaking under the cabinet.\n' + secondUserText,
    structured_description: second.customerSummary,
    urgency: second.urgencySuggestion,
    locale: 'en',
    category_slug: 'general-handyman',
    city_code: 'riyadh',
    exact_location: { latitude: 24.7136, longitude: 46.6753 },
    media: [],
    ai_diagnostic: second,
    ai_session_id: first.metadata.sessionId,
    idempotency_key: crypto.randomUUID(),
  };
  const rejected = await rpc(config, owner, 'publish_service_request', {
    payload: { ...publication, customer_approved: false },
  });
  if (rejected.ok) fail('unapproved_ai_draft_was_published');
  const requestId = await expectOk(
    await rpc(config, owner, 'publish_service_request', {
      payload: { ...publication, customer_approved: true, idempotency_key: crypto.randomUUID() },
    }),
    'approved_ai_publication',
  );
  if (typeof requestId !== 'string') fail('publication_id_invalid');
  await expectOk(
    await rpc(config, owner, 'link_ai_session_to_request', {
      p_session_id: first.metadata.sessionId,
      p_request_id: requestId,
    }),
    'ai_session_link',
  );
  const linked = await expectOk(
    await fetch(
      `${config.apiUrl}/rest/v1/ai_sessions?id=eq.${first.metadata.sessionId}` +
        '&select=status,request_id',
      { headers: headers(config.publishableKey, owner.token) },
    ),
    'linked_ai_session',
  );
  if (linked?.[0]?.status !== 'published' || linked?.[0]?.request_id !== requestId) {
    fail('ai_session_publication_link_invalid');
  }
}

const config = localEnvironment();
const functionServer = await ensureFunctions(config);
try {
  const owner = await createUser(config, 'local-owner');
  const outsider = await createUser(config, 'local-outsider');
  await runStorageFlow(config, owner, outsider);
  await runAiPublicationFlow(config, owner);
  console.log(
    'Local Supabase integration: PASS (storage scan/signing + multi-turn AI publication)',
  );
} finally {
  await stopFunctions(functionServer);
}
