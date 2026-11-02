import * as THREE from 'three';
import { WorldFrame } from './world-frame';

export type PointColorMode = 'height' | 'natural';

export interface PointStyle {
  /** CSS pixels. */
  readonly size: number;
  readonly colorMode: PointColorMode;
}

const VERTEX = /* glsl */ `
uniform float uSize;
uniform float uPixelRatio;
varying float vZ;
void main() {
  vZ = position.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * uPixelRatio;
}
`;

// Round, opaque points: discard outside the unit circle; depth write on, no blending.
const FRAGMENT = /* glsl */ `
uniform float uZMin;
uniform float uZMax;
uniform float uHeightMode;
uniform vec3 uLow;
uniform vec3 uHigh;
uniform vec3 uNatural;
varying float vZ;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  if (dot(c, c) > 1.0) discard;
  float h = clamp((vZ - uZMin) / max(1e-3, uZMax - uZMin), 0.0, 1.0);
  vec3 col = mix(uNatural, mix(uLow, uHigh, h), uHeightMode);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/**
 * Synthetic surface scan as ONE THREE.Points. Positions arrive in domain
 * coordinates and are converted in place (the renderer owns the buffer).
 */
export class PointCloudLayer {
  readonly mesh: THREE.Points;
  readonly count: number;
  private readonly material: THREE.ShaderMaterial;

  constructor(frame: WorldFrame, positions: Float32Array, zRange: readonly [number, number], pixelRatio: number, style: PointStyle) {
    const [ox, oy, oz] = frame.origin;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] -= ox;
      positions[i + 1] -= oy;
      positions[i + 2] -= oz;
    }
    this.count = positions.length / 3;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
    const lin = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uSize: { value: style.size },
        uPixelRatio: { value: pixelRatio },
        uZMin: { value: zRange[0] - oz },
        uZMax: { value: zRange[1] - oz },
        uHeightMode: { value: style.colorMode === 'height' ? 1 : 0 },
        uLow: { value: lin(0.3, 0.36, 0.44) },
        uHigh: { value: lin(0.7, 0.66, 0.58) },
        uNatural: { value: lin(0.6, 0.57, 0.52) },
      },
    });
    this.mesh = new THREE.Points(geometry, this.material);
    this.mesh.renderOrder = 1;
  }

  setStyle(style: PointStyle): void {
    this.material.uniforms['uSize'].value = style.size;
    this.material.uniforms['uHeightMode'].value = style.colorMode === 'height' ? 1 : 0;
  }

  setPixelRatio(pr: number): void {
    this.material.uniforms['uPixelRatio'].value = pr;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
