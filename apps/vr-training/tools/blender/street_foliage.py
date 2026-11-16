"""Original cutout acacia-like street foliage. No photographed plants or identities.
The leaf tile is authored by prepare-street-textures.py; cards share street-trim.
"""
import math, random
from mathutils import Vector

def tree(kit, u, v, seed):
    rng = random.Random(seed)
    at, ss = kit.at, kit.ss
    ss('TreeBole', (u,0,v), (u+.18,3.5,v-.1), .15, 'rust', 8)
    for j in range(9):
        angle = j*math.tau/9
        dx, dz = math.cos(angle)*1.5, math.sin(angle)*1.35
        y = 3.7 + rng.uniform(-.35,.55)
        ss('TreeBranch', (u+.10,2.2,v), (u+dx,y,v+dz), .045, 'rust', 6)
        # Groups of airy compound-leaf sprays follow branch tips, with varied normals.
        for k in range(9):
            center = Vector(at(u+dx+rng.uniform(-.65,.65),y+rng.uniform(-.4,.6),v+dz+rng.uniform(-.65,.65)))
            a = rng.uniform(0,math.tau)
            normal = Vector((math.cos(a)*.8, rng.uniform(.25,.95), math.sin(a)*.8)).normalized()
            tangent = Vector((normal.z,0,-normal.x)).normalized()
            bitangent = normal.cross(tangent)
            w, h = rng.uniform(.8,1.25), rng.uniform(.65,1.05)
            verts = [tuple(center+tangent*x*w+bitangent*y*h) for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
            o=kit.mesh('CompoundLeafSpray',verts,[(0,1,2,3)],'leaf')
            # Explicit complete atlas tile; generic face projection would stretch diagonals.
            for face in o.data.polygons:
                for loop in face.loop_indices:
                    i=o.data.loops[loop].vertex_index
                    x,y=[(0,0),(1,0),(1,1),(0,1)][i]
                    o.data.uv_layers.active.data[loop].uv=((.015+x*.97)/4,1-(3+.015+y*.97)/4)
    # Weeds soften the kerb/tree contact with the same atlas and no extra draw.
    for j in range(8):
        x,z=u+rng.uniform(-.65,.65),v+rng.uniform(-.65,.65)
        a=rng.random()*math.tau; dx,dz=math.cos(a)*.18,math.sin(a)*.18
        kit.mesh('VergeWeed',[at(x-dx,.01,z-dz),at(x+dx,.01,z+dz),at(x+dx,.43,z+dz),at(x-dx,.43,z-dz)],[(0,1,2,3)],'leaf')
