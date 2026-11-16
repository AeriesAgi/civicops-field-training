/** Fixed-size Verlet strip. Endpoints are anchored; gravity and wind sag the free nodes. */
export class TapePhysics {
  readonly points:Float32Array;
  private readonly previous:Float32Array;
  private readonly pins=new Float32Array(6);
  private rest=.1;
  constructor(readonly segments=20){this.points=new Float32Array((segments+1)*3);this.previous=new Float32Array(this.points.length);}
  setEnds(ax:number,ay:number,az:number,bx:number,by:number,bz:number,reset=false):void {
    this.pins[0]=ax;this.pins[1]=ay;this.pins[2]=az;this.pins[3]=bx;this.pins[4]=by;this.pins[5]=bz;this.rest=Math.max(.01,Math.hypot(bx-ax,by-ay,bz-az)*1.025/this.segments);
    if(reset)for(let i=0;i<=this.segments;i++){const t=i/this.segments;this.points[i*3]=ax+(bx-ax)*t;this.points[i*3+1]=ay+(by-ay)*t-Math.sin(t*Math.PI)*.10;this.points[i*3+2]=az+(bz-az)*t;}
    if(reset)this.previous.set(this.points);
  }
  update(dt:number,wind:number):void {
    const h=Math.min(.033,Math.max(0,dt)),p=this.points,old=this.previous,n=this.segments;
    for(let i=1;i<n;i++)for(let k=0;k<3;k++){const j=i*3+k,current=p[j];p[j]+=(p[j]-old[j])*.97+(k===1?-2:k===2?wind:0)*h*h;old[j]=current;}
    for(let pass=0;pass<7;pass++){
      p[0]=this.pins[0];p[1]=this.pins[1];p[2]=this.pins[2];p[n*3]=this.pins[3];p[n*3+1]=this.pins[4];p[n*3+2]=this.pins[5];
      for(let i=0;i<n;i++){const a=i*3,b=a+3,dx=p[b]-p[a],dy=p[b+1]-p[a+1],dz=p[b+2]-p[a+2],length=Math.hypot(dx,dy,dz);if(length<1e-6)continue;const correction=(length-this.rest)/length;
        const wa=i===0?0:i===n-1?1:.5,wb=i===n-1?0:i===0?1:.5;
        p[a]+=dx*correction*wa;p[a+1]+=dy*correction*wa;p[a+2]+=dz*correction*wa;p[b]-=dx*correction*wb;p[b+1]-=dy*correction*wb;p[b+2]-=dz*correction*wb;}
    }
  }
}
