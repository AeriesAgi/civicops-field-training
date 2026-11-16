import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Shape, ShapeGeometry } from '@iwsdk/core';
import type { HazardChip } from '../training/catalog/work-orders';

/** Original flat pictograms, one draw, no image maps. Metres; +Z faces the worker. */
const positions: number[] = [];
const iconIds: number[] = [];
let iconId = 0;
export const selectedDepartmentIcon = { value: 1 };
function polygon(points: number[][], x: number, y: number, targetPositions = positions, targetIds = iconIds, size = .014, depth = .002): void {
  const shape = new Shape();
  points.forEach(([px, py], index) => index ? shape.lineTo(px, py) : shape.moveTo(px, py));
  shape.closePath();
  const source = new ShapeGeometry(shape, 8);
  const expanded = source.index ? source.toNonIndexed() : source;
  const attribute = expanded.getAttribute('position');
  for (let i = 0; i < attribute.count; i++) { targetPositions.push(attribute.getX(i) * size + x, attribute.getY(i) * size + y, depth); targetIds.push(iconId); }
  if (expanded !== source) expanded.dispose();
  source.dispose();
}
// Bolt, droplet, divided road and flame, deliberately different silhouettes.
polygon([[.3,1.2],[-.8,-.1],[-.1,-.1],[-.3,-1.2],[.9,.3],[.2,.3]], -.417, .175);
iconId = 1;
polygon([[0,1.3],[-.8,.1],[-.9,-.6],[-.4,-1],[.4,-1],[.9,-.6],[.8,.1]], -.187, .175);
iconId = 2;
polygon([[-.8,1],[-.2,1],[-.4,-1],[-1,-1]], .043, .175);
polygon([[.2,1],[.8,1],[1,-1],[.4,-1]], .043, .175);
iconId = 3;
polygon([[0,1.3],[-.25,.35],[-.65,.75],[-.9,-.4],[-.5,-1],[.5,-1],[.9,-.4],[.55,.5],[.35,0]], .273, .175);
iconId = 4;
// On-site object frame, officer shield and rising-water situation icon.
polygon([[-1,1],[-.6,1],[-.6,.6],[.6,.6],[.6,1],[1,1],[1,-1],[.6,-1],[.6,-.6],[-.6,-.6],[-.6,-1],[-1,-1]], -.437, .12);
polygon([[-.8,1],[.8,1],[.7,-.3],[0,-1.1],[-.7,-.3]], -.071, .12);
polygon([[-1,-.8],[-.5,-.4],[0,-.8],[.5,-.4],[1,-.8],[1,-1.1],[-1,-1.1]], .229, .12);
polygon([[-.35,1],[.35,1],[.25,-.1],[-.25,-.1]], .229, .12);
const geometry = new BufferGeometry();
geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
geometry.setAttribute('departmentId', new Float32BufferAttribute(iconIds, 1));
geometry.computeBoundingBox(); geometry.computeBoundingSphere();
const material = new MeshBasicMaterial({ color: '#ffe0a0', toneMapped: false });
material.onBeforeCompile = shader => {
  shader.uniforms.selectedDepartment = selectedDepartmentIcon;
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float departmentId; varying float vDepartment;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepartment = departmentId;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float selectedDepartment; varying float vDepartment;').replace('#include <color_fragment>', '#include <color_fragment>\nif(abs(vDepartment-selectedDepartment)<.1) diffuseColor.rgb=vec3(.012,.025,.034);');
};
material.customProgramCacheKey = () => 'civicops-department-icons-v1';
export const departmentIcons = new Mesh(geometry, material);
departmentIcons.name = 'OriginalDepartmentPictograms';

const HAZARD_SHAPES: Record<HazardChip['icon'], number[][][]> = {
  bolt: [[[.3,1.2],[-.8,-.1],[-.1,-.1],[-.3,-1.2],[.9,.3],[.2,.3]]],
  water: [[[0,1.3],[-.8,.1],[-.9,-.6],[-.4,-1],[.4,-1],[.9,-.6],[.8,.1]]],
  trench: [[[-1,1],[-.6,1],[-.6,-.6],[.6,-.6],[.6,1],[1,1],[1,-1],[-1,-1]]],
  traffic: [[[-.8,1],[-.2,1],[-.4,-1],[-1,-1]], [[.2,1],[.8,1],[1,-1],[.4,-1]]],
  fire: [[[0,1.3],[-.25,.35],[-.65,.75],[-.9,-.4],[-.5,-1],[.5,-1],[.9,-.4],[.55,.5],[.35,0]]],
  medical: [[[-.3,1],[.3,1],[.3,.3],[1,.3],[1,-.3],[.3,-.3],[.3,-1],[-.3,-1],[-.3,-.3],[-1,-.3],[-1,.3],[-.3,.3]]],
};

/** Original hazard silhouettes. One draw; 29cm pill pitch; origin is the first icon center. */
export function createHazardIconStrip(kinds: readonly HazardChip['icon'][]): Mesh<BufferGeometry, MeshBasicMaterial> {
  const stripPositions: number[] = [], ids: number[] = [];
  for (let slot = 0; slot < Math.min(3, kinds.length); slot += 1) {
    for (const points of HAZARD_SHAPES[kinds[slot]]) polygon(points, slot * .29, 0, stripPositions, ids, .011, .003);
  }
  const stripGeometry = new BufferGeometry();
  stripGeometry.setAttribute('position', new Float32BufferAttribute(stripPositions, 3));
  stripGeometry.computeBoundingBox(); stripGeometry.computeBoundingSphere();
  const strip = new Mesh(stripGeometry, new MeshBasicMaterial({ color: '#352704', toneMapped: false }));
  strip.name = 'OriginalHazardPictograms';
  return strip;
}
