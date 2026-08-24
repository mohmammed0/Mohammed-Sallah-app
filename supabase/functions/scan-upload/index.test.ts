import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  createScanUploadHandler,
  type ScanUploadDependencies,
  type UserScanClient,
} from './index.ts';
import { mediaScanningControlPlaneModules } from '../_shared/media-scanning-scope.ts';

const uploadId = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';

class FakeUserClient implements UserScanClient {
  readonly calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  error: unknown = null;
  response: unknown = {
    uploadId,
    status: 'queued',
    terminalCategory: null,
    sanitized: null,
    mimeType: null,
    sizeBytes: null,
    retryAt: null,
    createdAt: '2026-08-21T12:00:00.000Z',
    updatedAt: '2026-08-21T12:00:00.000Z',
  };
  rpc(name: string, args: Record<string, unknown>) {
    this.calls.push({ name, args });
    return Promise.resolve({ data: this.response, error: this.error });
  }
}

function request(body: unknown): Request {
  return new Request('http://localhost/functions/v1/scan-upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer user-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function dependencies(fake: FakeUserClient): ScanUploadDependencies {
  return {
    authenticate: () => Promise.resolve({ id: '33333333-3333-4333-8333-333333333333' }),
    createUserClient: () => fake,
    appEnvironment: () => 'test',
    log: () => undefined,
  };
}

Deno.test('scan-upload queues with exact operation UUID and returns only safe owner state', async () => {
  const fake = new FakeUserClient();
  const response = await createScanUploadHandler(dependencies(fake))(
    request({ uploadId, action: 'start', operationId }),
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    uploadId,
    status: 'queued',
    terminalCategory: null,
    sanitized: null,
    mimeType: null,
    sizeBytes: null,
    retryAt: null,
  });
  assertEquals(fake.calls, [{
    name: 'start_or_get_media_scan',
    args: { p_upload_id: uploadId, p_operation_id: operationId },
  }]);
});

Deno.test('scan-upload maps only authoritative missing quarantine to a safe terminal ticket response', async () => {
  const fake = new FakeUserClient();
  fake.response = null;
  fake.error = { message: 'QUARANTINE_UPLOAD_INCOMPLETE' };
  const response = await createScanUploadHandler(dependencies(fake))(
    request({ uploadId, action: 'start', operationId }),
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    uploadId,
    status: 'terminal_failure',
    terminalCategory: 'quarantine_upload_incomplete',
    sanitized: false,
    mimeType: null,
    sizeBytes: null,
    retryAt: null,
  });
});

Deno.test('scan-upload reconstructs clean status through read-only owner polling', async () => {
  const fake = new FakeUserClient();
  fake.response = {
    uploadId,
    status: 'clean',
    terminalCategory: null,
    sanitized: true,
    mimeType: 'image/png',
    sizeBytes: 1024,
    retryAt: null,
    createdAt: '2026-08-21T12:00:00.000Z',
    updatedAt: '2026-08-21T12:01:00.000Z',
  };
  const response = await createScanUploadHandler(dependencies(fake))(
    request({ uploadId, action: 'status' }),
  );
  assertEquals(await response.json(), {
    uploadId,
    status: 'clean',
    terminalCategory: null,
    sanitized: true,
    mimeType: 'image/png',
    sizeBytes: 1024,
    retryAt: null,
  });
  assertEquals(fake.calls, [{
    name: 'get_my_file_upload_status',
    args: { p_upload_id: uploadId },
  }]);
});

Deno.test('scan-upload returns the same bounded owner-safe clean projection for approved audio and video', async () => {
  for (const mimeType of ['audio/mp4', 'video/mp4'] as const) {
    const fake = new FakeUserClient();
    fake.response = {
      uploadId,
      status: 'clean',
      terminalCategory: null,
      sanitized: true,
      mimeType,
      sizeBytes: 4096,
      retryAt: null,
      createdAt: '2026-08-21T12:00:00.000Z',
      updatedAt: '2026-08-21T12:01:00.000Z',
    };
    const response = await createScanUploadHandler(dependencies(fake))(
      request({ uploadId, action: 'status' }),
    );
    assertEquals(response.status, 200);
    assertEquals(await response.json(), {
      uploadId,
      status: 'clean',
      terminalCategory: null,
      sanitized: true,
      mimeType,
      sizeBytes: 4096,
      retryAt: null,
    });
  }
});

Deno.test('scan-upload rejects media-like body fields before creating a user database client', async () => {
  const fake = new FakeUserClient();
  let created = 0;
  const deps = dependencies(fake);
  deps.createUserClient = () => {
    created += 1;
    return fake;
  };
  const response = await createScanUploadHandler(deps)(
    request({ uploadId, action: 'start', operationId, outputBase64: 'AA==' }),
  );
  assertEquals(response.status, 400);
  assertEquals(created, 0);
  assertEquals(fake.calls, []);
});

Deno.test('scan-upload fails closed when APP_ENV is absent before database privilege', async () => {
  const fake = new FakeUserClient();
  const deps = dependencies(fake);
  deps.appEnvironment = () => undefined;
  const response = await createScanUploadHandler(deps)(
    request({ uploadId, action: 'status' }),
  );
  assertEquals(response.status, 503);
  assertEquals(fake.calls, []);
});

Deno.test('every hosted media-scan control-plane module is explicitly inventoried and body-free', async () => {
  assertEquals(mediaScanningControlPlaneModules, [
    'scan-upload/index.ts',
    'scanner-control/index.ts',
    '_shared/s3-capability.ts',
    '_shared/scanner-control.ts',
    '_shared/upload-security.ts',
    '_shared/privacy.ts',
    'privacy-worker/index.ts',
  ]);
  const sources = await Promise.all(
    mediaScanningControlPlaneModules.map(async (name) =>
      [
        name,
        await Deno.readTextFile(new URL(`../${name}`, import.meta.url)),
      ] as const
    ),
  );
  for (const [name, source] of sources) {
    for (
      const forbidden of [
        '.download(',
        '.arrayBuffer(',
        '.blob(',
        'outputBase64',
        'bytesFromBase64',
        'deterministicScan(',
        'externalScan(',
        'new File(',
      ]
    ) {
      assertEquals(source.includes(forbidden), false, `${name} contains ${forbidden}`);
    }
  }
  const scanUpload = sources.find(([name]) => name === 'scan-upload/index.ts')?.[1] ?? '';
  assertStringIncludes(scanUpload, 'start_or_get_media_scan');
  assertStringIncludes(scanUpload, 'get_my_file_upload_status');
  assertStringIncludes(scanUpload, 'readBoundedJson(request, 4096)');
  assertEquals(scanUpload.includes('request.text()'), false);

  const functionRoot = new URL('../', import.meta.url);
  const discovered: string[] = [];
  for await (const entry of Deno.readDir(functionRoot)) {
    if (!entry.isDirectory || entry.name.startsWith('_')) continue;
    const relative = `${entry.name}/index.ts`;
    const source = await Deno.readTextFile(new URL(relative, functionRoot)).catch(() => '');
    if (
      /start_or_get_media_scan|get_media_scan_attempt_status|claim_media_scan_artifact_cleanup|consume_media_scanner_nonce/
        .test(
          source,
        )
    ) {
      discovered.push(relative);
    }
  }
  assertEquals(
    discovered.sort(),
    mediaScanningControlPlaneModules.filter((name) => name.endsWith('/index.ts')).sort(),
  );
});
