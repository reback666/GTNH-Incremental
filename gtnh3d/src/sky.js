// Sky dome + atmosphere. A cheap gradient shader dome (one draw call) plus the
// scene fog that keeps the horizon soft, Minecraft-style.

import * as THREE from "three";

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  void main() {
    float h = normalize(vDir).y;
    vec3 c = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
    c = mix(uGround, c, smoothstep(-0.12, 0.04, h));
    gl_FragColor = vec4(c, 1.0);
  }
`;

export function createSky(scene) {
  const geo = new THREE.SphereGeometry(1, 24, 16);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color("#5b86c4") },
      uHorizon: { value: new THREE.Color("#c7d7e8") },
      uGround: { value: new THREE.Color("#8a8f96") },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.scale.setScalar(2000);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);
  return { dome, mat };
}
