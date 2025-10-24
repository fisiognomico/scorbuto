declare const __BACKEND_URL__: string;
declare const __NODE_ENV__: string;

export const config = {
  backendUrl: __BACKEND_URL__,
  nodeEnv: __NODE_ENV__,
  isDev: __NODE_ENV__ === 'development',
} as const;
