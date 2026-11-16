/** Conservative inventory bounds; neither these counts nor gzip estimates are network measurements. */
export function payloadInventory(records, startupJS) {
  const runtime = records.filter(record => !record.file.endsWith('AGENTS.md'));
  const scripts = runtime.filter(record => record.file.startsWith('assets/') && record.file.endsWith('.js'));
  const publicAssets = runtime.filter(record => !record.file.startsWith('assets/'));
  // Vite emits WASM, CSS, images and font files beside JS. Their loading cannot be
  // inferred from JavaScript's static import graph, so retain all in this bound.
  const emittedAssets = runtime.filter(record => record.file.startsWith('assets/') && !record.file.endsWith('.js'));
  return {
    runtime, scripts, publicAssets, emittedAssets,
    initial: [...scripts.filter(record => startupJS.has(record.file)), ...publicAssets, ...emittedAssets],
    deferred: scripts.filter(record => !startupJS.has(record.file)),
  };
}

/** Retain source, PMREM output and generator target for every packaged HDR. */
export function hdrTextureEstimate(file, bytes) {
  const header = bytes.subarray(0, 400).toString('latin1').match(/-Y\s+(\d+)\s+\+X\s+(\d+)/);
  if (!header) throw new Error(`Cannot parse HDR dimensions: ${file}`);
  const height = Number(header[1]), width = Number(header[2]);
  if (width < 4 || height < 1) throw new Error(`Invalid HDR dimensions: ${file}`);
  const cubeSize = 2 ** Math.floor(Math.log2(width / 4));
  const pmremWidth = 3 * Math.max(cubeSize, 112), pmremHeight = 4 * cubeSize;
  return {
    file, width, height, sourceBytes: width * height * 8, cubeSize, pmremWidth, pmremHeight,
    pmremTargetBytes: pmremWidth * pmremHeight * 8,
    retainedPingPongBytes: pmremWidth * pmremHeight * 8,
  };
}
