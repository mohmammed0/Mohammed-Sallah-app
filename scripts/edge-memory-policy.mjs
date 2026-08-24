const MiB = 1024 * 1024;
const tenMiB = 10 * MiB;
const twentyMiB = 20 * MiB;

export const edgeHardCeilingBytes = 128 * MiB;
export const edgeRssGrowthLimitBytes = 8 * MiB;
export const edgeManagedGrowthLimitBytes = 4 * MiB;
export const minimumSamplesPerScenario = 5;

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function numeric(sample, key) {
  const value = sample[key];
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`EDGE_MEMORY_SAMPLE_INVALID:${key}`);
  }
  return value;
}

function sampleGrowth(sample, baselineKey, peakKey) {
  const baseline = numeric(sample, baselineKey);
  const peak = numeric(sample, peakKey);
  if (peak < baseline) throw new Error(`EDGE_MEMORY_SAMPLE_INVALID:${peakKey}`);
  return peak - baseline;
}

function assertMetric(tenSamples, twentySamples, key, limit, errorCode) {
  const tenMedian = median(tenSamples.map((sample) => numeric(sample, key)));
  const twentyMedian = median(twentySamples.map((sample) => numeric(sample, key)));
  if (Math.abs(twentyMedian - tenMedian) > limit) throw new Error(errorCode);
  return { tenMedian, twentyMedian, delta: twentyMedian - tenMedian };
}

function assertGrowth(tenSamples, twentySamples, baselineKey, peakKey, limit, errorCode) {
  const tenMedian = median(tenSamples.map((sample) => sampleGrowth(sample, baselineKey, peakKey)));
  const twentyMedian = median(
    twentySamples.map((sample) => sampleGrowth(sample, baselineKey, peakKey)),
  );
  if (Math.abs(twentyMedian - tenMedian) > limit) throw new Error(errorCode);
  return { tenMedian, twentyMedian, delta: twentyMedian - tenMedian };
}

export function evaluateEdgeMemorySamples(samples) {
  if (!Array.isArray(samples)) throw new Error('EDGE_MEMORY_SAMPLES_INVALID');
  const tenSamples = samples.filter(
    (sample) => sample.inputSize === tenMiB && sample.outputSize === tenMiB,
  );
  const twentySamples = samples.filter(
    (sample) => sample.inputSize === twentyMiB && sample.outputSize === twentyMiB,
  );
  if (
    tenSamples.length < minimumSamplesPerScenario ||
    twentySamples.length < minimumSamplesPerScenario
  ) {
    throw new Error('EDGE_MEMORY_SAMPLE_COUNT');
  }

  for (const sample of [...tenSamples, ...twentySamples]) {
    if (
      sample.handlerStatus !== 200 ||
      sample.rpcCalls < 3 ||
      sample.signedUploadCalls !== 1 ||
      sample.sampleCount < 2
    ) {
      throw new Error('EDGE_MEMORY_HANDLER_EVIDENCE_INVALID');
    }
    for (const key of [
      'processId',
      'baselineRssBytes',
      'peakRssBytes',
      'baselineHeapBytes',
      'peakHeapBytes',
      'baselineHeapTotalBytes',
      'peakHeapTotalBytes',
      'baselineExternalBytes',
      'peakExternalBytes',
      'encodedBytes',
      'responseBytes',
    ]) {
      numeric(sample, key);
    }
  }

  const processIds = new Set(samples.map((sample) => sample.processId));
  if (processIds.size !== samples.length) throw new Error('EDGE_MEMORY_PROCESS_ISOLATION');

  const encodedSizes = new Set(samples.map((sample) => sample.encodedBytes));
  if (encodedSizes.size !== 1) throw new Error('EDGE_MEMORY_METADATA_ENCODING_GROWTH');
  const hardPeakRssBytes = Math.max(...samples.map((sample) => sample.peakRssBytes));
  if (hardPeakRssBytes > edgeHardCeilingBytes) throw new Error('EDGE_MEMORY_HARD_CEILING');
  const arrayBufferSamples = samples.filter((sample) => 'peakArrayBufferBytes' in sample);
  if (arrayBufferSamples.length !== 0 && arrayBufferSamples.length !== samples.length) {
    throw new Error('EDGE_MEMORY_ARRAY_BUFFER_EVIDENCE_INCONSISTENT');
  }

  return {
    sampleCount: samples.length,
    hardPeakRssBytes,
    rssBaseline: assertMetric(
      tenSamples,
      twentySamples,
      'baselineRssBytes',
      edgeRssGrowthLimitBytes,
      'EDGE_MEMORY_RSS_BASELINE_GROWTH',
    ),
    rssPeak: assertMetric(
      tenSamples,
      twentySamples,
      'peakRssBytes',
      edgeRssGrowthLimitBytes,
      'EDGE_MEMORY_RSS_PEAK_GROWTH',
    ),
    rssGrowth: assertGrowth(
      tenSamples,
      twentySamples,
      'baselineRssBytes',
      'peakRssBytes',
      edgeRssGrowthLimitBytes,
      'EDGE_MEMORY_RSS_GROWTH',
    ),
    heapBaseline: assertMetric(
      tenSamples,
      twentySamples,
      'baselineHeapBytes',
      edgeManagedGrowthLimitBytes,
      'EDGE_MEMORY_HEAP_BASELINE_GROWTH',
    ),
    heapPeak: assertMetric(
      tenSamples,
      twentySamples,
      'peakHeapBytes',
      edgeManagedGrowthLimitBytes,
      'EDGE_MEMORY_HEAP_PEAK_GROWTH',
    ),
    heapGrowth: assertGrowth(
      tenSamples,
      twentySamples,
      'baselineHeapBytes',
      'peakHeapBytes',
      edgeManagedGrowthLimitBytes,
      'EDGE_MEMORY_HEAP_GROWTH',
    ),
    externalBaseline: assertMetric(
      tenSamples,
      twentySamples,
      'baselineExternalBytes',
      edgeManagedGrowthLimitBytes,
      'EDGE_MEMORY_EXTERNAL_BASELINE_GROWTH',
    ),
    externalPeak: assertMetric(
      tenSamples,
      twentySamples,
      'peakExternalBytes',
      edgeManagedGrowthLimitBytes,
      'EDGE_MEMORY_EXTERNAL_PEAK_GROWTH',
    ),
    externalGrowth: assertGrowth(
      tenSamples,
      twentySamples,
      'baselineExternalBytes',
      'peakExternalBytes',
      edgeManagedGrowthLimitBytes,
      'EDGE_MEMORY_EXTERNAL_GROWTH',
    ),
    arrayBuffers:
      arrayBufferSamples.length === 0
        ? { available: false }
        : {
            available: true,
            baseline: assertMetric(
              tenSamples,
              twentySamples,
              'baselineArrayBufferBytes',
              edgeManagedGrowthLimitBytes,
              'EDGE_MEMORY_ARRAY_BUFFER_BASELINE_GROWTH',
            ),
            peak: assertMetric(
              tenSamples,
              twentySamples,
              'peakArrayBufferBytes',
              edgeManagedGrowthLimitBytes,
              'EDGE_MEMORY_ARRAY_BUFFER_PEAK_GROWTH',
            ),
            growth: assertGrowth(
              tenSamples,
              twentySamples,
              'baselineArrayBufferBytes',
              'peakArrayBufferBytes',
              edgeManagedGrowthLimitBytes,
              'EDGE_MEMORY_ARRAY_BUFFER_GROWTH',
            ),
          },
  };
}
