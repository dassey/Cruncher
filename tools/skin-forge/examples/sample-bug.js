// Sample skin-forge input: the body of a function that receives THREE and returns the creature.
// This is the same shape the forge asks the model for (--style function).
// Run: npm run forge -- --id sample-bug --name "TOASTY" --code-file tools/skin-forge/examples/sample-bug.js
// "TOASTY": a toaster bug with spider legs and big googly eyes. Faces +Z, origin at the body centre.
const root = new THREE.Group();
root.name = 'toasty';

const chrome = new THREE.MeshStandardMaterial({ color: 0xff3d7f, metalness: 0.2, roughness: 0.35 });
const trim = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5 });
const dark = new THREE.MeshStandardMaterial({ color: 0x2a1a3a, roughness: 0.8 });
const toast = new THREE.MeshStandardMaterial({ color: 0xf2a65a, roughness: 0.9 });
const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
const black = new THREE.MeshStandardMaterial({ color: 0x0a0010, roughness: 0.2 });
const leg = new THREE.MeshStandardMaterial({ color: 0x29d3ff, roughness: 0.5 });

// Body: a rounded box made of a box plus two side cylinders.
const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.1), chrome);
root.add(body);
for (const side of [-1, 1]) {
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12), chrome);
  cap.position.set(side * 0.08, 0, 0);
  root.add(cap);
}
// Top trim and two toast slices poking out of the slots.
const top = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.1), trim);
top.position.y = 0.062;
root.add(top);
for (const z of [-0.022, 0.022]) {
  const slice = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.018), toast);
  slice.position.set(0, 0.075, z);
  slice.rotation.z = z > 0 ? 0.08 : -0.06;
  root.add(slice);
}
// Lever on the side: it spins like a little propeller.
const spinner = new THREE.Group();
spinner.name = 'spinner';
spinner.position.set(0.135, 0.02, 0);
const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.07), trim);
spinner.add(blade);
const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 6), dark);
spinner.add(knob);
root.add(spinner);

// Jaw: a grille "mouth" on the front, hinged at its top edge.
const jaw = new THREE.Group();
jaw.name = 'jaw';
jaw.position.set(0, -0.018, 0.05);
const grille = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.012), dark);
grille.position.set(0, -0.015, 0.004);
jaw.add(grille);
for (const x of [-0.03, 0, 0.03]) {
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.01, 0.006), white);
  tooth.position.set(x, -0.003, 0.012);
  jaw.add(tooth);
}
root.add(jaw);

// Big googly eyes: [0] eyeball, [1] pupil.
for (const [nm, x] of [['eyeL', -0.04], ['eyeR', 0.04]]) {
  const eye = new THREE.Group();
  eye.name = nm;
  eye.position.set(x, 0.03, 0.055);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 10), white);
  ball.scale.z = 0.7;
  eye.add(ball);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), black);
  pupil.position.set(0, -0.004, 0.019);
  pupil.scale.z = 0.6;
  eye.add(pupil);
  root.add(eye);
}

// Six spider legs, pivot at the hip, bent knee.
const upper = new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6);
const lower = new THREE.CylinderGeometry(0.006, 0.003, 0.08, 6);
let n = 1;
for (const side of [-1, 1]) {
  for (const z of [-0.035, 0, 0.035]) {
    const hip = new THREE.Group();
    hip.name = `leg${n++}`;
    hip.position.set(side * 0.07, -0.045, z);
    hip.rotation.y = side * z * 6;
    const thigh = new THREE.Mesh(upper, leg);
    thigh.rotation.z = side * -1.0;
    thigh.position.set(side * 0.03, 0.02, 0);
    hip.add(thigh);
    const shin = new THREE.Mesh(lower, leg);
    shin.rotation.z = side * 0.35;
    shin.position.set(side * 0.07, -0.02, 0);
    hip.add(shin);
    root.add(hip);
  }
}
return root;
