# Writes public/skins/test-bot.glb: a tiny GLB skin with the node names the game animates
# (jaw, spinner, screen). Use it as a template for exported art. No dependencies.
import json, struct, math

def box(cx, cy, cz, sx, sy, sz):
    pos, nor, idx = [], [], []
    faces = [((1,0,0),(0,1,0),(0,0,1)), ((-1,0,0),(0,1,0),(0,0,-1)), ((0,1,0),(0,0,1),(1,0,0)),
             ((0,-1,0),(0,0,-1),(1,0,0)), ((0,0,1),(1,0,0),(0,1,0)), ((0,0,-1),(-1,0,0),(0,1,0))]
    for n, u, v in faces:
        base = len(pos)
        for a, b in ((-1,-1),(1,-1),(1,1),(-1,1)):
            p = [n[i]*0.5 + u[i]*0.5*a + v[i]*0.5*b for i in range(3)]
            pos.append((cx + p[0]*sx, cy + p[1]*sy, cz + p[2]*sz)); nor.append(n)
        # winding: ensure outward-facing (u x v == n)
        cross = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
        if sum(cross[i]*n[i] for i in range(3)) > 0: idx += [base, base+1, base+2, base, base+2, base+3]
        else: idx += [base, base+2, base+1, base, base+3, base+2]
    return pos, nor, idx

meshes_src = {
    'body':    (box(0, 0, 0, 1.0, 0.8, 0.8), (0.95, 0.2, 0.7, 1)),
    'jaw':     (box(0, 0, 0.25, 0.8, 0.18, 0.5), (1.0, 0.85, 0.2, 1)),
    'spinner': (box(0, 0, 0, 0.9, 0.08, 0.15), (0.1, 0.95, 1.0, 1)),
    'eyeL':    (box(0, 0, 0, 0.22, 0.22, 0.1), (1, 1, 1, 1)),
    'eyeR':    (box(0, 0, 0, 0.22, 0.22, 0.1), (1, 1, 1, 1)),
}
bin_ = bytearray(); bufferViews = []; accessors = []; meshes = []; materials = []
def add_view(data, target):
    while len(bin_) % 4: bin_.append(0)
    off = len(bin_); bin_.extend(data)
    bufferViews.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data), 'target': target})
    return len(bufferViews) - 1
for name, ((pos, nor, idx), color) in meshes_src.items():
    pv = add_view(b''.join(struct.pack('<3f', *p) for p in pos), 34962)
    nv = add_view(b''.join(struct.pack('<3f', *n) for n in nor), 34962)
    iv = add_view(b''.join(struct.pack('<H', i) for i in idx), 34963)
    mins = [min(p[i] for p in pos) for i in range(3)]; maxs = [max(p[i] for p in pos) for i in range(3)]
    accessors += [{'bufferView': pv, 'componentType': 5126, 'count': len(pos), 'type': 'VEC3', 'min': mins, 'max': maxs},
                  {'bufferView': nv, 'componentType': 5126, 'count': len(nor), 'type': 'VEC3'},
                  {'bufferView': iv, 'componentType': 5123, 'count': len(idx), 'type': 'SCALAR'}]
    materials.append({'name': name, 'pbrMetallicRoughness': {'baseColorFactor': list(color), 'metallicFactor': 0, 'roughnessFactor': 0.6}})
    a = len(accessors) - 3
    meshes.append({'name': name, 'primitives': [{'attributes': {'POSITION': a, 'NORMAL': a + 1}, 'indices': a + 2, 'material': len(materials) - 1}]})
names = list(meshes_src)
nodes = [
    {'name': 'test-bot', 'children': [1, 2, 3, 4, 5, 6]},
    {'name': 'body', 'mesh': names.index('body'), 'translation': [0, 0.4, 0]},
    {'name': 'jaw', 'mesh': names.index('jaw'), 'translation': [0, 0.08, 0.2]},
    {'name': 'spinner', 'mesh': names.index('spinner'), 'translation': [0, 0.86, 0]},
    {'name': 'eyeL', 'mesh': names.index('eyeL'), 'translation': [-0.22, 0.6, 0.42]},
    {'name': 'eyeR', 'mesh': names.index('eyeR'), 'translation': [0.22, 0.6, 0.42]},
    {'name': 'screen', 'translation': [0, 0.45, 0.41]},
]
gltf = {'asset': {'version': '2.0', 'generator': 'cruncher tools/make-test-skin.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': nodes, 'meshes': meshes, 'materials': materials, 'accessors': accessors, 'bufferViews': bufferViews,
        'buffers': [{'byteLength': len(bin_)}]}
js = json.dumps(gltf, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
while len(bin_) % 4: bin_.append(0)
total = 12 + 8 + len(js) + 8 + len(bin_)
out = struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(bin_), b'BIN\0') + bytes(bin_)
open('public/skins/test-bot.glb', 'wb').write(out)
print('wrote public/skins/test-bot.glb', len(out), 'bytes')
