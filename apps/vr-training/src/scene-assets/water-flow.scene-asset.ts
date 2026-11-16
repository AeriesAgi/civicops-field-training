import { BufferAttribute, CircleGeometry, CylinderGeometry, DoubleSide, Group, Mesh, ShaderMaterial } from '@iwsdk/core';

/** Original water effect. Metres, +Y jet, origin at the burst outlet; two draws, no image maps. */
export function createWaterFlowEffect() {
  const root = new Group(); root.name = 'BurstWater';
  const jetGeometry = new CylinderGeometry(.012, .018, .18, 12, 12, true);
  const positions = jetGeometry.getAttribute('position') as BufferAttribute;
  for (let index = 0; index < positions.count; index++) {
    const t = (positions.getY(index) + .09) / .18;
    positions.setXYZ(index, positions.getX(index) + .028 * t * t,
      positions.getY(index) + .09, positions.getZ(index));
  }
  jetGeometry.computeVertexNormals();
  const jetMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false, side: DoubleSide,
    uniforms: { time: { value: 0 }, flow: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying vec3 vNormal; uniform float time; uniform float flow;
      void main(){ vUv=uv; vNormal=normalize(normalMatrix*normal); vec3 p=position;
        p.x+=sin(p.y*125.0-time*11.0)*0.0016*p.y;
        p.z+=cos(p.y*98.0-time*9.0)*0.0019*p.y;
        p.y*=0.22+0.78*flow; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vNormal; uniform float time; uniform float flow;
      float waterHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float waterNoise(vec2 p){vec2 cell=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(waterHash(cell),waterHash(cell+vec2(1.0,0.0)),f.x),
          mix(waterHash(cell+vec2(0.0,1.0)),waterHash(cell+vec2(1.0,1.0)),f.x),f.y);}
      void main(){
        float drift=0.18*sin(vUv.y*5.0-time*1.1);
        float strands=waterNoise(vec2(vUv.x*18.0+drift,vUv.y*1.7-time*0.32));
        float drops=waterNoise(vec2(vUv.x*27.0-drift,vUv.y*24.0-time*5.4));
        float strandMask=smoothstep(0.34,0.64,strands);
        float breakup=smoothstep(0.22,0.52,drops);
        float source=1.0-smoothstep(0.04,0.24,vUv.y);
        float coverage=max(source,strandMask*mix(1.0,breakup,smoothstep(0.18,0.8,vUv.y)));
        if(coverage<0.1 || flow<0.005) discard;
        float rim=pow(1.0-abs(vNormal.z),2.5)*coverage;
        float foam=smoothstep(0.52,0.94,vUv.y)*smoothstep(0.68,0.86,drops)*strandMask;
        float glint=pow(strands,7.0)*coverage;
        vec3 c=mix(vec3(0.54,0.79,0.82),vec3(0.92,0.99,1.0),min(1.0,rim*0.45+foam*0.7+glint*0.6));
        float alpha=(0.08*coverage+0.19*strandMask*coverage+rim*0.12+foam*0.42+glint*0.25)*min(flow*5.0,1.0);
        gl_FragColor=vec4(c,alpha); }`,
  });
  const jet = new Mesh(jetGeometry, jetMaterial); jet.name = 'WaterJet'; root.add(jet);
  const poolGeometry = new CircleGeometry(.11, 32);
  poolGeometry.rotateX(-Math.PI / 2);
  const poolMaterial = new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, flow: { value: 1 }, drained: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vUv; uniform float time; uniform float flow; uniform float drained;
      void main(){vec2 p=(vUv-0.5)*2.0; float r=length(p); float edge=1.0-smoothstep(0.8,1.0,r);
        float ripple=pow(0.5+0.5*sin(r*47.0-time*7.5),14.0)*flow;
        float caustic=pow(0.5+0.5*sin(p.x*49.0+sin(p.y*31.0+time)*2.0-time*1.8),8.0);
        vec3 c=mix(vec3(0.11,0.32,0.37),vec3(0.75,0.91,0.89),ripple*0.75+caustic*0.21);
        gl_FragColor=vec4(c,edge*(0.65-drained*0.35)); }`,
  });
  const pool = new Mesh(poolGeometry, poolMaterial); pool.name = 'PoolingWater';
  pool.position.y = -.022; pool.scale.set(1.6, 1, .7); root.add(pool);
  root.userData.iwsdkPreviewBounds = 'exclude';
  return {
    root,
    update(time: number, flow: number, drained: boolean): void {
      jet.visible = flow > .005;
      jetMaterial.uniforms.time.value = time; jetMaterial.uniforms.flow.value = flow;
      poolMaterial.uniforms.time.value = time; poolMaterial.uniforms.flow.value = flow;
      poolMaterial.uniforms.drained.value = drained ? 1 : 0;
    },
    dispose(): void { jetGeometry.dispose(); poolGeometry.dispose(); jetMaterial.dispose(); poolMaterial.dispose(); },
  };
}
