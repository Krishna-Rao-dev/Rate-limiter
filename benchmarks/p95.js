import { performance } from 'node:perf_hooks';

// --- Configuration ---
const TOTAL_REQUESTS = 10000;
const CONCURRENCY = 50;
const TARGET_URL = 'http://localhost:3000/test';

// --- Target Async Function ---
async function makeRequest() {
  const start = performance.now();
  
  try {
    const res = await fetch(TARGET_URL);
    await res.text(); // Ensure body is consumed
  } catch (err) {
    // Handle or log connection errors if needed
  }
  
  const end = performance.now();
  return end - start; // Latency in milliseconds
}

// --- Percentile Calculation Utility ---
function getPercentile(sortedArray, percentile) {
  if (sortedArray.length === 0) return 0;
  
  // Rank index formula: (N - 1) * P
  const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
  return sortedArray[Math.max(0, index)];
}

// --- Benchmark Runner ---
async function runBenchmark() {
  console.log(`Starting benchmark: ${TOTAL_REQUESTS} total requests (${CONCURRENCY} concurrent)...`);
  
  const latencies = [];
  let completed = 0;

  // Worker pool generator
  async function worker() {
    while (completed < TOTAL_REQUESTS) {
      completed++;
      const duration = await makeRequest();
      latencies.push(duration);
    }
  }

  const startTime = performance.now();

  // Run workers concurrently
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  const totalTimeSec = (performance.now() - startTime) / 1000;

  // --- Process & Sort Metrics ---
  // Sorting is required to extract true percentile ranks
  latencies.sort((a, b) => a - b);

  const sum = latencies.reduce((acc, val) => acc + val, 0);
  const avg = sum / latencies.length;
  const p50 = getPercentile(latencies, 50);
  const p95 = getPercentile(latencies, 95);
  const p99 = getPercentile(latencies, 99);
  const rps = TOTAL_REQUESTS / totalTimeSec;

  // --- Display Results ---
  console.log('\n--- Benchmark Results ---');
  console.log(`Total Time:     ${totalTimeSec.toFixed(2)}s`);
  console.log(`Throughput:     ${rps.toFixed(2)} req/sec`);
  console.log(`Min Latency:    ${latencies[0].toFixed(2)} ms`);
  console.log(`Average:        ${avg.toFixed(2)} ms`);
  console.log(`p50 (Median):   ${p50.toFixed(2)} ms`);
  console.log(`p95 Latency:    ${p95.toFixed(2)} ms`);
  console.log(`p99 Latency:    ${p99.toFixed(2)} ms`);
  console.log(`Max Latency:    ${latencies[latencies.length - 1].toFixed(2)} ms`);
}

runBenchmark();