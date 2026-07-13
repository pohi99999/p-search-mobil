const { performance } = require('perf_hooks');

async function mockSupabaseCall(delay) {
  return new Promise(resolve => setTimeout(() => resolve({ data: 'mock', error: null }), delay));
}

async function sequential(delay1, delay2) {
  const start = performance.now();
  const res1 = await mockSupabaseCall(delay1);
  const res2 = await mockSupabaseCall(delay2);
  const end = performance.now();
  return end - start;
}

async function concurrent(delay1, delay2) {
  const start = performance.now();
  const [res1, res2] = await Promise.all([
    mockSupabaseCall(delay1),
    mockSupabaseCall(delay2)
  ]);
  const end = performance.now();
  return end - start;
}

async function run() {
  const delay1 = 200;
  const delay2 = 150;

  const seqTime = await sequential(delay1, delay2);
  const concTime = await concurrent(delay1, delay2);

  console.log(`Sequential: ${seqTime.toFixed(2)} ms`);
  console.log(`Concurrent: ${concTime.toFixed(2)} ms`);
  console.log(`Improvement: ${(seqTime - concTime).toFixed(2)} ms (${((seqTime - concTime) / seqTime * 100).toFixed(2)}%)`);
}

run();
