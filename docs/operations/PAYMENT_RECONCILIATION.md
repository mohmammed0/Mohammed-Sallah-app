# Payment reconciliation

Current launch mode is `offline`/pay after physical service. A database record is not proof of external payment. No settlement is marked captured or paid without an authenticated provider event and finance review.

Daily when a gateway is enabled: import signed provider statements/events, deduplicate by provider event ID, compare authorized/captured/refunded totals to append-only events, compare fees to versioned rules, verify settlements do not exceed net capture, investigate holds/disputes, and record discrepancies. Never edit ledger events; append corrections/reversals.

For mismatch: stop settlement, open finance case, preserve gateway evidence hashes, determine time window, correct adapter/idempotency, append compensating event, and obtain approval. VAT/ZATCA invoice treatment, merchant account, fees, refund/cancellation policy, and payout timing are human/legal inputs.
