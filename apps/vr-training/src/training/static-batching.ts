/** Only immovable, shared-atlas surfaces. Toggles and held tools stay independent. */
export const STATIC_BATCH_NODES = [
  ['workbench', 0], ['distribution-board', 0],
  ['breaker-sl-1', 1], ['breaker-sl-2', 2], ['breaker-sl-3', 3], ['breaker-sl-4', 4],
  ['proving-unit', 5], ['terminals', 6], ['lock-zone', 7], ['tag-zone', 8],
] as const;

/** Full-scale levels omit the depot bench. Missing catalog nodes must not abort the module. */
export function batchNodesInLevel(hasNode: (name: string) => boolean): Array<readonly [string, number]> {
  return STATIC_BATCH_NODES.filter(([name]) => hasNode(name));
}

export function isBatchableSurface(materialName: string, parentIsNodeRoot: boolean): boolean {
  return parentIsNodeRoot && (materialName === 'CustomPBRAtlas' || materialName === 'CivicOpsHeroAtlas');
}

/** Init-only decoding of glTF normalized/quantized attributes into mergeable floats. */
export function decodeSurfaceAttribute(attribute: {
  count: number; itemSize: number; getComponent(index: number, component: number): number;
}): Float32Array {
  const floats = new Float32Array(attribute.count * attribute.itemSize);
  for (let i = 0; i < attribute.count; i++) {
    for (let c = 0; c < attribute.itemSize; c++) floats[i * attribute.itemSize + c] = attribute.getComponent(i, c);
  }
  return floats;
}

export function fixedTargetGlow(highlighted: boolean, time: number): number {
  return highlighted ? (.4 + .3 * Math.sin(time * 3)) * .22 : 0;
}
