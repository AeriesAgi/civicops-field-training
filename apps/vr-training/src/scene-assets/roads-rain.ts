import { Color, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, ShaderMaterial, Vector3 } from '@iwsdk/core';
import type { RoadsWeather } from '../training/roads-weather.js';

/** Head-local GPU streaks and five planar-free puddles: two draws, no frame allocations. */
export class RoadsRain {
  readonly streaks: InstancedMesh;
  readonly puddles: InstancedMesh;
  private readonly materials: {mesh:Mesh; original:Mesh['material']; wet:MeshStandardMaterial}[]=[];
  private readonly time={value:0};
  private readonly eye={value:new Vector3()};
  private readonly rainMaterial:ShaderMaterial;
  private readonly puddleMaterial:ShaderMaterial;
  constructor(private readonly root:Object3D, weather:RoadsWeather, reducedMotion:boolean) {
    const geometry=new PlaneGeometry(.012,.32);
    const count=weather==='clear'?0:weather==='drizzle'?90:260;
    const seeds=new Float32Array(260*3);
    for(let i=0;i<260;i++){seeds[i*3]=Math.sin(i*127.1)*43758.5453%1;seeds[i*3+1]=Math.cos(i*311.7)*23421.631%1;seeds[i*3+2]=i/260;}
    geometry.setAttribute('rainSeed',new InstancedBufferAttribute(seeds,3));
    this.rainMaterial=new ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
      uniforms:{clock:this.time,eye:this.eye,motion:{value:reducedMotion?0:1}},
      vertexShader:`attribute vec3 rainSeed;uniform float clock;uniform float motion;uniform vec3 eye;varying float opacity;
      void main(){vec3 p=position;float t=clock*motion;p.x+=rainSeed.x*8.0+sin(t*.4)*.08;p.z+=rainSeed.y*8.0;p.y+=mod(rainSeed.z*6.0-t*7.2,6.0)-1.0;p.x+=p.y*.12;opacity=.17+rainSeed.z*.2;gl_Position=projectionMatrix*modelViewMatrix*vec4(p+eye,1.0);}`,
      fragmentShader:'varying float opacity;void main(){gl_FragColor=vec4(.74,.83,.88,opacity);}'});
    this.streaks=new InstancedMesh(geometry,this.rainMaterial,260);this.streaks.count=count;this.streaks.frustumCulled=false;this.streaks.name='HighveldRain';this.streaks.raycast=()=>{};root.add(this.streaks);
    const plane=new PlaneGeometry(1,1);plane.rotateX(-Math.PI/2);
    this.puddleMaterial=new ShaderMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
      uniforms:{clock:this.time,motion:{value:reducedMotion?0:1}},
      vertexShader:'varying vec2 uvP;void main(){uvP=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}',
      fragmentShader:`uniform float clock;uniform float motion;varying vec2 uvP;void main(){vec2 q=uvP*2.0-1.0;float d=length(q);float edge=1.0-smoothstep(.68+.08*sin(q.x*17.0),1.0,d);float ripple=sin(d*68.0-clock*motion*6.0)*.025;float clouds=sin(q.x*4.0+q.y*6.0)*.06;gl_FragColor=vec4(vec3(.27,.34,.38)+clouds+ripple,edge*.86);}`});
    this.puddles=new InstancedMesh(plane,this.puddleMaterial,5);this.puddles.name='RainFilledPotholeAndPuddles';this.puddles.frustumCulled=false;this.puddles.raycast=()=>{};
    const matrix=new Matrix4();
    for(const [i,x,z,sx,sz]of [[0,13,1.65,8,2.6],[1,5,-2.4,4,1.8],[2,-7,1.6,6,1.2],[3,24,-1.8,4,2],[4,-20,-2.3,5,1.5]]){matrix.makeScale(sx,1,sz);matrix.setPosition(x,.085,z);this.puddles.setMatrixAt(i,matrix);}
    this.puddles.visible=weather!=='clear';root.add(this.puddles);
    if(weather!=='clear')root.traverse(o=>{if(o instanceof Mesh&&o.material instanceof MeshStandardMaterial&&o.material.name==='street-asphalt'){const original=o.material,wet=original.clone();wet.color.multiply(new Color(.52,.57,.60));wet.roughness=.23;wet.metalness=.12;o.material=wet;this.materials.push({mesh:o,original,wet});}});
  }
  update(delta:number,head:Vector3):void {this.time.value+=Math.min(delta,.1);this.eye.value.copy(head);this.root.worldToLocal(this.eye.value);}
  dispose():void {for(const {mesh,original,wet}of this.materials){mesh.material=original;wet.dispose();}this.streaks.removeFromParent();this.puddles.removeFromParent();this.streaks.dispose();this.puddles.dispose();this.streaks.geometry.dispose();this.puddles.geometry.dispose();this.rainMaterial.dispose();this.puddleMaterial.dispose();}
}
