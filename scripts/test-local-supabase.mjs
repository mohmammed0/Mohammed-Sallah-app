import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveTool, spawnTool } from './resolve-tool.mjs';

function fail(message) {
  throw new Error(message);
}

export function localTestFunctionEnvironment(input = process.env) {
  if (
    input.APP_ENV !== 'test' ||
    input.UPLOAD_SCANNER_MODE !== 'deterministic' ||
    input.AI_PROVIDER !== 'deterministic'
  ) {
    fail('LOCAL_SUPABASE_TEST_ENV_INVALID');
  }
  return 'APP_ENV=test\nUPLOAD_SCANNER_MODE=deterministic\nAI_PROVIDER=deterministic\n';
}

export function localEnvironment() {
  const result = spawnTool('supabase', ['status', '-o', 'env'], { encoding: 'utf8' });
  if (result.status !== 0) fail('LOCAL_SUPABASE_REQUIRED');
  const values = {};
  for (const line of (result.stdout ?? '').split(/\r?\n/u)) {
    const match = /^([A-Z0-9_]+)="([^"]*)"$/u.exec(line.trim());
    if (match?.[1] && match[2]) values[match[1]] = match[2];
  }
  if (
    !values.API_URL ||
    !values.PUBLISHABLE_KEY ||
    !values.SECRET_KEY ||
    !values.S3_PROTOCOL_ACCESS_KEY_ID ||
    !values.S3_PROTOCOL_ACCESS_KEY_SECRET ||
    !values.S3_PROTOCOL_REGION
  ) {
    fail('LOCAL_SUPABASE_ENV_INVALID');
  }
  return {
    apiUrl: values.API_URL,
    publishableKey: values.PUBLISHABLE_KEY,
    secretKey: values.SECRET_KEY,
    s3AccessKeyId: values.S3_PROTOCOL_ACCESS_KEY_ID,
    s3SecretAccessKey: values.S3_PROTOCOL_ACCESS_KEY_SECRET,
    s3Region: values.S3_PROTOCOL_REGION,
  };
}

export async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function expectOk(response, label) {
  const body = await readBody(response);
  if (!response.ok) fail(`${label}:${response.status}:${JSON.stringify(body)}`);
  return body;
}

export function headers(key, token = key, extra = {}) {
  return {
    apikey: key,
    authorization: `Bearer ${token}`,
    ...extra,
  };
}

export function storagePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function windowsToWslPath(value) {
  const match = /^([A-Za-z]):\\(.*)$/u.exec(value);
  if (!match?.[1] || match[2] === undefined) return value;
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
}

function runLocalDatabaseFixture(sql) {
  const args = [
    'exec',
    '-i',
    'supabase_db_sallah',
    'psql',
    '-X',
    '-qAt',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
  ];
  const result =
    process.platform === 'win32'
      ? spawnSync('wsl.exe', ['-e', 'docker', ...args], {
          encoding: 'utf8',
          input: sql,
          shell: false,
        })
      : spawnSync('docker', args, { encoding: 'utf8', input: sql, shell: false });
  if (result.status !== 0) {
    fail(`LOCAL_DATABASE_FIXTURE_FAILED:${result.stderr ?? ''}`);
  }
  return (result.stdout ?? '').trim();
}

function exactUuid(value, label) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    fail(`${label}_INVALID`);
  }
  return value;
}

export async function ensureFunctions(config, options = {}) {
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
  const serveArgs = ['functions', 'serve'];
  if (options.envFile) {
    serveArgs.push('--env-file', windowsToWslPath(resolve(options.envFile)));
  }
  const resolved = resolveTool('supabase', serveArgs);
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

export async function stopFunctions(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  signalFunctionServer(child, 'SIGTERM');
  if (!(await waitForExit(child, 5_000))) {
    signalFunctionServer(child, 'SIGKILL');
    if (!(await waitForExit(child, 5_000))) fail('EDGE_FUNCTION_SERVER_SHUTDOWN_TIMEOUT');
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
}

export async function createUser(config, prefix) {
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

async function signInUser(config, email, password) {
  const session = await expectOk(
    await fetch(`${config.apiUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: headers(config.publishableKey, config.publishableKey, {
        'content-type': 'application/json',
      }),
      body: JSON.stringify({ email, password }),
    }),
    'fixture_sign_in',
  );
  if (!session?.access_token || !session?.user?.id) fail('fixture_session_invalid');
  return { id: session.user.id, token: session.access_token };
}

export async function rpc(config, user, name, body) {
  return await fetch(`${config.apiUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: headers(config.publishableKey, user.token, {
      'content-type': 'application/json',
    }),
    body: JSON.stringify(body),
  });
}

export async function invoke(config, user, name, body) {
  return await fetch(`${config.apiUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: headers(config.publishableKey, user.token, {
      'content-type': 'application/json',
    }),
    body: JSON.stringify(body),
  });
}

export async function userRequest(config, user, path, init = {}) {
  return await fetch(`${config.apiUrl}/rest/v1/${path}`, {
    ...init,
    headers: headers(config.publishableKey, user.token, {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    }),
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

  const operationId = crypto.randomUUID();
  const start = { uploadId: ticket.uploadId, action: 'start', operationId };
  const queued = await expectOk(await invoke(config, owner, 'scan-upload', start), 'scan_queue');
  if (queued?.status !== 'queued' || queued.uploadId !== ticket.uploadId) {
    fail('queued_scan_contract_invalid');
  }
  const replay = await expectOk(
    await invoke(config, owner, 'scan-upload', start),
    'scan_queue_response_loss_replay',
  );
  if (JSON.stringify(replay) !== JSON.stringify(queued)) fail('queued_scan_replay_changed');
  const status = await expectOk(
    await invoke(config, owner, 'scan-upload', { uploadId: ticket.uploadId, action: 'status' }),
    'scan_status',
  );
  if (status?.status !== 'queued' || status.uploadId !== ticket.uploadId) {
    fail('queued_scan_status_invalid');
  }
  const outsiderStatus = await invoke(config, outsider, 'scan-upload', {
    uploadId: ticket.uploadId,
    action: 'status',
  });
  if (outsiderStatus.ok) fail('unrelated_user_received_scan_status');

  await expectOk(
    await fetch(`${config.apiUrl}/storage/v1/object/quarantine`, {
      method: 'DELETE',
      headers: headers(config.secretKey, config.secretKey, { 'content-type': 'application/json' }),
      body: JSON.stringify({ prefixes: [ticket.path] }),
    }),
    'quarantine_object_cleanup',
  );
}

async function createCleanCompletionProof(config, provider, jobId) {
  const sizeBytes = 68;
  const ticket = await expectOk(
    await rpc(config, provider, 'create_resource_file_upload', {
      p_purpose: 'completion_proof',
      p_resource_id: jobId,
      p_filename: 'completion.png',
      p_declared_mime_type: 'image/png',
      p_size_bytes: sizeBytes,
    }),
    'completion_proof_ticket',
  );
  const uploadId = exactUuid(ticket?.uploadId, 'COMPLETION_PROOF_UPLOAD_ID');
  const providerId = exactUuid(provider.id, 'COMPLETION_PROOF_PROVIDER_ID');
  const resourceId = exactUuid(jobId, 'COMPLETION_PROOF_JOB_ID');
  const updated = runLocalDatabaseFixture(`
    update public.file_uploads
       set status = 'clean',
           final_path = target_path,
           detected_mime_type = 'image/png',
           sanitized = true,
           scanner = 'local-marketplace-fixture',
           scanned_at = now(),
           content_sha256 = repeat('0', 64)
     where id = '${uploadId}'::uuid
       and user_id = '${providerId}'::uuid
       and resource_id = '${resourceId}'::uuid
       and purpose = 'completion_proof'
       and status = 'created'
    returning id;
  `);
  if (updated !== uploadId) fail('COMPLETION_PROOF_FIXTURE_NOT_CLEAN');
  return {
    uploadId,
    mimeType: 'image/png',
    sizeBytes,
    description: 'Concurrent completion rejection fixture proof',
  };
}

async function runAiPublicationFlow(config, owner) {
  const dirtyTicket = await expectOk(
    await rpc(config, owner, 'create_unbound_file_upload', {
      p_purpose: 'request_media',
      p_filename: 'dirty.png',
      p_declared_mime_type: 'image/png',
      p_size_bytes: 68,
    }),
    'dirty_ai_media_ticket',
  );
  const dirtyClientMessageId = `dirty-turn-${crypto.randomUUID()}`;
  const dirtyResponse = await invoke(config, owner, 'ai-diagnostic', {
    locale: 'en',
    clientMessageId: dirtyClientMessageId,
    confirmedCategorySlug: 'general-handyman',
    categoryHints: ['general-handyman'],
    inputKind: 'image',
    mediaUploadIds: [dirtyTicket.uploadId],
    messages: [{ role: 'user', text: 'This unscanned image must never reach the AI provider.' }],
  });
  if (dirtyResponse.ok) fail('dirty_ai_media_was_accepted');
  const dirtyMessages = await expectOk(
    await userRequest(
      config,
      owner,
      `ai_messages?client_message_id=eq.${encodeURIComponent(dirtyClientMessageId)}&select=id`,
    ),
    'dirty_ai_media_message_check',
  );
  if (!Array.isArray(dirtyMessages) || dirtyMessages.length !== 0) {
    fail('dirty_ai_media_left_an_unreplayable_customer_turn');
  }
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

  const publicationKey = crypto.randomUUID();
  const publication = {
    title: 'Kitchen sink leak',
    original_text: 'The kitchen sink is leaking under the cabinet.\n' + secondUserText,
    structured_description: second.customerSummary,
    urgency: second.urgencySuggestion,
    locale: 'en',
    selected_category_slug: 'general-handyman',
    suggested_category_slug: second.categorySlug,
    category_confirmed_by_user: true,
    category_selection_source:
      second.categorySlug === 'general-handyman' ? 'ai_suggestion' : 'customer_correction',
    city_code: 'riyadh',
    exact_location: { latitude: 24.7136, longitude: 46.6753 },
    media: [],
    ai_diagnostic: second,
    ai_session_id: first.metadata.sessionId,
    idempotency_key: publicationKey,
  };
  const rejected = await rpc(config, owner, 'publish_service_request', {
    payload: { ...publication, customer_approved: false },
  });
  if (rejected.ok) fail('unapproved_ai_draft_was_published');
  const requestId = await expectOk(
    await rpc(config, owner, 'publish_service_request', {
      payload: { ...publication, customer_approved: true },
    }),
    'approved_ai_publication',
  );
  if (typeof requestId !== 'string') fail('publication_id_invalid');
  const replayedRequestId = await expectOk(
    await rpc(config, owner, 'publish_service_request', {
      payload: { ...publication, customer_approved: true },
    }),
    'approved_ai_publication_response_loss_replay',
  );
  if (replayedRequestId !== requestId) fail('atomic_publication_replay_changed_request');
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

async function runConcurrentIdempotencyFlow(config, owner, provider) {
  const cityRows = await expectOk(
    await userRequest(config, provider, 'cities?code=eq.riyadh&select=id'),
    'provider_city_fixture',
  );
  const cityId = cityRows?.[0]?.id;
  if (typeof cityId !== 'string') fail('provider_city_fixture_invalid');
  await expectOk(
    await userRequest(config, provider, `provider_service_areas?provider_id=eq.${provider.id}`, {
      method: 'DELETE',
      headers: { prefer: 'return=minimal' },
    }),
    'provider_area_cleanup',
  );
  await expectOk(
    await userRequest(config, provider, 'provider_service_areas', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        provider_id: provider.id,
        city_id: cityId,
        center: 'SRID=4326;POINT(46.6753 24.7136)',
        radius_m: 40_000,
      }),
    }),
    'provider_area_fixture',
  );
  await expectOk(
    await userRequest(config, provider, `provider_availability?provider_id=eq.${provider.id}`, {
      method: 'DELETE',
      headers: { prefer: 'return=minimal' },
    }),
    'provider_availability_cleanup',
  );
  await expectOk(
    await userRequest(config, provider, 'provider_availability', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify(
        Array.from({ length: 7 }, (_, weekday) => ({
          provider_id: provider.id,
          weekday,
          start_time: '00:00:00',
          end_time: '23:59:59',
        })),
      ),
    }),
    'provider_availability_fixture',
  );
  const publicationKey = `concurrent-publish-${crypto.randomUUID()}`;
  const publication = {
    title: 'Concurrent publication fixture',
    original_text: 'Concurrent publication must create one request.',
    structured_description: 'Concurrent publication must create one request.',
    urgency: 'normal',
    locale: 'en',
    selected_category_slug: 'air-conditioning',
    suggested_category_slug: null,
    category_confirmed_by_user: true,
    category_selection_source: 'manual',
    city_code: 'riyadh',
    exact_location: { latitude: 24.7136, longitude: 46.6753 },
    media: [],
    customer_approved: true,
    idempotency_key: publicationKey,
  };
  const publicationResponses = await Promise.all([
    rpc(config, owner, 'publish_service_request', { payload: publication }),
    rpc(config, owner, 'publish_service_request', { payload: publication }),
  ]);
  const requestIds = await Promise.all(
    publicationResponses.map((response, index) =>
      expectOk(response, `concurrent_publication_${index + 1}`),
    ),
  );
  if (typeof requestIds[0] !== 'string' || requestIds[0] !== requestIds[1]) {
    fail('concurrent_publication_did_not_replay_authoritative_request');
  }
  const requestId = requestIds[0];
  const requestRows = await expectOk(
    await userRequest(
      config,
      owner,
      `service_requests?id=eq.${requestId}&customer_id=eq.${owner.id}&select=id,status,version`,
    ),
    'concurrent_publication_count',
  );
  if (!Array.isArray(requestRows) || requestRows.length !== 1) {
    fail('concurrent_publication_created_duplicate_requests');
  }

  const offerId = await expectOk(
    await rpc(config, provider, 'submit_offer', {
      payload: {
        requestId,
        expectedRequestVersion: requestRows[0].version,
        totalAmountMinor: 12_500,
        visitFeeMinor: 2_500,
        laborAmountMinor: 10_000,
        materialsIncluded: false,
        materialsEstimateMinor: 0,
        estimatedArrivalMinutes: 30,
        estimatedDurationMinutes: 60,
        warrantyDays: 7,
        note: 'Concurrent selection fixture offer',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        idempotencyKey: `fixture-offer-${crypto.randomUUID()}`,
      },
    }),
    'concurrent_offer_fixture',
  );
  if (typeof offerId !== 'string') fail('concurrent_offer_fixture_invalid');
  const selectionKey = `concurrent-select-${crypto.randomUUID()}`;
  const selectionResponses = await Promise.all([
    rpc(config, owner, 'select_offer', {
      p_offer_id: offerId,
      p_idempotency_key: selectionKey,
    }),
    rpc(config, owner, 'select_offer', {
      p_offer_id: offerId,
      p_idempotency_key: selectionKey,
    }),
  ]);
  const jobIds = await Promise.all(
    selectionResponses.map((response, index) =>
      expectOk(response, `concurrent_offer_selection_${index + 1}`),
    ),
  );
  if (typeof jobIds[0] !== 'string' || jobIds[0] !== jobIds[1]) {
    fail('concurrent_offer_selection_did_not_replay_authoritative_job');
  }
  const jobId = jobIds[0];
  const jobRows = await expectOk(
    await userRequest(config, owner, `jobs?request_id=eq.${requestId}&select=id,status`),
    'concurrent_job_count',
  );
  if (!Array.isArray(jobRows) || jobRows.length !== 1 || jobRows[0]?.id !== jobId) {
    fail('concurrent_offer_selection_created_duplicate_jobs');
  }

  for (const [status, reason] of [
    ['scheduled', 'Provider scheduled the fixture job'],
    ['en_route', 'Provider started travel for fixture job'],
    ['arrived', 'Provider arrived for fixture job'],
    ['diagnosing', 'Provider inspected the fixture job'],
    ['in_progress', 'Provider started the fixture work'],
  ]) {
    await expectOk(
      await rpc(config, provider, 'transition_job', {
        p_job_id: jobId,
        p_to_status: status,
        p_reason: reason,
        p_idempotency_key: `fixture-transition-${status}-${crypto.randomUUID()}`,
      }),
      `completion_rejection_fixture_${status}`,
    );
  }
  const proof = await createCleanCompletionProof(config, provider, jobId);
  await expectOk(
    await rpc(config, provider, 'submit_completion', {
      p_job_id: jobId,
      p_proofs: [proof],
      p_idempotency_key: `fixture-completion-${crypto.randomUUID()}`,
    }),
    'completion_rejection_fixture_submission',
  );
  const rejectionKey = `concurrent-rejection-${crypto.randomUUID()}`;
  const rejectionPayload = {
    p_job_id: jobId,
    p_accept: false,
    p_reason: 'Completion evidence does not match the agreed work.',
    p_score: null,
    p_review: null,
    p_idempotency_key: rejectionKey,
    p_evidence_upload_ids: [],
  };
  const rejectionResponses = await Promise.all([
    rpc(config, owner, 'accept_completion', rejectionPayload),
    rpc(config, owner, 'accept_completion', rejectionPayload),
  ]);
  const rejectionResults = await Promise.all(
    rejectionResponses.map((response, index) =>
      expectOk(response, `concurrent_completion_rejection_${index + 1}`),
    ),
  );
  if (
    !rejectionResults[0]?.disputeId ||
    rejectionResults[0].disputeId !== rejectionResults[1]?.disputeId
  ) {
    fail('concurrent_completion_rejection_did_not_replay_authoritative_dispute');
  }
  const disputeRows = await expectOk(
    await userRequest(config, owner, `disputes?job_id=eq.${jobId}&select=id,status`),
    'concurrent_dispute_count',
  );
  if (
    !Array.isArray(disputeRows) ||
    disputeRows.length !== 1 ||
    disputeRows[0]?.id !== rejectionResults[0].disputeId
  ) {
    fail('concurrent_completion_rejection_created_duplicate_disputes');
  }
  const logicalNotificationCount = runLocalDatabaseFixture(`
    select count(*)
    from public.notification_outbox
    where user_id='${provider.id}'::uuid
      and event_type='completion_rejected_dispute_opened'
      and payload->>'jobId'='${jobId}'
      and logical_notification_id=id;
  `);
  if (logicalNotificationCount !== '1') {
    fail('concurrent_completion_rejection_created_duplicate_logical_notifications');
  }
  const conflict = await rpc(config, owner, 'accept_completion', {
    ...rejectionPayload,
    p_reason: 'A conflicting completion rejection payload.',
  });
  const conflictBody = await readBody(conflict);
  if (conflict.ok || !JSON.stringify(conflictBody).includes('IDEMPOTENCY_KEY_CONFLICT')) {
    fail('completion_rejection_idempotency_conflict_not_enforced');
  }
}

async function runSavedLocationDefaultFlow(config, owner) {
  const firstId = crypto.randomUUID();
  const secondId = crypto.randomUUID();
  const base = {
    label: 'Synthetic location',
    formattedAddress: 'Synthetic Riyadh integration address',
    building: '',
    unit: '',
    accessNotes: '',
    cityCode: 'riyadh',
    coordinates: { latitude: 24.7136, longitude: 46.6753 },
  };
  await expectOk(
    await rpc(config, owner, 'upsert_my_saved_address', {
      payload: { ...base, id: firstId, isDefault: true },
    }),
    'saved_location_first',
  );
  await expectOk(
    await rpc(config, owner, 'upsert_my_saved_address', {
      payload: {
        ...base,
        id: secondId,
        formattedAddress: 'Second synthetic Riyadh integration address',
        isDefault: false,
      },
    }),
    'saved_location_second',
  );
  const firstDefault = rpc(config, owner, 'make_my_saved_address_default', {
    p_address_id: firstId,
  });
  const secondDefault = rpc(config, owner, 'make_my_saved_address_default', {
    p_address_id: secondId,
  });
  await Promise.all([
    firstDefault.then((response) => expectOk(response, 'saved_location_concurrent_default_first')),
    secondDefault.then((response) =>
      expectOk(response, 'saved_location_concurrent_default_second'),
    ),
  ]);
  const addresses = await expectOk(
    await rpc(config, owner, 'list_my_saved_addresses', {}),
    'saved_location_list_after_concurrency',
  );
  if (
    !Array.isArray(addresses) ||
    addresses.filter((address) => address?.isDefault === true).length !== 1
  ) {
    fail('saved_location_default_invariant_failed');
  }
  const resolution = await expectOk(
    await rpc(config, owner, 'resolve_service_location', {
      p_latitude: 21.5433,
      p_longitude: 39.1728,
    }),
    'jeddah_location_resolution',
  );
  if (resolution?.status !== 'supported' || resolution?.city?.code !== 'jeddah') {
    fail('jeddah_location_resolution_invalid');
  }
}

export async function runLocalSupabaseFlows(config) {
  const owner = await createUser(config, 'local-owner');
  const outsider = await createUser(config, 'local-outsider');
  const provider = await signInUser(
    config,
    'provider.demo@example.invalid',
    'LocalProviderE2E-Only!2026',
  );
  await runSavedLocationDefaultFlow(config, owner);
  await runStorageFlow(config, owner, outsider);
  await runAiPublicationFlow(config, owner);
  await runConcurrentIdempotencyFlow(config, owner, provider);
  console.log(
    'Local Supabase integration: PASS (location authority + storage + AI + true concurrent idempotency)',
  );
}

export async function runLocalSupabaseIntegration(options = {}) {
  const config = localEnvironment();
  let generatedEnvironmentDirectory;
  let functionServer;
  try {
    let envFile = options.envFile;
    if (!envFile) {
      generatedEnvironmentDirectory = await mkdtemp(join(tmpdir(), 'sallah-local-functions-'));
      envFile = join(generatedEnvironmentDirectory, '.env.test');
      await writeFile(envFile, localTestFunctionEnvironment(), { mode: 0o600 });
    }
    functionServer = await ensureFunctions(config, { ...options, envFile });
    await runLocalSupabaseFlows(config);
  } finally {
    await stopFunctions(functionServer);
    if (generatedEnvironmentDirectory) {
      await rm(generatedEnvironmentDirectory, { recursive: true, force: true });
    }
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) await runLocalSupabaseIntegration();
