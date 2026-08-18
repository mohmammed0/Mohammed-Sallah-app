# Payment reconciliation

Current launch mode is `offline`/pay after physical service. A database record is not proof of external payment. No settlement is marked captured or paid without an authenticated provider event and finance review.

Daily when a gateway is enabled: import signed provider statements/events, deduplicate by provider event ID, compare authorized/captured/refunded totals to append-only events, compare fees to versioned rules, verify settlements do not exceed net capture, investigate holds/disputes, and record discrepancies. Never edit ledger events; append corrections/reversals.

For each refund or dispute financial action, verify the internal state is `pending_confirmation`, the provider reference is unique, and the confirmed minor-unit amount is positive and no greater than the remaining captured balance. Call the service-role confirmation command once per provider event. A repeat with the same idempotency payload must return the original result; a different amount, reference, or outcome under the same key is an incident and must fail. Confirm that the derived payment state is `partially_refunded` until cumulative refunds equal capture, then `refunded`, and that net accounting equals capture minus confirmed refunds.

For mismatch: stop settlement, open finance case, preserve gateway evidence hashes, determine time window, correct adapter/idempotency, append compensating event, and obtain approval. VAT/ZATCA invoice treatment, merchant account, fees, refund/cancellation policy, and payout timing are human/legal inputs.
