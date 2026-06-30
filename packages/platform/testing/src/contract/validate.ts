import { z } from 'zod';
import { apiErrorEnvelopeSchema, apiSuccessEnvelopeSchema } from './identity-v1';

export function parseSuccessEnvelope<T extends z.ZodTypeAny>(
  body: unknown,
  dataSchema: T,
): z.infer<ReturnType<typeof apiSuccessEnvelopeSchema<T>>> {
  return apiSuccessEnvelopeSchema(dataSchema).parse(body);
}

export function parseErrorEnvelope(body: unknown) {
  return apiErrorEnvelopeSchema.parse(body);
}

export function assertNoExtraTopLevelKeys(body: Record<string, unknown>, allowed: string[]): void {
  const extras = Object.keys(body).filter(k => !allowed.includes(k));
  if (extras.length > 0) {
    throw new Error(`Unexpected top-level fields: ${extras.join(', ')}`);
  }
}

export function assertContractData<T extends z.ZodTypeAny>(
  body: unknown,
  dataSchema: T,
): z.infer<T> {
  const envelope = parseSuccessEnvelope(body, dataSchema);
  assertNoExtraTopLevelKeys(body as Record<string, unknown>, ['success', 'data', 'meta']);
  return envelope.data;
}
