export class AiDataConsentRequiredError extends Error {
  constructor() {
    super('AI_DATA_CONSENT_REQUIRED');
  }
}

/** A new or restored intake starts without permission to transfer content to AI. */
export function createAiDataConsentGate() {
  let granted = false;
  return {
    grant() {
      granted = true;
    },
    withdraw() {
      granted = false;
    },
    assertAllowed() {
      if (!granted) throw new AiDataConsentRequiredError();
    },
  };
}
