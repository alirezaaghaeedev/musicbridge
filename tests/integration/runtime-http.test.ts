import { beforeAll, expect, it } from "vitest";
import { build } from "esbuild";
import {
  Miniflare,
  Response as WorkerResponse,
  type Request as WorkerRequest,
} from "miniflare";

let script: string;
beforeAll(async () => {
  const result = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import { request } from './src/integrations/http.ts';
        export default { async fetch(incoming) {
          try {
            const value = await request(fetch, 'https://provider.test' + new URL(incoming.url).pathname,
              { method: 'POST', headers: { Authorization: 'Bearer synthetic-provider-token' }, body: '{}' }, 8000);
            return Response.json(value);
          } catch (e) { return Response.json({ code: e.code, status: e.status, retryable: e.retryable }, { status: 502 }); }
        } };`,
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  script = result.outputFiles[0]!.text;
});

it.each([200, 302, 307])(
  "uses native workerd fetch and rejects redirects without forwarding credentials (%s)",
  async (status) => {
    const calls: {
      host: string;
      authorization: string | null;
      body: string;
    }[] = [];
    const mf = new Miniflare({
      modules: true,
      script,
      compatibilityDate: "2026-07-01",
      outboundService: async (request: WorkerRequest) => {
        calls.push({
          host: new URL(request.url).host,
          authorization: request.headers.get("authorization"),
          body: await request.text(),
        });
        return new WorkerResponse(JSON.stringify({ result: "ok" }), {
          status,
          headers: { Location: "https://unexpected.invalid/credential-trap" },
        });
      },
    });
    try {
      const response = await mf.dispatchFetch("http://localhost/probe");
      if (status === 200) {
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ result: "ok" });
      } else {
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({
          code: `PROVIDER_${status}`,
          status,
          retryable: false,
        });
      }
      expect(calls).toEqual([
        {
          host: "provider.test",
          authorization: "Bearer synthetic-provider-token",
          body: "{}",
        },
      ]);
    } finally {
      await mf.dispose();
    }
  },
);
