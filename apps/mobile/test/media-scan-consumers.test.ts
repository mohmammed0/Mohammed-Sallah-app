import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const onboarding = readFileSync(new URL('../app/provider/onboarding.tsx', import.meta.url), 'utf8');
const composer = readFileSync(
  new URL('../src/features/request/request-composer.tsx', import.meta.url),
  'utf8',
);
const jobs = readFileSync(new URL('../app/jobs.tsx', import.meta.url), 'utf8');
const messages = readFileSync(new URL('../app/messages.tsx', import.meta.url), 'utf8');

describe('V2 safe media-scan consumers', () => {
  it('provider onboarding sends only uploadId and documentType evidence', () => {
    const documentsStart = onboarding.indexOf('documents: uploadedDocuments.map');
    const documentsEnd = onboarding.indexOf('};', documentsStart);
    const projection = onboarding.slice(documentsStart, documentsEnd);
    expect(projection).toContain('uploadId: upload.uploadId');
    expect(projection).toContain('documentType:');
    expect(projection).not.toContain('storagePath');
    expect(projection).not.toContain('contentHash');
    expect(projection).not.toContain('mimeType');
    expect(projection).not.toContain('sizeBytes');
    expect(onboarding).toContain('recoveryKey: `provider-document:${documentType}:${index + 1}`');
  });

  it('request composer scans voice before transcription and sends only the clean upload ID', () => {
    expect(composer).not.toContain('VOICE_MEDIA_SCANNING_UNAVAILABLE');
    expect(composer).not.toContain('voiceUpload.storagePath');
    expect(composer).not.toContain('body: { storagePath: voiceStoragePath');
    expect(composer).toContain("functions.invoke<unknown>('transcribe'");
    expect(composer).toContain('uploadId: voiceUploadId');
    expect(composer).toContain("media.kind === 'image' ? 'request_media' : 'request_audio'");
    expect(composer).toContain('`request-media:${media.id}`');
  });

  it('completion evidence sends only the upload reference and description', () => {
    const proofsStart = jobs.indexOf('const proofs = [');
    const proofsEnd = jobs.indexOf('];', proofsStart);
    const projection = jobs.slice(proofsStart, proofsEnd);
    expect(projection).toContain('uploadId: upload.uploadId');
    expect(projection).toContain("description: t('completionEvidenceDescription')");
    expect(projection).not.toContain('storagePath');
    expect(projection).not.toContain('contentHash');
    expect(projection).not.toContain('mimeType');
    expect(projection).not.toContain('sizeBytes');
    expect(jobs).toContain("mediaTypes: ['images', 'videos']");
    expect(jobs).toContain("mimeType === 'video/mp4'");
    expect(jobs).toContain('recoveryKey: `completion-proof:${job.id}:${job.version}`');
  });

  it('message attachments bind the conversation while secure upload binds the exact bytes', () => {
    expect(messages).toContain('recoveryKey: `message-attachment:${activeConversationId}`');
    expect(messages).toContain('bytes,');
  });
});
