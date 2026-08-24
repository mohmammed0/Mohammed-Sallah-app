import {
  handleMediaAccess,
  messageProxyLifetimeSeconds,
  streamPrivateStorageObject,
} from './index.ts';

Deno.env.set('APP_ENV', 'test');

function assertContract(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

Deno.test('only server-auth functions opt out of gateway JWT verification', async () => {
  const config = await Deno.readTextFile(new URL('../../config.toml', import.meta.url));
  const functionSettings = new Map(
    [...config.matchAll(/\[functions\.([^\]]+)\]\s*\nverify_jwt\s*=\s*(true|false)/g)].map(
      (match) => [match[1], match[2] === 'true'],
    ),
  );
  assertContract(
    functionSettings.get('media-access') === false,
    'media-access must use custom auth',
  );
  assertContract(functionSettings.get('ai-diagnostic') === true, 'ai-diagnostic JWT changed');
  assertContract(functionSettings.get('transcribe') === true, 'transcribe JWT changed');
  assertContract(functionSettings.get('scan-upload') === true, 'scan-upload JWT changed');
  assertContract(
    functionSettings.get('scanner-control') === false,
    'scanner-control custom auth changed',
  );
  assertContract(
    functionSettings.get('translate-provider-brief') === true,
    'translate-provider-brief JWT changed',
  );
  assertContract(functionSettings.get('reauthenticate') === true, 'reauthenticate JWT changed');
  assertContract(functionSettings.get('notification-worker') === false, 'worker auth changed');
  assertContract(functionSettings.get('privacy-worker') === false, 'worker auth changed');
});

Deno.test('media-access keeps explicit POST auth and reauthorizes custom-token GET delivery', async () => {
  const source = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  const handlerStart = source.indexOf('export async function handleMediaAccess');
  const getStart = source.indexOf("request.method === 'GET'", handlerStart);
  const postStart = source.indexOf("request.method !== 'POST'", getStart);
  const getBranch = source.slice(getStart, postStart);
  const postBranch = source.slice(postStart);

  assertContract(getStart > handlerStart, 'GET branch missing');
  assertContract(postStart > getStart, 'POST branch missing');
  assertContract(
    getBranch.indexOf('verifyProxyToken') < getBranch.indexOf("db.rpc('authorize_protected_media'"),
    'GET must validate the HMAC token before database authorization',
  );
  assertContract(
    getBranch.indexOf("db.rpc('authorize_protected_media'") <
      getBranch.indexOf('streamPrivateStorageObject'),
    'GET must reauthorize current database state before streaming',
  );
  assertContract(!getBranch.includes('.download('), 'message GET must not buffer a Storage Blob');
  assertContract(
    !getBranch.includes('.arrayBuffer('),
    'message GET must not buffer an ArrayBuffer',
  );
  assertContract(!getBranch.includes('createSignedUrl'), 'message GET must not mint a storage URL');
  assertContract(
    postBranch.indexOf('authenticatedUser(request)') < postBranch.indexOf('serviceClient()'),
    'POST must authenticate the bearer before creating a privileged client',
  );
});

Deno.test('message proxy links have a tighter bounded lifetime', () => {
  assertContract(messageProxyLifetimeSeconds(60) === 60, 'minimum lifetime changed');
  assertContract(messageProxyLifetimeSeconds(300) === 120, 'message lifetime must cap at 120s');
  assertContract(messageProxyLifetimeSeconds(900) === 120, 'maximum request must stay bounded');
});

Deno.test('authorized message media is streamed from private Storage without Blob buffering', async () => {
  const sourceBody = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('streamed-media'));
      controller.close();
    },
  });
  const upstream = new Response(sourceBody, {
    status: 200,
    headers: { 'content-type': 'image/jpeg', 'content-length': '14' },
  });
  let requestedUrl = '';
  let requestedHeaders: Headers | undefined;
  const result = await streamPrivateStorageObject('message-attachments', 'trust path/item.jpg', {
    supabaseUrl: 'https://project.supabase.co',
    serviceRoleKey: 'test-service-key',
    fetcher: (input, init) => {
      requestedUrl = String(input);
      requestedHeaders = new Headers(init?.headers);
      return Promise.resolve(upstream);
    },
  });

  assertContract(
    requestedUrl ===
      'https://project.supabase.co/storage/v1/object/authenticated/message-attachments/trust%20path/item.jpg',
    `unexpected private Storage URL ${requestedUrl}`,
  );
  assertContract(
    requestedHeaders?.get('authorization') === 'Bearer test-service-key',
    'private Storage stream must use the server credential',
  );
  assertContract(result.body === sourceBody, 'helper must preserve the upstream response stream');
  assertContract(result.headers.get('content-length') === '14', 'upstream length was lost');
});

Deno.test('private Storage fetch aborts when response headers exceed the connect timeout', async () => {
  let requestSignal: AbortSignal | undefined;
  let caught: unknown;
  try {
    await streamPrivateStorageObject(
      'message-attachments',
      'slow-headers.jpg',
      {
        supabaseUrl: 'https://project.supabase.co',
        serviceRoleKey: 'test-service-key',
        connectTimeoutMs: 5,
        fetcher: (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            requestSignal = init?.signal ?? undefined;
            if (!requestSignal) {
              reject(new Error('MISSING_ABORT_SIGNAL'));
              return;
            }
            const timeoutNotEnforced = setTimeout(
              () => reject(new Error('CONNECT_TIMEOUT_NOT_ENFORCED')),
              30,
            );
            requestSignal.addEventListener('abort', () => {
              clearTimeout(timeoutNotEnforced);
              reject(requestSignal?.reason ?? new DOMException('Aborted', 'AbortError'));
            }, { once: true });
          }),
      } as Parameters<typeof streamPrivateStorageObject>[2],
    );
  } catch (error) {
    caught = error;
  }

  assertContract(requestSignal?.aborted === true, 'slow headers must abort the Storage request');
  assertContract(
    caught instanceof DOMException && caught.name === 'AbortError',
    `unexpected slow-header failure ${String(caught)}`,
  );
});

Deno.test('private Storage connect timeout is cleared before a backpressured body is read', async () => {
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 5);
    return controller.signal;
  };

  try {
    let requestSignal: AbortSignal | undefined;
    let pullCount = 0;
    const sourceBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount += 1;
        if (pullCount === 1) {
          controller.enqueue(new TextEncoder().encode('first-'));
          return;
        }
        if (requestSignal?.aborted) {
          controller.error(new Error('BODY_TRUNCATED_BY_CONNECT_TIMEOUT'));
          return;
        }
        controller.enqueue(new TextEncoder().encode('second'));
        controller.close();
      },
    }, { highWaterMark: 0 });
    const result = await streamPrivateStorageObject(
      'message-attachments',
      'slow-body.jpg',
      {
        supabaseUrl: 'https://project.supabase.co',
        serviceRoleKey: 'test-service-key',
        connectTimeoutMs: 5,
        fetcher: (_input, init) => {
          requestSignal = init?.signal ?? undefined;
          return Promise.resolve(new Response(sourceBody, { status: 200 }));
        },
      } as Parameters<typeof streamPrivateStorageObject>[2],
    );

    const reader = result.body?.getReader();
    assertContract(Boolean(reader), 'streaming response body is required');
    const first = await reader!.read();
    await wait(15);
    assertContract(
      requestSignal?.aborted === false,
      'connect timeout must be disarmed once response headers arrive',
    );
    const second = await reader!.read();
    const complete = new TextDecoder().decode(first.value) + new TextDecoder().decode(second.value);
    assertContract(complete === 'first-second', `slow body was truncated: ${complete}`);
    assertContract(second.done === false, 'second body chunk was not delivered');
    assertContract((await reader!.read()).done, 'stream did not close after the final chunk');
  } finally {
    AbortSignal.timeout = originalTimeout;
  }
});

Deno.test('private Storage preserves the bounded error for an upstream non-OK response', async () => {
  let requestSignal: AbortSignal | undefined;
  let caught: unknown;
  try {
    await streamPrivateStorageObject(
      'message-attachments',
      'forbidden.jpg',
      {
        supabaseUrl: 'https://project.supabase.co',
        serviceRoleKey: 'test-service-key',
        connectTimeoutMs: 5,
        fetcher: (_input, init) => {
          requestSignal = init?.signal ?? undefined;
          return Promise.resolve(new Response('forbidden', { status: 403 }));
        },
      } as Parameters<typeof streamPrivateStorageObject>[2],
    );
  } catch (error) {
    caught = error;
  }
  await wait(15);

  assertContract(
    caught instanceof Error && caught.message === 'MEDIA_ACCESS_DENIED',
    `unexpected non-OK failure ${String(caught)}`,
  );
  assertContract(
    requestSignal?.aborted === false,
    'header timeout must also be disarmed for non-OK upstream responses',
  );
});

Deno.test('media-access rejects an unauthenticated POST inside the custom-auth handler', async () => {
  const response = await handleMediaAccess(
    new Request('http://localhost/functions/v1/media-access', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        uploadId: '11111111-1111-4111-8111-111111111111',
        expiresInSeconds: 300,
      }),
    }),
  );
  const body = await response.json() as { code?: string };
  assertContract(response.status === 401, `unexpected unauthenticated status ${response.status}`);
  assertContract(body.code === 'AUTH_REQUIRED', 'unauthenticated POST must fail as AUTH_REQUIRED');
});
