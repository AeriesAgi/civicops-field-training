/** Assets with a GPU lifetime belonging to a single lesson, never the shared depot. */
export const MODULE_MODEL_IDS: Readonly<Record<string, readonly string[]>> = {
  'elec-loto': ['street-actors', 'electrical-street', 'distribution-board', 'breaker', 'padlock', 'danger-tag', 'voltage-tester', 'proving-unit', 'terminals', 'lock-zone', 'tag-zone'],
  'roads-zone': ['street-actors', 'roads-street', 'roads-cone', 'roads-delineator', 'roads-barrier', 'roads-warning', 'roads-keep-left', 'roads-stop-go', 'roads-marshal', 'roads-bakkie'],
  'water-burst': ['street-actors', 'water-road', 'water-valve-key', 'water-barrier', 'water-sign'],
  'scene-safety': [
    'street-actors', 'fire-street', 'fire-engine', 'fire-ambulance', 'fire-flare', 'fire-mast', 'fire-exclusion',
    'fire-casualty-1', 'fire-casualty-2', 'fire-casualty-3', 'fire-casualty-4',
    'fire-tag-minor', 'fire-tag-delayed', 'fire-tag-immediate', 'fire-tag-expectant',
    'roads-cone', 'roads-car',
  ],
};

/** Room-only rehearsal props; the virtual street is never loaded in AR. */
(MODULE_MODEL_IDS as Record<string, readonly string[]>)['field-assist'] = ['room-rehearsal-kit','emulator-depot-room','water-valve-key'];

export interface DisposableResource { dispose(): void }
export interface ModelResource { geometries: Iterable<DisposableResource>; materials: Iterable<DisposableResource>; textures: Iterable<DisposableResource> }

/** Called after the old level retires. Shared depot maps survive; duplicate handles retire once. */
export function retireModelResources(
  models: Iterable<ModelResource>,
  keep: { materials: ReadonlySet<DisposableResource>; textures: ReadonlySet<DisposableResource> },
): void {
  const geometries = new Set<DisposableResource>(), materials = new Set<DisposableResource>(), textures = new Set<DisposableResource>();
  for (const model of models) {
    for (const geometry of model.geometries) geometries.add(geometry);
    for (const material of model.materials) if (!keep.materials.has(material)) materials.add(material);
    for (const texture of model.textures) if (!keep.textures.has(texture)) textures.add(texture);
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}
