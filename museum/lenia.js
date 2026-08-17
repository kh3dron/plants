// Lenia (Chan 2019): Conway's Life with continuous states, space and time.
// Convolve with a smooth ring kernel, feed the result through a gaussian
// growth curve, integrate. Parameters below were selected by a CPU search for
// regimes that stay alive when seeded from random blobs (see tools note in
// the commit). Same ping-pong structure as reaction.js.
import * as THREE from "three";
import { makeRng } from "./lsystem.js";

function bell(x, m, s) {
  return Math.exp(-((x - m) * (x - m)) / (2 * s * s));
}

// ring kernel bell(r; 0.5, 0.15), normalized, packed into a DataTexture
function kernelTexture(R) {
  const S = 2 * R + 1;
  const w = new Float32Array(S * S * 4);
  let sum = 0;
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const r = Math.sqrt(x * x + y * y) / R;
      const k = r < 1 ? bell(r, 0.5, 0.15) : 0;
      w[((y + R) * S + (x + R)) * 4] = k;
      sum += k;
    }
  }
  for (let i = 0; i < S * S; i++) w[i * 4] /= sum;
  const tex = new THREE.DataTexture(w, S, S, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const SIM_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const simFrag = (R) => /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tex;
uniform sampler2D kern;
uniform vec2 texel;
uniform float gm;
uniform float gs;
uniform float dt;
const int R = ${R};
const float S = ${2 * R + 1}.0;
void main() {
  float u = 0.0;
  for (int ky = -R; ky <= R; ky++) {
    for (int kx = -R; kx <= R; kx++) {
      float w = texture2D(kern, vec2((float(kx + R) + 0.5) / S, (float(ky + R) + 0.5) / S)).r;
      u += w * texture2D(tex, vUv + vec2(float(kx), float(ky)) * texel).r;
    }
  }
  float a = texture2D(tex, vUv).r;
  float d = (u - gm) / gs;
  float g = 2.0 * exp(-0.5 * d * d) - 1.0;
  gl_FragColor = vec4(clamp(a + dt * g, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

const DISP_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DISP_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tex;
uniform vec3 cBg;
uniform vec3 cMid;
uniform vec3 cHot;
void main() {
  float a = texture2D(tex, vUv).r;
  vec3 col = mix(cBg, cMid, smoothstep(0.02, 0.4, a));
  col = mix(col, cHot, smoothstep(0.35, 0.9, a));
  gl_FragColor = vec4(col, 1.0);
}`;

export function buildLeniaPanel(v) {
  const N = v.res || 160;
  const R = Math.max(4, Math.min(v.R || 10, 16));
  const rng = makeRng(v.seed || 1);

  // random gaussian blob seeding (mirrors the CPU parameter search)
  const data = new Float32Array(N * N * 4);
  const blobs = v.blobs || 20;
  for (let b = 0; b < blobs; b++) {
    const bx = rng() * N;
    const by = rng() * N;
    const br = 4 + rng() * 8;
    const amp = 0.5 + rng() * 0.5;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let dx = Math.abs(x - bx);
        let dy = Math.abs(y - by);
        dx = Math.min(dx, N - dx);
        dy = Math.min(dy, N - dy);
        const i = (y * N + x) * 4;
        data[i] = Math.min(1, data[i] + amp * Math.exp(-(dx * dx + dy * dy) / (2 * br * br)));
      }
    }
  }
  const seedTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.FloatType);
  seedTex.needsUpdate = true;

  const mkTarget = () =>
    new THREE.WebGLRenderTarget(N, N, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    });
  const targets = [mkTarget(), mkTarget()];

  const simMat = new THREE.ShaderMaterial({
    vertexShader: SIM_VERT,
    fragmentShader: simFrag(R),
    uniforms: {
      tex: { value: seedTex },
      kern: { value: kernelTexture(R) },
      texel: { value: new THREE.Vector2(1 / N, 1 / N) },
      gm: { value: v.m },
      gs: { value: v.s },
      dt: { value: v.dt || 0.1 },
    },
  });
  const simScene = new THREE.Scene();
  simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMat));
  const simCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const dispMat = new THREE.ShaderMaterial({
    vertexShader: DISP_VERT,
    fragmentShader: DISP_FRAG,
    toneMapped: false,
    uniforms: {
      tex: { value: seedTex },
      cBg: { value: new THREE.Color(v.bg || "#020d12") },
      cMid: { value: new THREE.Color(v.mid || "#0f8f7a") },
      cHot: { value: new THREE.Color(v.hot || "#d9fff0") },
    },
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), dispMat);
  const group = new THREE.Group();
  group.add(panel);

  let cur = 0;
  let seeded = false;
  const steps = Math.max(1, Math.min(v.steps || 6, 12));
  const tick = (dt, ctx) => {
    const renderer = ctx && ctx.renderer;
    if (!renderer) return;
    const prev = renderer.getRenderTarget();
    for (let i = 0; i < steps; i++) {
      simMat.uniforms.tex.value = seeded ? targets[cur].texture : seedTex;
      renderer.setRenderTarget(targets[1 - cur]);
      renderer.render(simScene, simCam);
      cur = 1 - cur;
      seeded = true;
    }
    renderer.setRenderTarget(prev);
    dispMat.uniforms.tex.value = targets[cur].texture;
  };

  return { group, tick };
}
