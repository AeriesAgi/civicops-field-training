import { createSystem, Material, Mesh, Raycaster, SkinnedMesh, Texture, Vector3 } from '@iwsdk/core';
import { TrainingSession } from './training-components.js';
interface RenderSample { drawCalls: number; triangles: number; textures: number; geometries: number; fps: number; xr: boolean }

/** Dev-only browser diagnostics. XR counters include the complete stereo render. */
export class PerformanceSystem extends createSystem({ session: { required: [TrainingSession] } }) {
  private elapsed = 0;
  private frames = 0;
  private overlay?: HTMLPreElement;
  private readonly sample = { drawCalls: 0, triangles: 0, textures: 0, geometries: 0, fps: 0, xr: false };

  init(): void {
    (window as unknown as { civicOpsStats: RenderSample }).civicOpsStats = this.sample;
    // Explicit, read-only diagnostics: allocate on a browser audit request only,
    // never in update(). Include spatial font shader uniforms and the IBL map.
    const drawHost = window as unknown as { civicOpsDrawBreakdown?: () => unknown };
    // Dev-only: visible meshes grouped by their top named ancestor (one mesh ≈ one draw per eye).
    drawHost.civicOpsDrawBreakdown = () => {
      const groups: Record<string, number> = {};
      this.world.scene.traverseVisible(object => {
        if (!(object instanceof Mesh) || (!Array.isArray(object.material) && !object.material.visible)) return;
        let top = object; let label = object.name || '(unnamed)';
        while (top.parent && top.parent !== this.world.scene && top.parent.name !== 'LevelRoot') { top = top.parent as never; if (top.name) label = top.name; }
        label = `${label}:${object.name || object.type}`;
        groups[label] = (groups[label] ?? 0) + 1;
      });
      return Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 70);
    };
    // Dev-only: world position of named objects (capture pose planning).
    (window as unknown as { civicOpsWhere?: (names: string[]) => unknown }).civicOpsWhere = (names) => names.map(name => {
      if (name === '@hit') { const c = this.world.camera; const r = new Raycaster(); const o3 = c.getWorldPosition(new Vector3()); const d = c.getWorldDirection(new Vector3()); r.set(o3, d); return r.intersectObject(this.world.scene, true).filter(h => (h.object as Mesh).material && !Array.isArray((h.object as Mesh).material) && ((h.object as Mesh).material as Material).visible).slice(0, 6).map(h => { let p = h.object; const chain = []; while (p && chain.length < 5) { chain.push(p.name); p = p.parent as never; } return [chain.join('<'), +h.distance.toFixed(2)]; }); }
      const o = name === '@camera' ? this.world.camera : name === '@player' ? this.world.player : this.world.scene.getObjectByName(name); if (!o) return [name, null];
      const v = o.getWorldPosition(o.position.clone()); return [name, [v.x, v.y, v.z].map(n => +n.toFixed(2)), o.visible];
    });
    const host = window as unknown as { civicOpsTextureAudit?: () => unknown };
    host.civicOpsTextureAudit = () => {
      const textures = new Map<Texture, Set<string>>();
      const add = (texture: unknown, owner: string) => {
        if (!(texture instanceof Texture)) return;
        const owners = textures.get(texture) ?? new Set<string>();
        owners.add(owner); textures.set(texture, owners);
      };
      this.world.scene.traverse(object => {
        if (!(object instanceof Mesh)) return;
        if (object instanceof SkinnedMesh) add(object.skeleton.boneTexture, 'tracked-hand:boneTexture');
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          for (const [key, value] of Object.entries(material)) add(value, `${material.name}:${key}`);
          if ('uniforms' in material) {
            for (const [key, uniform] of Object.entries(material.uniforms as Record<string, {value:unknown}>)) add(uniform.value, `${material.name}:uniform:${key}`);
          }
        }
      });
      add(this.world.scene.environment, 'scene.environment');
      add(this.world.scene.background, 'scene.background');
      return { rendererTextures: this.world.renderer.info.memory.textures,
        xrEyeViews: this.world.renderer.xr.isPresenting ? this.world.renderer.xr.getCamera().cameras.length : 0,
        referenced: [...textures].map(([texture, owners]) => ({ uuid:texture.uuid, source:texture.source.uuid,
          width:(texture.image as {width?:number})?.width, height:(texture.image as {height?:number})?.height,
          format:texture.format, type:texture.type, mipLevels:texture.mipmaps.length,
          uploaded:!!(this.world.renderer.properties.get(texture) as {__webglTexture?:unknown}).__webglTexture,
          colorSpace:texture.colorSpace, owners:[...owners] })) };
    };
    this.cleanupFuncs.push(() => { delete host.civicOpsTextureAudit; });
    if (new URLSearchParams(location.search).get('stats') !== '1') return;
    this.overlay = document.createElement('pre');
    this.overlay.id = 'civicops-stats';
    this.overlay.style.cssText = 'position:fixed;right:14px;bottom:14px;margin:0;padding:12px 16px;background:#102d2eed;color:#dbfff1;font:12px/1.6 monospace;border:1px solid #73bfa0;border-radius:8px;z-index:10000;pointer-events:none';
    document.body.append(this.overlay);
    this.cleanupFuncs.push(() => this.overlay?.remove());
  }

  update(delta: number): void {
    this.elapsed += delta;
    this.frames++;
    if (this.elapsed < .5) return;
    const info = this.world.renderer.info;
    this.sample.drawCalls = info.render.calls;
    this.sample.triangles = info.render.triangles;
    this.sample.textures = info.memory.textures;
    this.sample.geometries = info.memory.geometries;
    this.sample.fps = Math.round(this.frames / this.elapsed);
    this.sample.xr = this.world.renderer.xr.isPresenting;
    for (const entity of this.queries.session.entities) {
      entity.setValue(TrainingSession, 'drawCalls', this.sample.drawCalls);
      entity.setValue(TrainingSession, 'peakDrawCalls', Math.max(entity.getValue(TrainingSession, 'peakDrawCalls') ?? 0, this.sample.drawCalls));
      entity.setValue(TrainingSession, 'peakTriangles', Math.max(entity.getValue(TrainingSession, 'peakTriangles') ?? 0, this.sample.triangles));
      entity.setValue(TrainingSession, 'triangles', this.sample.triangles);
      entity.setValue(TrainingSession, 'textures', this.sample.textures);
      entity.setValue(TrainingSession, 'rendererFps', this.sample.fps);
    }
    if (this.overlay) this.overlay.textContent = `CIVICOPS / DEV STATS${this.sample.xr ? ' / XR stereo' : ''}\nDraw calls ${this.sample.drawCalls}   Triangles ${this.sample.triangles.toLocaleString()}\nTextures ${this.sample.textures}   Geometries ${this.sample.geometries}\n${this.sample.fps} fps (current renderer)`;
    this.frames = 0;
    this.elapsed = 0;
  }
}
