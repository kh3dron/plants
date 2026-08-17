// Gray–Scott reaction–diffusion, live on the GPU. Two chemicals diffuse at
// different rates; U feeds V, V consumes U. Ping-pong render targets advance
// the sim a few steps per frame via the tick(dt, ctx) hook — ctx carries the
// active renderer (hall/room loop or the focus bench). Discretization and
// presets follow Karl Sims' RD tutorial (Du=1, Dv=0.5, dt=1, 9-point laplacian).
import * as THREE from "three";
import { makeRng } from "./lsystem.js";

const SIM_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const SIM_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tex;
uniform vec2 texel;
uniform float feed;
uniform float kill;
void main() {
  vec2 c = texture2D(tex, vUv).rg;
  vec2 lap = -c
    + 0.2  * texture2D(tex, vUv + vec2(-texel.x, 0.0)).rg
    + 0.2  * texture2D(tex, vUv + vec2( texel.x, 0.0)).rg
    + 0.2  * texture2D(tex, vUv + vec2(0.0, -texel.y)).rg
    + 0.2  * texture2D(tex, vUv + vec2(0.0,  texel.y)).rg
    + 0.05 * texture2D(tex, vUv + vec2(-texel.x, -texel.y)).rg
    + 0.05 * texture2D(tex, vUv + vec2( texel.x, -texel.y)).rg
    + 0.05 * texture2D(tex, vUv + vec2(-texel.x,  texel.y)).rg
    + 0.05 * texture2D(tex, vUv + vec2( texel.x,  texel.y)).rg;
  float u = c.r;
  float v = c.g;
  float uvv = u * v * v;
  float du = 1.0 * lap.r - uvv + feed * (1.0 - u);
  float dv = 0.5 * lap.g + uvv - (feed + kill) * v;
  gl_FragColor = vec4(clamp(u + du, 0.0, 1.0), clamp(v + dv, 0.0, 1.0), 0.0, 1.0);
}`;

const DISP_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tex;
uniform vec3 cBg;
uniform vec3 cMid;
uniform vec3 cHot;
void main() {
  float v = texture2D(tex, vUv).g;
  vec3 col = mix(cBg, cMid, smoothstep(0.05, 0.3, v));
  col = mix(col, cHot, smoothstep(0.25, 0.55, v));
  gl_FragColor = vec4(col, 1.0);
}`;

const DISP_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export function buildReactionPanel(v) {
  const SIZE = v.res || 256;
  const rng = makeRng(v.seed || 1);

  // initial state: U=1 everywhere, a few random blobs of V
  const data = new Float32Array(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) data[i * 4] = 1;
  const blobs = v.blobs || 14;
  for (let b = 0; b < blobs; b++) {
    const bx = Math.floor(rng() * SIZE);
    const by = Math.floor(rng() * SIZE);
    const r = 3 + Math.floor(rng() * 5);
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        const px = (bx + x + SIZE) % SIZE;
        const py = (by + y + SIZE) % SIZE;
        const i = (py * SIZE + px) * 4;
        data[i] = 0.5;
        data[i + 1] = 0.25;
      }
    }
  }
  const seedTex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.FloatType);
  seedTex.needsUpdate = true;

  const mkTarget = () =>
    new THREE.WebGLRenderTarget(SIZE, SIZE, {
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
    fragmentShader: SIM_FRAG,
    uniforms: {
      tex: { value: seedTex },
      texel: { value: new THREE.Vector2(1 / SIZE, 1 / SIZE) },
      feed: { value: v.feed },
      kill: { value: v.kill },
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
      cBg: { value: new THREE.Color(v.bg || "#04121a") },
      cMid: { value: new THREE.Color(v.mid || "#1f8f8f") },
      cHot: { value: new THREE.Color(v.hot || "#c9ffe8") },
    },
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), dispMat);

  const group = new THREE.Group();
  group.add(panel);

  let cur = 0;
  let seeded = false;
  const steps = Math.max(1, Math.min(v.steps || 12, 40));
  const tick = (dt, ctx) => {
    const renderer = ctx && ctx.renderer;
    if (!renderer) return; // headless / no GL: stay on the seed image
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
