export type PulseTransport = 'fetch' | 'beacon';

export interface PulseInitOptions {
  endpoint?: string;
  transport?: PulseTransport;
}

export interface PulseConfiguration {
  endpoint: string;
  transport: PulseTransport;
}

export interface PulseClient {
  init(options?: PulseInitOptions): PulseConfiguration;
  isInitialized(): boolean;
  getConfig(): PulseConfiguration | null;
}

const DEFAULT_ENDPOINT = '/api/pulse';
const DEFAULT_TRANSPORT: PulseTransport = 'beacon';

const buildClient = (): PulseClient => {
  let config: PulseConfiguration | null = null;

  const init = (options: PulseInitOptions = {}): PulseConfiguration => {
    config = {
      endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
      transport: options.transport ?? DEFAULT_TRANSPORT
    };

    return config;
  };

  const isInitialized = () => config !== null;
  const getConfig = () => config;

  return {
    init,
    isInitialized,
    getConfig
  };
};

const createClient = (): PulseClient => buildClient();

const pulse = Object.assign(createClient(), {
  createClient
}) as PulseClient & { createClient(): PulseClient };

export default pulse;
