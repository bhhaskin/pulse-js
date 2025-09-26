import { describe, expect, it } from 'vitest';

import pulse from '../src/index';

describe('pulse-js', () => {
  it('creates an isolated client instance', () => {
    const client = pulse.createClient();

    expect(client.isInitialized()).toBe(false);

    const config = client.init({ endpoint: '/collect', transport: 'fetch' });

    expect(client.isInitialized()).toBe(true);
    expect(config).toEqual({
      endpoint: '/collect',
      transport: 'fetch'
    });
    expect(client.getConfig()).toEqual(config);
  });

  it('initializes the shared instance with defaults', () => {
    const config = pulse.init();

    expect(config).toEqual({
      endpoint: '/api/pulse',
      transport: 'beacon'
    });
  });

  it('allows overriding defaults', () => {
    const client = pulse.createClient();

    const config = client.init({
      endpoint: '/custom-endpoint',
      transport: 'beacon'
    });

    expect(config).toEqual({
      endpoint: '/custom-endpoint',
      transport: 'beacon'
    });
  });
});
