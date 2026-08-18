const encoder = new TextEncoder();

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

export async function workerSecretMatches(
  presented: string | null,
  configured: string | undefined,
): Promise<boolean> {
  if (!presented || !configured || configured.length < 24) return false;
  const [left, right] = await Promise.all([digest(presented), digest(configured)]);
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
