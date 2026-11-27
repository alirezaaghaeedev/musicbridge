import { ProviderError } from "./providers";
export type Transport = typeof fetch;
export async function request(
  transport: Transport,
  url: string,
  init: RequestInit,
  timeout: number,
  mutation = false,
): Promise<unknown> {
  let response: Response;
  try {
    response = await transport(url, {
      ...init,
      // workerd supports manual/follow only. Reject 3xx below without forwarding credentials.
      redirect: "manual",
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new ProviderError("NETWORK", 0, 0, mutation);
  }
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    const rawDelay = retry
      ? Number.isFinite(Number(retry))
        ? Number(retry)
        : Math.max(0, (Date.parse(retry) - Date.now()) / 1000)
      : 0;
    const delay = Number.isFinite(rawDelay) ? Math.max(0, rawDelay) : 0;
    let providerCode: string | undefined;
    if (
      new URL(url).hostname === "api.spotify.com" &&
      response.status === 429
    ) {
      try {
        const reader = response.body?.getReader();
        let size = 0;
        const chunks: Uint8Array[] = [];
        if (reader) {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.length;
            if (size > 4096) {
              await reader.cancel();
              break;
            }
            chunks.push(chunk.value);
          }
          if (size <= 4096) {
            const bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) {
              bytes.set(chunk, offset);
              offset += chunk.length;
            }
            const body = JSON.parse(new TextDecoder().decode(bytes)) as {
              error?: { reason?: unknown };
            };
            // Allowlisted machine codes only; no messages or credentials retained.
            if (body.error?.reason === "QUOTA_EXCEEDED")
              providerCode = "QUOTA_EXCEEDED";
          }
        }
      } catch {
        /* Optional error detail was absent or malformed. */
      }
    }
    throw new ProviderError(
      response.status === 401
        ? "REAUTH_REQUIRED"
        : response.status === 429
          ? (providerCode ?? "RATE_LIMITED")
          : `PROVIDER_${response.status}`,
      response.status,
      delay,
      mutation && response.status >= 500,
      providerCode,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new ProviderError("INVALID_RESPONSE", 502, 0, mutation);
  }
}
