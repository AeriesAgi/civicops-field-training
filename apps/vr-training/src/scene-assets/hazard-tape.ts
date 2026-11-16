import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, ShaderMaterial } from '@iwsdk/core';
import { TapePhysics } from '../training/tape-physics.js';
/** Reusable physical ribbon; no texture memory, two-sided and legible at a metre. */
export class HazardTape {
  readonly physics=new TapePhysics();
  readonly mesh:Mesh;
  private readonly vertices=new Float32Array((this.physics.segments+1)*6);
  private readonly geometry=new BufferGeometry();
  private readonly material=new ShaderMaterial({side:DoubleSide,toneMapped:false,
    vertexShader:'varying vec2 uvT;void main(){uvT=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 uvT;void main(){float stripe=step(.48,fract(uvT.x*18.0+uvT.y*.6));gl_FragColor=vec4(mix(vec3(.025),vec3(.95,.69,.06),stripe),1.0);}'});
  constructor(){
    const uv:number[]=[],indices:number[]=[];
    for(let i=0;i<=this.physics.segments;i++){uv.push(i/this.physics.segments,0,i/this.physics.segments,1);if(i<this.physics.segments){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}}
    this.geometry.setAttribute('position',new Float32BufferAttribute(this.vertices,3));this.geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));this.geometry.setIndex(indices);
    this.mesh=new Mesh(this.geometry,this.material);this.mesh.name='PinnedHazardTape';this.mesh.frustumCulled=false;this.mesh.raycast=()=>{};this.mesh.visible=false;
  }
  update(delta:number,wind:number):void {this.physics.update(delta,wind);const p=this.physics.points;for(let i=0;i<=this.physics.segments;i++){const a=i*3,b=i*6;this.vertices[b]=this.vertices[b+3]=p[a];this.vertices[b+1]=p[a+1]-.037;this.vertices[b+4]=p[a+1]+.037;this.vertices[b+2]=this.vertices[b+5]=p[a+2];}this.geometry.getAttribute('position').needsUpdate=true;}
  dispose():void {this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
