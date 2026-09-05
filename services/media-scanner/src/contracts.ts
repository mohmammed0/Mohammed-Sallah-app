import { z } from 'zod';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const SCANNER_SANITIZER_VERSION = '1.0.0' as const;

export const uploadPurposes = [
  'request_media',
  'request_audio',
  'provider_document',
  'completion_proof',
  'support_evidence',
  'message_attachment',
] as const;
export type UploadPurpose = (typeof uploadPurposes)[number];

export const uploadMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'audio/mp4',
  'audio/webm',
  'application/pdf',
] as const;
export type UploadMimeType = (typeof uploadMimeTypes)[number];

export const acceptedImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AcceptedImageMimeType = (typeof acceptedImageMimeTypes)[number];
export const acceptedMediaMimeTypes = [
  ...acceptedImageMimeTypes,
  'audio/mp4',
  'video/mp4',
] as const;
export type AcceptedMediaMimeType = (typeof acceptedMediaMimeTypes)[number];

export const uploadPurposeSchema = z.enum(uploadPurposes);
export const uploadMimeTypeSchema = z.enum(uploadMimeTypes);
export const acceptedImageMimeTypeSchema = z.enum(acceptedImageMimeTypes);
export const acceptedMediaMimeTypeSchema = z.enum(acceptedMediaMimeTypes);

export function isAcceptedImageMimeType(value: UploadMimeType): value is AcceptedImageMimeType {
  return acceptedImageMimeTypes.includes(value as AcceptedImageMimeType);
}

export function isAcceptedMediaMimeType(value: UploadMimeType): value is AcceptedMediaMimeType {
  return acceptedMediaMimeTypes.includes(value as AcceptedMediaMimeType);
}
