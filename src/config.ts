import { ensureTrailingSlash } from "./utils";
import { signDerCertficate } from "./const/cert";

declare const __BACKEND_URL__: string;
declare const __NODE_ENV__: string;
declare const __DEVICE_PATH__: string;

export const config = {
  backendUrl: ensureTrailingSlash(__BACKEND_URL__),
  nodeEnv: __NODE_ENV__,
  isDev: __NODE_ENV__ === 'development',
  devicePath: ensureTrailingSlash(__DEVICE_PATH__),
  signDerCertficate: signDerCertficate,
} as const;

export interface ProxyConfig {
  address: string | null;
  port: number | null;
  caCertificate: string | null;
}

export function generateFridaConfigJs(proxy: ProxyConfig): string {
  const certPem = proxy.caCertificate || '';
  const host = proxy.address || '127.0.0.1';
  const port = proxy.port || '8080';

  return `// Automatically generated proxy configuration for Frida scripts
const CERT_PEM = \`${certPem}\`;
const PROXY_HOST = '${host}';
const PROXY_PORT = ${port};
`;

}


