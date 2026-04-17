import { runTransportContract } from './contract-test.js';
import { InMemoryTransport } from './in-memory.js';

runTransportContract(
  'InMemoryTransport',
  async () => new InMemoryTransport({ shards: 4, inflightTimeoutMs: 50 }),
  async (t) => {
    await t.stop();
  },
);
