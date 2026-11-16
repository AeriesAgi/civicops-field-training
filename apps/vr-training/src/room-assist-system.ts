import { browserStorage } from './training/browser-storage.js';
import {useEmulatorRoom} from './training/room-controls.js';
import {placedAsset} from './training/placed-asset.js';
import type {EmulatorRoomCapture} from './emulator-room-capture.js';
import {FieldAssistSystem} from './field-assist-system.js';
import {FieldAssistTarget} from './field-assist-components.js';
import {rehearsalTrench} from './scene-assets/rehearsal-trench.js';
import { AssetManager, Box3, createSystem, Entity, Group, Matrix4, Object3D, PokeInteractable, RayInteractable, Quaternion, Transform, Vector3 } from '@iwsdk/core';
import { AssistCard } from './assist-card.js';
import { insidePlane, persistRoomAnchor, restoreRoomAnchor, roomSurface, type PersistentAnchor, type RoomSurface,readRoomHandle,ROOM_ANCHOR_KEY } from './training/room-anchors.js';
interface RoomStatus {phase:string;planes:number;surface:RoomSurface;pinned:boolean;persistent:boolean;message:string;}

/** Native WebXR passthrough placement. Optional planes/anchors degrade to hand placement. */
export class RoomAssistSystem extends createSystem({}) {
  private readonly status:RoomStatus={phase:'ready',planes:0,surface:'manual',pinned:false,persistent:false,message:'Pin beside the job. Then pinch a real surface.'};
  private session?:XRSession;
  private anchor?:XRAnchor;
  private armedAt=-Infinity;
  private armed=false;
  private pending?:XRInputSource;
  private guide?:Object3D;
  private readonly floorProps=new Group();
  private readonly trench=rehearsalTrench();
  private readonly wallProps=new Group();
  private floorEntity?:Entity;
  private wallEntity?:Entity;
  private info?:AssistCard;
  private returnCard?:AssistCard;
  private returnEntity?:Entity;
  private infoEntity?:Entity;
  private lastMessage='';
  private infoUntil=0;
  private readonly hand=new Vector3();
  private readonly head=new Vector3();
  private readonly point=new Vector3();
  private readonly normal=new Vector3();
  private readonly rayOrigin=new Vector3();
  private readonly rayDirection=new Vector3();
  private readonly localOrigin=new Vector3();
  private readonly localDirection=new Vector3();
  private readonly worldPoint=new Vector3();
  private readonly matrix=new Matrix4();
  private readonly inverse=new Matrix4();
  private readonly facing=new Quaternion();
  private disposed=false;
  private generation=0;
  private captureRoom?:EmulatorRoomCapture;
  private floorHeight=0;
  private readonly select=(event:XRInputSourceEvent)=>{if(this.armed&&event.inputSource.hand&&performance.now()-this.armedAt>350)this.pending=event.inputSource;};
  init():void {
    this.world.renderer.setClearAlpha(0);
    (window as unknown as {civicOpsRoom:RoomStatus}).civicOpsRoom=this.status;
    const place=()=>{this.armed=true;this.armedAt=performance.now();this.status.phase='placing';this.status.message='Pinch a floor, table or wall. No planes? Pinch to place at your hand.';};
    const recenter=()=>{this.generation++;const handle=readRoomHandle(browserStorage());try{if(handle&&this.session?.deletePersistentAnchor)void this.session.deletePersistentAnchor(handle).catch(()=>{});}catch{}try{localStorage.removeItem(ROOM_ANCHOR_KEY);}catch{}this.floorProps.visible=false;this.wallProps.visible=false;this.anchor?.delete();this.anchor=undefined;this.status.pinned=false;this.status.persistent=false;if(this.guide)this.guide.userData.roomPinned=false;};
    const floorUp=()=>{this.floorHeight+=.05;this.status.message='Manual floor '+this.floorHeight.toFixed(2)+' m. Check the real floor.';};const floorDown=()=>{this.floorHeight-=.05;this.status.message='Manual floor '+this.floorHeight.toFixed(2)+' m. Check the real floor.';};
    window.addEventListener('civicops:room-floor-up',floorUp);window.addEventListener('civicops:room-floor-down',floorDown);
    window.addEventListener('civicops:room-place',place);window.addEventListener('civicops:room-recenter',recenter);
    this.cleanupFuncs.push(()=>{this.disposed=true;this.captureRoom?.dispose();window.removeEventListener('civicops:room-floor-up',floorUp);window.removeEventListener('civicops:room-floor-down',floorDown);window.removeEventListener('civicops:room-place',place);window.removeEventListener('civicops:room-recenter',recenter);this.session?.removeEventListener('selectstart',this.select);this.anchor?.delete();this.floorEntity?.dispose({disposeResources:false});this.wallEntity?.dispose({disposeResources:false});this.infoEntity?.dispose({disposeResources:false});this.info?.dispose();this.returnEntity?.dispose({disposeResources:false});this.returnCard?.dispose();this.trench.geometry.dispose();this.trench.material.dispose();});
    this.floorProps.add(this.trench);
    this.floorProps.name='RealFloorRehearsal';this.wallProps.name='RealSurfaceIsolationPanel';this.floorProps.visible=false;this.wallProps.visible=false;
    this.floorEntity=this.world.createTransformEntity(this.floorProps);this.wallEntity=this.world.createTransformEntity(this.wallProps);
    this.info=new AssistCard(.48,.075);this.info.mesh.name='RoomPlacementStatus';this.infoEntity=this.world.createTransformEntity(this.info.mesh);this.info.mesh.visible=false;
    this.returnCard=new AssistCard(.28,.055);this.returnCard.draw({title:'Pinned job / Follow view',tone:'button'});this.returnCard.mesh.name='assist-room-return';this.returnCard.mesh.visible=false;this.returnEntity=this.world.createTransformEntity(this.returnCard.mesh);this.returnEntity.addComponent(FieldAssistTarget,{action:'room-follow'}).addComponent(RayInteractable).addComponent(PokeInteractable);
    void this.loadProps();
    const emulator=(window as unknown as {IWER_DEVICE?:object}).IWER_DEVICE;
    if(useEmulatorRoom(location.search,!!emulator))void import('./emulator-room-capture.js').then(async({EmulatorRoomCapture})=>{if(this.disposed)return;this.captureRoom=new EmulatorRoomCapture(this.world,emulator!);await this.captureRoom.load();}).catch(()=>{this.status.message='Emulator room image unavailable. Native room placement remains available.';});
  }
  private async loadProps():Promise<void>{
    try{
      await Promise.all(['room-rehearsal-kit','water-valve-key'].map(id=>AssetManager.loadGLTFById(id)));
      if(this.disposed)return;
      const kit=AssetManager.getGLTF('room-rehearsal-kit')!.scene;
      for(let i=0;i<3;i++)this.floorProps.add(placedAsset(kit.getObjectByName('RehearsalTrafficCone')!,(i-1)*.42,0,-.4-i*.7));
      const key=AssetManager.getGLTF('water-valve-key')!.scene;key.rotation.x=-Math.PI/2;key.position.set(-.85,0,.25);key.updateMatrixWorld(true);key.position.y=.025-new Box3().setFromObject(key).min.y;this.floorProps.add(key);
      const panel=kit.getObjectByName('WeatheredIsolationCabinet')!.clone();this.wallProps.add(panel);
    }catch{this.status.message='Work board ready. Rehearsal props could not load; re-enter to retry.';}
  }
  private connect(session:XRSession):void {
    const generation=++this.generation;this.anchor=undefined;this.status.pinned=false;this.status.persistent=false;if(this.guide)this.guide.userData.roomPinned=false;
    this.session?.removeEventListener('selectstart',this.select);this.session=session;session.addEventListener('selectstart',this.select);
    void restoreRoomAnchor(session,browserStorage()).then(anchor=>{if(this.disposed||generation!==this.generation){anchor?.delete();return;}if(anchor&&!this.status.pinned){this.anchor=anchor;this.status.pinned=true;this.status.persistent=true;this.status.surface='manual';this.status.phase='restored';this.status.message='Saved room anchor restored. Check clearance before practice.';}});
  }
  private place(frame:XRFrame,space:XRReferenceSpace,input:XRInputSource):void {
    const joint=input.hand?.get('index-finger-tip'),pose=joint?frame.getJointPose?.(joint,space):undefined;
    if(!pose){this.status.message='Hand tracking lost. Open your hand and pinch again.';return;}
    this.hand.set(pose.transform.position.x,pose.transform.position.y,pose.transform.position.z);this.point.copy(this.hand);
    let surface:RoomSurface='manual',best=Infinity;
    const ray=frame.getPose(input.targetRaySpace,space);
    if(ray){this.rayOrigin.set(ray.transform.position.x,ray.transform.position.y,ray.transform.position.z);this.facing.set(ray.transform.orientation.x,ray.transform.orientation.y,ray.transform.orientation.z,ray.transform.orientation.w);this.rayDirection.set(0,0,-1).applyQuaternion(this.facing);}
    for(const plane of frame.detectedPlanes??[]){const pp=frame.getPose(plane.planeSpace,space);if(!pp)continue;
      this.matrix.fromArray(pp.transform.matrix);this.inverse.copy(this.matrix).invert();this.worldPoint.copy(this.hand).applyMatrix4(this.inverse);
      let score=Math.abs(this.worldPoint.y)*.1;
      const direct=Math.abs(this.worldPoint.y)<.2&&insidePlane(this.worldPoint.x,this.worldPoint.z,plane.polygon);
      if(direct)this.worldPoint.y=0;
      else{if(!ray)continue;this.localOrigin.copy(this.rayOrigin).applyMatrix4(this.inverse);this.localDirection.copy(this.rayDirection).transformDirection(this.inverse);if(Math.abs(this.localDirection.y)<.0001)continue;
        const distance=-this.localOrigin.y/this.localDirection.y;if(distance<0||distance>3)continue;this.worldPoint.copy(this.localOrigin).addScaledVector(this.localDirection,distance);if(!insidePlane(this.worldPoint.x,this.worldPoint.z,plane.polygon))continue;score=distance+.2;}
      if(score>=best)continue;best=score;this.point.copy(this.worldPoint).applyMatrix4(this.matrix);surface=roomSurface(plane.orientation,this.point.y,(plane as XRPlane&{semanticLabel?:string}).semanticLabel);this.normal.set(0,1,0).transformDirection(this.matrix);
    }
    this.player.head.getWorldPosition(this.head);
    if(surface==='floor'){this.floorHeight=this.point.y;this.point.y+=1.1;}
    if(surface==='table')this.point.y+=.29;
    if(surface==='wall'){this.worldPoint.copy(this.head).sub(this.point);if(this.normal.dot(this.worldPoint)<0)this.normal.negate();this.point.addScaledVector(this.normal,.035);this.facing.setFromUnitVectors(this.worldPoint.set(0,0,1),this.normal);}
    else{const yaw=Math.atan2(this.head.x-this.point.x,this.head.z-this.point.z);this.facing.setFromAxisAngle(this.normal.set(0,1,0),yaw);}
    const generation=++this.generation;this.anchor?.delete();this.anchor=undefined;this.status.persistent=false;this.status.surface=surface;this.status.pinned=true;this.status.phase=surface==='manual'?'manual':'plane';this.armed=false;
    this.guide!.position.copy(this.point);this.guide!.quaternion.copy(this.facing);this.guide!.userData.roomPinned=true;
    this.status.message=surface==='manual'?'Hand-placed board. No plane found; floor preview uses manual height 0 m.':'Snapped to real '+surface+'. Check the space is clear.';
    this.floorProps.position.set(this.point.x,this.floorHeight,this.point.z);this.floorProps.quaternion.copy(this.facing);this.floorProps.visible=surface==='floor'||surface==='manual';
    this.wallProps.position.copy(this.point).add(this.worldPoint.set(.68,-.12,0).applyQuaternion(this.facing));this.wallProps.quaternion.copy(this.facing);this.wallProps.visible=true;
    if(frame.createAnchor){const t=new XRRigidTransform({x:this.point.x,y:this.point.y,z:this.point.z},{x:this.facing.x,y:this.facing.y,z:this.facing.z,w:this.facing.w});
      void frame.createAnchor(t,space).then(async anchor=>{if(this.disposed||!this.status.pinned||generation!==this.generation){anchor.delete();return;}this.anchor=anchor;this.status.phase='anchored';this.status.persistent=await persistRoomAnchor(anchor as PersistentAnchor,{setItem:(key,value)=>{if(generation!==this.generation)throw Error('stale placement');localStorage.setItem(key,value);}});if(generation!==this.generation)return;this.status.message=this.status.persistent?'Pinned to a persistent room anchor. Recheck after room changes.':'Pinned for this session. Persistent anchors unavailable; re-place after reload.';}).catch(()=>{this.status.message='Surface placement kept. Anchors unavailable; re-place after reload.';});}
  }
  update():void {
    this.guide??=this.world.scene.getObjectByName('RoomGuide');if(!this.guide)return;
    // The AR compositor owns the background. Never draw a virtual street or sky here.
    this.world.scene.background=null;this.world.scene.fog=null;
    const session=this.world.renderer.xr.getSession(),frame=this.world.renderer.xr.getFrame(),space=this.world.renderer.xr.getReferenceSpace();
    if(session&&session!==this.session)this.connect(session);
    if(!session||!frame||!space)return;
    this.status.planes=frame.detectedPlanes?.size??0;
    if(this.captureRoom)for(const plane of frame.detectedPlanes??[]){const pose=frame.getPose(plane.planeSpace,space);if(pose&&roomSurface(plane.orientation,pose.transform.position.y,(plane as XRPlane&{semanticLabel?:string}).semanticLabel)==='floor'){this.captureRoom.alignFloor(pose.transform.position.y);break;}}
    if(this.pending){const input=this.pending;this.pending=undefined;this.place(frame,space,input);}
    if(this.anchor){const pose=frame.getPose(this.anchor.anchorSpace,space);if(pose){this.guide.position.set(pose.transform.position.x,pose.transform.position.y,pose.transform.position.z);this.guide.quaternion.set(pose.transform.orientation.x,pose.transform.orientation.y,pose.transform.orientation.z,pose.transform.orientation.w);this.guide.userData.roomPinned=true;}}
    if(this.status.pinned){this.floorProps.position.set(this.guide.position.x,this.floorHeight,this.guide.position.z);this.floorProps.quaternion.copy(this.guide.quaternion);this.floorProps.visible=this.status.surface==='floor'||this.status.surface==='manual';this.wallProps.position.copy(this.guide.position).add(this.point.set(.9,0,-1.1).applyQuaternion(this.guide.quaternion));this.wallProps.position.y=this.status.surface==='wall'?this.guide.position.y-.55:this.status.surface==='table'?this.guide.position.y-.29:this.floorHeight;this.wallProps.quaternion.copy(this.guide.quaternion);this.wallProps.visible=true;}
    this.world.getSystem(FieldAssistSystem)?.syncGuideTransform();
    if(this.returnCard){this.player.head.getWorldPosition(this.head);this.player.head.getWorldDirection(this.normal).negate();this.point.copy(this.guide.position).sub(this.head);this.returnCard.mesh.visible=this.status.pinned&&this.point.dot(this.normal)<this.point.length()*.8988;if(this.returnCard.mesh.visible){this.returnCard.mesh.position.copy(this.head).addScaledVector(this.normal,.65);this.returnCard.mesh.position.y-=.16;this.returnCard.mesh.lookAt(this.head);if(this.returnEntity){const p=this.returnEntity.getVectorView(Transform,'position'),q=this.returnEntity.getVectorView(Transform,'orientation');p[0]=this.returnCard.mesh.position.x;p[1]=this.returnCard.mesh.position.y;p[2]=this.returnCard.mesh.position.z;q[0]=this.returnCard.mesh.quaternion.x;q[1]=this.returnCard.mesh.quaternion.y;q[2]=this.returnCard.mesh.quaternion.z;q[3]=this.returnCard.mesh.quaternion.w;}}}
    if(this.info){this.info.mesh.visible=this.armed||performance.now()<this.infoUntil;this.info.mesh.position.copy(this.guide.position);this.info.mesh.position.y+=.31;this.info.mesh.quaternion.copy(this.guide.quaternion);if(this.lastMessage!==this.status.message){this.lastMessage=this.status.message;this.infoUntil=performance.now()+5000;this.info.draw({title:this.status.message,eyebrow:'ROOM / '+this.status.planes+' PLANES'});}}
  }
}
