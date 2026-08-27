/// <reference types="vite/client" />

/**
 * Where this build of the extension points by default.
 *
 * Baked in at build time rather than hardcoded, because the same source produces two
 * very different artifacts: a developer's local build talks to localhost, while the zip
 * the CPHub server hands out through its Download button has to talk to that server.
 * A localhost default in the distributed zip means every user must configure it by hand,
 * and until they do the webapp bridge is never injected — which presents as "extension
 * not detected" rather than as a misconfiguration.
 *
 * deploy/push.sh supplies these from the server's own .env when it rebuilds the zip.
 */
interface ImportMetaEnv {
  readonly VITE_CPHUB_API_URL?: string;
  readonly VITE_CPHUB_WEB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
