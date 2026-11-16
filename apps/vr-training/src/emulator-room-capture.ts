import {AssetManager,Entity,Material,Mesh,Object3D,type World} from '@iwsdk/core';
interface Emulator {sem?:{environmentCanvas:HTMLCanvasElement;planesVisible:boolean;meshesVisible:boolean;boundingBoxesVisible:boolean};}
/** Photograph-based room scenery for emulator footage only; native planes/anchors remain intact. */
export class EmulatorRoomCapture {
  private entity?:Entity;
  private root?:Object3D;
  private disposed=false;
  private previousVisibility?:string;
  constructor(private readonly world:World,private readonly emulator:Emulator){}
  async load():Promise<void>{
    await AssetManager.loadGLTFById('emulator-depot-room');if(this.disposed)return;
    this.root=AssetManager.getGLTF('emulator-depot-room')!.scene;this.root.name='EmulatorPhotographedDepot';
    this.root.traverse(o=>{if(o instanceof Mesh){const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials as Material[])m.toneMapped=false;}});
    this.entity=this.world.createTransformEntity(this.root);
    // Hide only the emulator's display canvas. Do not delete room planes/meshes:
    // those still drive native placement and XRAnchor restoration underneath.
    const sem=this.emulator.sem;if(sem){this.previousVisibility=sem.environmentCanvas.style.visibility;sem.environmentCanvas.style.visibility='hidden';}
  }
  alignFloor(height:number):void{if(this.root&&Number.isFinite(height))this.root.position.y=height;}
  dispose():void{this.disposed=true;this.entity?.dispose({disposeResources:false});if(this.previousVisibility!==undefined&&this.emulator.sem)this.emulator.sem.environmentCanvas.style.visibility=this.previousVisibility;}
}
