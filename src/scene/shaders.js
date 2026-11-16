// GLSL for the tree. Everything animates on the GPU: branch growth, blossom
// opening and every falling petal are functions of a few scroll-driven uniforms.

const COMMON = /* glsl */ `
uniform float uTime;
uniform float uWind;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;

// One wind field for the whole tree, so branches and the blossoms sitting on
// them move together.
vec3 sway(vec3 p) {
  float h = smoothstep(1.2, 7.5, p.y);
  float reach = length(p.xz);
  float amp = (0.05 * h + 0.014 * reach * h) * uWind;
  return vec3(
    sin(uTime * 0.9 + p.x * 0.35 + p.y * 0.5),
    sin(uTime * 1.3 + p.x * 0.8 + p.z * 0.6) * 0.3,
    cos(uTime * 0.7 + p.z * 0.4 + p.y * 0.3)
  ) * amp;
}
`;

export const barkVert = /* glsl */ `
${COMMON}
attribute vec3 aAxis;
attribute float aBirth;
uniform float uGrow;
varying vec3 vN;
varying vec3 vView;
varying float vDist;
void main() {
  float g = clamp((uGrow - aBirth) / 0.045, 0.0, 1.0);
  vec3 p = aAxis + (position - aAxis) * g;
  p += sway(aAxis);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

export const barkFrag = /* glsl */ `
uniform vec3 uBark;
uniform vec3 uRim;
uniform float uRimAmt;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vN;
varying vec3 vView;
varying float vDist;
void main() {
  float rim = pow(1.0 - max(dot(normalize(vN), normalize(vView)), 0.0), 2.4);
  vec3 col = uBark + uRim * rim * uRimAmt;
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, vDist) * 0.85);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export const blossomVert = /* glsl */ `
${COMMON}
attribute vec3 iPos;
attribute vec4 iQuat;
attribute vec4 iA;
attribute float iTint;
uniform float uGrow;
uniform float uBloom;
uniform float uShed;
varying vec2 vUv;
varying float vTint;
varying float vOpen;
varying float vDist;
varying float vLight;

vec3 qrot(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}
float backOut(float x) {
  float y = x - 1.0;
  return 1.0 + 2.70158 * y * y * y + 1.70158 * y * y;
}
void main() {
  float grown = smoothstep(iA.y, iA.y + 0.05, uGrow);
  float b = clamp((uBloom - iA.x) / 0.07, 0.0, 1.0);
  float open = b > 0.0 ? backOut(b) : 0.0;
  float shed = 1.0 - smoothstep(iA.w - 0.04, iA.w + 0.04, uShed);
  float s = iA.z * mix(0.2, 1.0, open) * grown * shed;

  vec3 local = vec3(position.xy * s, 0.0);
  local.z += dot(position.xy, position.xy) * s * 0.9 * open;
  float flutter = sin(uTime * 2.1 + iTint * 40.0) * 0.06 * uWind;
  local.z += position.x * flutter * s;

  vec3 wp = iPos + sway(iPos) + qrot(iQuat, local);
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  vec3 n = qrot(iQuat, vec3(0.0, 0.0, 1.0));
  vLight = dot(n, normalize(vec3(0.35, 0.85, 0.4))) * 0.5 + 0.5;
  vUv = uv;
  vTint = iTint;
  vOpen = clamp(open, 0.0, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

export const blossomFrag = /* glsl */ `
uniform vec3 uPetalA;
uniform vec3 uPetalB;
uniform vec3 uCore;
uniform vec3 uStamen;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform float uGlow;
varying vec2 vUv;
varying float vTint;
varying float vOpen;
varying float vDist;
varying float vLight;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  // five petals, each with the small notch at its tip that makes it a sakura
  float seg = mod(a, 1.2566371) - 0.6283185;
  float c = cos(seg * 2.5);
  float edge = 0.94 * pow(max(c, 0.0), 0.36);
  edge -= 0.12 * exp(-seg * seg / 0.006);
  float alpha = 1.0 - smoothstep(edge - 0.07, edge, r);
  if (alpha < 0.05) discard;

  vec3 col = mix(uPetalA, uPetalB, smoothstep(0.12, 0.92, r));
  col *= 0.9 + 0.1 * smoothstep(0.0, 0.45, abs(seg));
  col = mix(uCore, col, smoothstep(0.06, 0.3, r));
  float sa = mod(a + 0.31, 0.6283185) - 0.3141593;
  float st = 1.0 - smoothstep(0.02, 0.06, length(vec2(sa * r, r - 0.3)));
  col = mix(col, uStamen, st * vOpen);
  col = mix(uPetalA * 0.85, col, 0.25 + 0.75 * vOpen);
  col *= mix(0.78, 1.06, vLight);
  col = mix(col, vec3(1.0), vTint * vTint * 0.2);
  col += uPetalB * uGlow * (0.05 + 0.1 * vTint);
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, vDist) * 0.8);
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;

// MODE 0: petals that let go of the tree and fall to the ground, on a loop.
// MODE 1: a wrapped field of petals around the camera, for depth.
// MODE 2: petals that have settled on the ground.
export const petalVert = /* glsl */ `
${COMMON}
attribute vec4 iSeed;
attribute vec3 iOrigin;
uniform float uFlow;
uniform float uFall;
uniform float uCarpet;
uniform vec3 uCam;
uniform vec3 uBox;
uniform vec2 uWindDir;
varying vec2 vUv;
varying float vDist;
varying float vLight;
varying float vSeed;

vec3 rotAxis(vec3 v, vec3 ax, float an) {
  float c = cos(an);
  float s = sin(an);
  return v * c + cross(ax, v) * s + ax * dot(ax, v) * (1.0 - c);
}
void main() {
  vec3 centre;
  float s;
  vec3 ax = normalize(iSeed.xyz - 0.5 + 0.0011);
  float an;
  vec3 local;
  vec3 n;

#if MODE == 0
  float act = step(iSeed.w, uFall);
  float speed = mix(0.03, 0.06, iSeed.x);
  float life = fract(uFlow * speed + iSeed.y * 7.0);
  float y0 = iOrigin.y;
  float ease = smoothstep(0.0, 0.2, life);
  centre = iOrigin;
  centre.y = mix(y0, 0.05, pow(life, 1.2));
  float drift = life * y0 * 0.5;
  centre.x += uWindDir.x * drift + sin(life * 10.0 + iSeed.z * 40.0) * 0.4 * ease;
  centre.z += uWindDir.y * drift + cos(life * 8.0 + iSeed.x * 40.0) * 0.4 * ease;
  s = smoothstep(0.0, 0.03, life) * (1.0 - smoothstep(0.95, 1.0, life)) * act * mix(0.08, 0.13, iSeed.z);
  an = uFlow * mix(1.4, 3.6, iSeed.z) + iSeed.y * 30.0;
  local = rotAxis(vec3(position.xy * s, 0.0), ax, an);
  n = rotAxis(vec3(0.0, 0.0, 1.0), ax, an);
#elif MODE == 1
  vec3 base = iSeed.xyz * uBox;
  base.y -= uFlow * mix(0.25, 0.55, iSeed.w);
  base.x += uFlow * uWindDir.x * 0.35 + sin(uFlow * 0.6 + iSeed.y * 30.0) * 0.5;
  base.z += uFlow * uWindDir.y * 0.35 + cos(uFlow * 0.5 + iSeed.x * 30.0) * 0.5;
  vec3 rel = mod(base - uCam, uBox) - uBox * 0.5;
  centre = uCam + rel;
  vec3 e = abs(rel) / uBox;
  float edgeFade = 1.0 - smoothstep(0.38, 0.5, max(e.x, max(e.y, e.z)));
  float act = step(fract(iSeed.w * 13.37), uFall);
  s = act * edgeFade * step(0.03, centre.y) * mix(0.07, 0.12, iSeed.z);
  an = uFlow * mix(1.2, 3.2, iSeed.x) + iSeed.z * 30.0;
  local = rotAxis(vec3(position.xy * s, 0.0), ax, an);
  n = rotAxis(vec3(0.0, 0.0, 1.0), ax, an);
#else
  centre = iOrigin;
  s = mix(0.09, 0.15, iSeed.z) * smoothstep(iSeed.w, iSeed.w + 0.04, uCarpet);
  an = iSeed.x * 6.2831853;
  vec3 lay = vec3(position.x, (position.x * (iSeed.y - 0.5) + position.y * (iSeed.z - 0.5)) * 0.35, position.y) * s;
  local = rotAxis(lay, vec3(0.0, 1.0, 0.0), an);
  n = vec3(0.0, 1.0, 0.0);
#endif

  vec4 mv = modelViewMatrix * vec4(centre, 1.0);
#if MODE == 1
  local *= smoothstep(0.5, 1.6, -mv.z);
#endif
  mv = modelViewMatrix * vec4(centre + local, 1.0);
  vLight = abs(dot(n, normalize(vec3(0.35, 0.85, 0.4))));
  vUv = uv;
  vSeed = iSeed.z;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

export const petalFrag = /* glsl */ `
uniform vec3 uPetalA;
uniform vec3 uPetalB;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
uniform float uGlow;
uniform float uIrid;
uniform vec3 uIr0;
uniform vec3 uIr1;
uniform vec3 uIr2;
uniform vec3 uIr3;
varying vec2 vUv;
varying float vDist;
varying float vLight;
varying float vSeed;

// magenta, violet, aqua, gold, and round again
vec3 sheen(float h) {
  h = fract(h) * 4.0;
  float f = smoothstep(0.0, 1.0, fract(h));
  if (h < 1.0) return mix(uIr0, uIr1, f);
  if (h < 2.0) return mix(uIr1, uIr2, f);
  if (h < 3.0) return mix(uIr2, uIr3, f);
  return mix(uIr3, uIr0, f);
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float e = length(vec2(p.x / 0.62, (p.y - 0.12) / 0.82));
  float taper = 0.62 * smoothstep(-0.98, -0.1, p.y);
  float d = max(e - 1.0, (abs(p.x) - taper) * 1.6);
  float notch = (p.y - 0.6) - 2.2 * abs(p.x);
  d = max(d, notch * 0.5);
  float alpha = 1.0 - smoothstep(-0.1, 0.0, d);
  if (alpha < 0.05) discard;
  vec3 col = mix(uPetalA, uPetalB, smoothstep(-0.9, 0.5, p.y));
  // up to two petals in five turn iridescent at night; the hue slides as each one tumbles
  float pick = smoothstep(0.0, 0.06, 0.4 * uIrid - fract(vSeed * 7.31 + 0.17));
  col = mix(col, sheen(vSeed * 3.0 + vLight * 0.6 + p.y * 0.12), pick * 0.85);
  col *= mix(0.8, 1.08, vLight);
  col = mix(col, vec3(1.0), vSeed * vSeed * 0.25);
  col += uPetalB * uGlow * 0.1;
  col = mix(col, uFog, smoothstep(uFogNear, uFogFar, vDist) * 0.8);
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;

export const groundVert = /* glsl */ `
varying vec3 vWorld;
varying float vDist;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

export const groundFrag = /* glsl */ `
uniform vec3 uGround;
uniform vec3 uFog;
uniform float uShade;
uniform float uAlpha;
varying vec3 vWorld;
varying float vDist;
void main() {
  float r = length(vWorld.xz);
  vec3 col = mix(uGround, uFog, smoothstep(2.0, 24.0, r));
  col *= 1.0 - uShade * exp(-r * r / 16.0);
  float alpha = (1.0 - smoothstep(3.0, 20.0, r)) * uAlpha;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;
