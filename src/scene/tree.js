import * as THREE from 'three';

// Small seeded RNG so the tree is the same on every visit.
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

function perp(d) {
  const a = Math.abs(d.y) < 0.9 ? UP : RIGHT;
  return new THREE.Vector3().crossVectors(d, a).normalize();
}

/**
 * Grows the branch skeleton: a short leaning trunk, four wide limbs that level
 * out, and twigs that droop at the tips, the way an old cherry tree spreads.
 */
export function generateTree(seed = 23) {
  const rand = mulberry32(seed);
  const R = (a, b) => a + (b - a) * rand();
  const MAX = 6;
  const branches = [];
  const anchors = [];
  let maxDist = 0;

  function grow(start, dir, length, radius, depth, dist) {
    const segs = depth === 0 ? 8 : depth < 3 ? 6 : 4;
    const segLen = length / segs;
    const endR = Math.max(0.007, radius * 0.75);
    const pts = [start.clone()];
    const radii = [depth === 0 ? radius * 1.6 : radius];
    const dists = [dist];
    const p = start.clone();
    const d = dir.clone().normalize();
    const wob = depth === 0 ? 0.09 : 0.2 + depth * 0.03;

    for (let i = 1; i <= segs; i++) {
      d.x += R(-wob, wob);
      d.z += R(-wob, wob);
      d.y += R(-wob, wob) * 0.6;
      if (depth >= 1 && depth <= 2) d.y += (0.36 - d.y) * 0.2;
      else if (depth >= 3) d.y -= 0.04 * (depth - 2);
      if (p.y < 2.1 && depth > 0) d.y += 0.25;
      d.normalize();
      p.addScaledVector(d, segLen);
      pts.push(p.clone());
      let r = radius + (endR - radius) * (i / segs);
      if (depth === 0 && i === 1) r = radius * 1.18;
      radii.push(r);
      const here = dist + segLen * i;
      dists.push(here);

      if (depth >= 3 || (depth === 2 && i > segs / 2)) {
        anchors.push({ pos: p.clone(), dir: d.clone(), dist: here, depth });
      }
      if (depth >= 1 && depth < MAX - 1 && i < segs && rand() < 0.2) {
        const axis = perp(d).applyAxisAngle(d, R(0, Math.PI * 2));
        const sd = d.clone().applyAxisAngle(axis, R(0.6, 1.1));
        grow(p.clone(), sd, length * R(0.4, 0.6), r * 0.5, Math.min(MAX, depth + 2), here);
      }
    }

    branches.push({ pts, radii, dists, depth });
    const endDist = dist + length;
    if (endDist > maxDist) maxDist = endDist;

    if (depth >= MAX) {
      anchors.push({ pos: p.clone(), dir: d.clone(), dist: endDist, depth, tip: true });
      return;
    }
    const n = depth === 0 ? 4 : rand() < 0.3 ? 3 : 2;
    const rot0 = R(0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const axis = perp(d).applyAxisAngle(d, rot0 + (k / n) * Math.PI * 2 + R(-0.4, 0.4));
      const spread = depth === 0 ? R(0.75, 1.05) : R(0.38, 0.72);
      const cd = d.clone().applyAxisAngle(axis, spread);
      const len = length * (depth === 0 ? R(1.0, 1.25) : R(0.7, 0.86));
      const cr = endR * (depth === 0 ? 0.62 : n === 2 ? 0.8 : 0.7);
      grow(p.clone(), cd, len, cr, depth + 1, endDist);
    }
  }

  grow(new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0.08, 1, 0.03), 2.3, 0.3, 0, 0);
  return { branches, anchors, maxDist, rand };
}

/** Turns the skeleton into one tube mesh. Each vertex knows when it is "born". */
export function buildBranchGeometry({ branches, maxDist }) {
  let vCount = 0;
  let iCount = 0;
  const sidesFor = (depth) => (depth < 2 ? 9 : depth < 4 ? 6 : 4);
  for (const b of branches) {
    const s = sidesFor(b.depth);
    vCount += b.pts.length * s;
    iCount += (b.pts.length - 1) * s * 6;
  }
  const position = new Float32Array(vCount * 3);
  const axisArr = new Float32Array(vCount * 3);
  const normal = new Float32Array(vCount * 3);
  const birth = new Float32Array(vCount);
  const index = new Uint32Array(iCount);

  const t = new THREE.Vector3();
  const n = new THREE.Vector3();
  const bn = new THREE.Vector3();
  const rad = new THREE.Vector3();
  let v = 0;
  let ii = 0;

  for (const b of branches) {
    const sides = sidesFor(b.depth);
    const base = v;
    const last = b.pts.length - 1;
    t.subVectors(b.pts[1], b.pts[0]).normalize();
    n.copy(perp(t));
    for (let i = 0; i <= last; i++) {
      const a = b.pts[Math.max(0, i - 1)];
      const c = b.pts[Math.min(last, i + 1)];
      t.subVectors(c, a).normalize();
      n.addScaledVector(t, -n.dot(t)).normalize();
      bn.crossVectors(t, n);
      const p = b.pts[i];
      const r = b.radii[i];
      for (let s = 0; s < sides; s++) {
        const ang = (s / sides) * Math.PI * 2;
        rad.copy(n).multiplyScalar(Math.cos(ang)).addScaledVector(bn, Math.sin(ang));
        position[v * 3] = p.x + rad.x * r;
        position[v * 3 + 1] = p.y + rad.y * r;
        position[v * 3 + 2] = p.z + rad.z * r;
        axisArr[v * 3] = p.x;
        axisArr[v * 3 + 1] = p.y;
        axisArr[v * 3 + 2] = p.z;
        normal[v * 3] = rad.x;
        normal[v * 3 + 1] = rad.y;
        normal[v * 3 + 2] = rad.z;
        birth[v] = b.dists[i] / maxDist;
        v++;
      }
    }
    for (let i = 0; i < last; i++) {
      for (let s = 0; s < sides; s++) {
        const a0 = base + i * sides + s;
        const a1 = base + i * sides + ((s + 1) % sides);
        const b0 = a0 + sides;
        const b1 = a1 + sides;
        index[ii++] = a0; index[ii++] = b0; index[ii++] = a1;
        index[ii++] = a1; index[ii++] = b0; index[ii++] = b1;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('aAxis', new THREE.BufferAttribute(axisArr, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return geo;
}

/** Scatters blossoms in small clusters along the outer branches. */
export function buildBlossomData({ anchors, maxDist, rand }, count) {
  const R = (a, b) => a + (b - a) * rand();
  const iPos = new Float32Array(count * 3);
  const iQuat = new Float32Array(count * 4);
  const iA = new Float32Array(count * 4); // bloom order, branch birth, size, shed order
  const iTint = new Float32Array(count);
  const q = new THREE.Quaternion();
  const roll = new THREE.Quaternion();
  const nrm = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1);
  const centre = new THREE.Vector3(0, 4.2, 0);

  let i = 0;
  while (i < count) {
    const a = anchors[Math.floor(rand() * anchors.length)];
    const cluster = Math.min(count - i, a.tip ? 5 + Math.floor(rand() * 5) : 3 + Math.floor(rand() * 4));
    const spreadR = a.tip ? 0.3 : 0.22;
    const order = rand();
    for (let c = 0; c < cluster; c++, i++) {
      const ox = R(-1, 1) * spreadR;
      const oy = R(-1, 1) * spreadR;
      const oz = R(-1, 1) * spreadR;
      const px = a.pos.x + ox;
      const py = a.pos.y + oy;
      const pz = a.pos.z + oz;
      iPos[i * 3] = px;
      iPos[i * 3 + 1] = py;
      iPos[i * 3 + 2] = pz;

      nrm.set(px - centre.x, py - centre.y, pz - centre.z).normalize();
      nrm.x += R(-0.9, 0.9);
      nrm.y += R(-0.9, 0.9);
      nrm.z += R(-0.9, 0.9) + 0.35; // lean a little toward the usual camera side
      nrm.normalize();
      q.setFromUnitVectors(Z, nrm);
      roll.setFromAxisAngle(Z, R(0, Math.PI * 2));
      q.multiply(roll);
      iQuat[i * 4] = q.x;
      iQuat[i * 4 + 1] = q.y;
      iQuat[i * 4 + 2] = q.z;
      iQuat[i * 4 + 3] = q.w;

      iA[i * 4] = Math.min(0.93, order * 0.62 + rand() * 0.22 + (a.dist / maxDist) * 0.12);
      iA[i * 4 + 1] = Math.min(0.95, a.dist / maxDist);
      iA[i * 4 + 2] = R(0.17, 0.3);
      iA[i * 4 + 3] = rand() * 1.5;
      iTint[i] = rand();
    }
  }
  return { iPos, iQuat, iA, iTint };
}
