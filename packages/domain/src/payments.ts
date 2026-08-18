export type PaymentMode = 'offline' | 'fake' | 'sandbox' | 'gateway';
export interface PaymentCommand {
  idempotencyKey: string;
  jobId: string;
  amountMinor: number;
  currency: 'SAR';
}
export interface PaymentResult {
  providerReference: string;
  status: 'pending' | 'authorized' | 'captured' | 'cancelled' | 'refunded' | 'offline';
}
export interface PaymentProvider {
  readonly mode: PaymentMode;
  create(command: PaymentCommand): Promise<PaymentResult>;
  authorize(reference: string): Promise<PaymentResult>;
  capture(reference: string, amountMinor: number): Promise<PaymentResult>;
  cancel(reference: string): Promise<PaymentResult>;
  refund(reference: string, amountMinor: number): Promise<PaymentResult>;
  verifyWebhook(payload: Uint8Array, signature: string): Promise<boolean>;
}

export class OfflinePaymentProvider implements PaymentProvider {
  readonly mode = 'offline' as const;
  create(command: PaymentCommand): Promise<PaymentResult> {
    return Promise.resolve({ providerReference: `offline:${command.jobId}`, status: 'offline' });
  }
  authorize(reference: string): Promise<PaymentResult> {
    return Promise.resolve({ providerReference: reference, status: 'offline' });
  }
  capture(reference: string): Promise<PaymentResult> {
    return Promise.resolve({ providerReference: reference, status: 'offline' });
  }
  cancel(reference: string): Promise<PaymentResult> {
    return Promise.resolve({ providerReference: reference, status: 'cancelled' });
  }
  refund(reference: string): Promise<PaymentResult> {
    return Promise.resolve({ providerReference: reference, status: 'refunded' });
  }
  verifyWebhook(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

export function assertProductionPaymentMode(environment: string, mode: PaymentMode): void {
  if (environment === 'production' && (mode === 'fake' || mode === 'sandbox'))
    throw new Error('UNSAFE_PRODUCTION_PAYMENT_PROVIDER');
}
