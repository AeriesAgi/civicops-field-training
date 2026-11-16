import { BufferGeometry, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, Vector3 } from '@iwsdk/core';
import { decodeSurfaceAttribute } from '../training/static-batching.js';
import { advanceWheelAngle, fleetDetail } from '../training/fleet-motion.js';

/** Source-owned surfaces stay immutable. Decode quantization before wheel deformation. */
export function decodeTaxiGeometry(source: Mesh, basis: Matrix4): BufferGeometry {
  const geometry = new BufferGeometry();
  for (const name of ['position', 'normal', 'color', '_fleet_part']) {
    const attribute = source.geometry.getAttribute(name);
    if (!attribute) throw new Error(`Taxi source requires ${name}`);
    geometry.setAttribute(name, new Float32BufferAttribute(decodeSurfaceAttribute(attribute), attribute.itemSize));
  }
  if (source.geometry.index) geometry.setIndex(source.geometry.index.clone());
  geometry.applyMatrix4(basis); geometry.computeBoundingSphere();
  return geometry;
}

/** Two instanced draws per eye for the fleet, including articulated tyres/hazards.
 * Source surface tags, never spatial guesses, decide which vertices may rotate.
 */
export class TaxiFleet {
  readonly near: InstancedMesh;
  readonly distant: InstancedMesh;
  private readonly nearMotion: InstancedBufferAttribute;
  private readonly farMotion: InstancedBufferAttribute;
  private readonly poses: Matrix4[];
  private readonly visible: Uint8Array;
  private readonly states: Float32Array;
  private readonly wheelRadius: number;
  private readonly previous: Float64Array;
  private readonly detail: Uint8Array;
  private readonly angles: Float64Array;
  private readonly matrix = new Matrix4();
  private readonly roll = new Matrix4();
  private readonly shadowScale = new Vector3(2.2,1,5.1);
  private readonly inverse = new Matrix4();
  private readonly material: MeshStandardMaterial;

  constructor(parent: Object3D, count: number, name: string, templates: Object3D = parent) {
    parent.updateMatrixWorld(true);
    const source = templates.getObjectByName('StreetTaxiTemplateMesh') as Mesh;
    const low = templates.getObjectByName('StreetTaxiDistantMesh') as Mesh;
    const centres = templates.getObjectByName('StreetTaxiTemplate')!.userData.wheelCentres as number[][];
    if (!(source?.material instanceof MeshStandardMaterial) || !low) throw new Error('Licensed taxi prototypes are missing');
    this.inverse.copy(parent.matrixWorld).invert();
    const nearGeometry = decodeTaxiGeometry(source, this.matrix.multiplyMatrices(this.inverse, source.matrixWorld));
    const farGeometry = decodeTaxiGeometry(low, this.matrix.multiplyMatrices(this.inverse, low.matrixWorld));
    source.visible = false; low.visible = false;
    this.nearMotion = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.farMotion = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
    nearGeometry.setAttribute('fleetMotion', this.nearMotion); farGeometry.setAttribute('fleetMotion', this.farMotion);
    this.material = source.material.clone(); this.material.name = 'LicensedFleetPBR';
    this.material.onBeforeCompile = shader => {
      shader.uniforms.wheelCentres = { value: centres.map(c => new Vector3(...c as [number, number, number])) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 _fleet_part; attribute vec3 fleetMotion; uniform vec3 wheelCentres[4]; varying vec3 vFleetSurface; varying vec2 vFleetState;')
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          float a=fleetMotion.x;float c=cos(a),s=sin(a);
          if(_fleet_part.x>.5){vec2 n=objectNormal.yz;objectNormal.yz=vec2(n.x*c-n.y*s,n.x*s+n.y*c);}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          if(_fleet_part.x>.5){int id=int(_fleet_part.x+.5)-1;vec3 d=position-wheelCentres[id];
            transformed.yz=wheelCentres[id].yz+vec2(d.y*c-d.z*s,d.y*s+d.z*c);
            if(id==0){float damaged=fleetMotion.y;transformed.y=max(.015,transformed.y-.14*damaged);}}
          vFleetSurface=_fleet_part;vFleetState=fleetMotion.yz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFleetSurface; varying vec2 vFleetState;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=vFleetSurface.z>2.5?.88:vFleetSurface.z>1.5?.16:vFleetSurface.z>.5?.24:.4;')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor=vFleetSurface.z>.5&&vFleetSurface.z<1.5?.65:.03;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(1.0,.28,.01)*vFleetState.y*vFleetSurface.y*1.8;');
    };
    this.material.customProgramCacheKey = () => 'source-tagged-fleet-v1';
    this.near = new InstancedMesh(nearGeometry, this.material, count);
    this.distant = new InstancedMesh(farGeometry, this.material, count);
    this.near.name = name; this.distant.name = `${name}Distant`;
    this.near.frustumCulled = this.distant.frustumCulled = false;
    this.near.raycast = this.distant.raycast = () => {};
    this.poses = Array.from({length:count},()=>new Matrix4());
    this.visible = new Uint8Array(count); this.states = new Float32Array(count*2);
    this.wheelRadius = centres[0][1];
    this.previous = new Float64Array(count * 2); this.previous.fill(NaN);
    this.detail = new Uint8Array(count); this.angles = new Float64Array(count);
    this.flush();
  }

  set(index: number, x: number, y: number, z: number, yaw: number, distance: number,
      visible = true, damage = false, pulse = false, reducedMotion = false, roll = 0): void {
    const px = this.previous[index*2], pz = this.previous[index*2+1];
    // A wrap/retry is a relocation, not hundreds of metres of tyre rotation.
    const travelled = Number.isFinite(px) ? Math.hypot(x-px, z-pz) : 0;
    if (!reducedMotion && travelled < 8) this.angles[index] = advanceWheelAngle(this.angles[index], travelled, this.wheelRadius);
    this.previous[index*2] = x; this.previous[index*2+1] = z;
    this.detail[index] = fleetDetail(distance, this.detail[index] === 1) ? 1 : 0;
    this.visible[index] = visible ? 1 : 0;
    this.poses[index].makeRotationY(yaw).multiply(this.roll.makeRotationZ(roll)).setPosition(x, y, z);
    this.states[index*2] = damage ? 1 : 0; this.states[index*2+1] = pulse ? 1 : 0;
  }
  flush(): void {
    let nearCount = 0, farCount = 0;
    for (let i=0;i<this.visible.length;i++) {
      if (!this.visible[i]) continue;
      const near=this.detail[i]===1, slot=near?nearCount++:farCount++;
      (near?this.near:this.distant).setMatrixAt(slot,this.poses[i]);
      (near?this.nearMotion:this.farMotion).setXYZ(slot,this.angles[i],this.states[i*2],this.states[i*2+1]);
    }
    this.near.count = nearCount; this.distant.count = farCount;
    this.near.instanceMatrix.needsUpdate = this.distant.instanceMatrix.needsUpdate = this.nearMotion.needsUpdate = this.farMotion.needsUpdate = true;
  }
  get capacity(): number { return this.visible.length; }
  /** Reuse the street's single contact-shadow draw for all fleet vehicles. */
  writeShadows(target: InstancedMesh): void {
    for(let i=0;i<this.visible.length;i++) {
      const e=this.poses[i].elements;
      if(this.visible[i])this.matrix.makeRotationY(Math.atan2(e[8],e[10])).scale(this.shadowScale).setPosition(e[12],e[13]+.012,e[14]);
      else this.matrix.makeScale(0,0,0);
      target.setMatrixAt(i,this.matrix);
    }
  }
  dispose(): void {
    this.near.removeFromParent(); this.distant.removeFromParent();
    this.near.geometry.dispose(); this.distant.geometry.dispose();
    this.near.dispose(); this.distant.dispose(); this.material.dispose();
  }
}
