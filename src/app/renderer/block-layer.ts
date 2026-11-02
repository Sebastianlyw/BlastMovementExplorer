import * as THREE from 'three';
import { BlockModel, Vec3 } from '../domain/types';
import { ColorScale, DISPLACEMENT_SCALE, GRADE_SCALE, sampleScale } from './colormap';
import { pickNearest, Ray } from './picking';
import { WorldFrame } from './world-frame';

export type BlockColorMode = 'grade' | 'displacement';

/** Visual gap between blocks. Tonnes always use true dimensions. */
const BLOCK_VISUAL_SCALE = 0.94;

const VERTEX_PARS = /* glsl */ `
attribute vec3 aBefore;
attribute vec3 aAfter;
attribute vec3 aSize;
uniform float uT;
uniform float uVisualScale;
uniform float uSectionOn;
uniform float uSectionZ;
`;

// Same interpolation and section rule as the CPU picker (see pickAt).
const BEGIN_VERTEX = /* glsl */ `
vec3 blockCenter = aBefore * (1.0 - uT) + aAfter * uT;
// hidden = 1 when the section is on and centre.z > uSectionZ (collapses the box to a point).
float hidden = uSectionOn * (1.0 - step(blockCenter.z, uSectionZ));
vec3 transformed = position * aSize * uVisualScale * (1.0 - hidden) + blockCenter;
`;

/**
 * The block model as ONE InstancedMesh. Placement comes from per-instance
 * before/after attributes interpolated in the vertex shader (instanceMatrix
 * stays identity). Visible blocks are compacted into the first `count`
 * instances; `instanceToBlock` maps instance index → stable block id.
 */
export class BlockLayer {
  readonly mesh: THREE.InstancedMesh;
  private readonly uniforms = {
    uT: { value: 0 },
    uVisualScale: { value: BLOCK_VISUAL_SCALE },
    uSectionOn: { value: 0 },
    uSectionZ: { value: 0 },
  };

  // Full-model render-space data, indexed by block index.
  private readonly allBefore: Float32Array;
  private readonly allAfter: Float32Array;
  private readonly gradeRgb: Float32Array;
  private readonly dispRgb: Float32Array;

  // Compacted instance data (the GPU attributes' backing arrays).
  private readonly aBefore: THREE.InstancedBufferAttribute;
  private readonly aAfter: THREE.InstancedBufferAttribute;
  private readonly aSize: THREE.InstancedBufferAttribute;
  private readonly instanceToBlock: Int32Array;
  private readonly instanceToIndex: Int32Array;
  private readonly halfSize: Float32Array;
  private visibleCount: number;
  private colorMode: BlockColorMode = 'grade';
  private visibleMask: Uint8Array | null = null;

  constructor(
    private readonly model: BlockModel,
    private readonly frame: WorldFrame,
  ) {
    const n = model.count;
    this.allBefore = frame.bufferToRender(model.before);
    this.allAfter = frame.bufferToRender(model.after);
    this.gradeRgb = new Float32Array(n * 3);
    this.dispRgb = new Float32Array(n * 3);
    this.fillColors(GRADE_SCALE, (i) => model.grade[i], this.gradeRgb);
    this.fillColors(
      DISPLACEMENT_SCALE,
      (i) =>
        Math.hypot(
          model.after[i * 3] - model.before[i * 3],
          model.after[i * 3 + 1] - model.before[i * 3 + 1],
          model.after[i * 3 + 2] - model.before[i * 3 + 2],
        ),
      this.dispRgb,
    );

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    this.aBefore = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aAfter = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    geometry.setAttribute('aBefore', this.aBefore);
    geometry.setAttribute('aAfter', this.aAfter);
    geometry.setAttribute('aSize', this.aSize);

    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
        .replace('#include <begin_vertex>', BEGIN_VERTEX);
    };

    this.mesh = new THREE.InstancedMesh(geometry, material, n);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.instanceToBlock = new Int32Array(n);
    this.instanceToIndex = new Int32Array(n);
    this.halfSize = new Float32Array(n * 3);
    this.visibleCount = n;
    // Culling must see both movement endpoints, not the identity instance matrices.
    this.mesh.boundingSphere = this.unionSphere();
    this.mesh.boundingBox = null;
    this.compact();
  }

  get count(): number {
    return this.visibleCount;
  }

  get t(): number {
    return this.uniforms.uT.value;
  }

  setT(t: number): void {
    this.uniforms.uT.value = Math.min(1, Math.max(0, t));
  }

  setColorMode(mode: BlockColorMode): void {
    if (mode === this.colorMode) return;
    this.colorMode = mode;
    this.compact();
  }

  /** mask[i] = 1 keeps block index i; null shows all. Section is separate (t-dependent). */
  setVisibleMask(mask: Uint8Array | null): void {
    this.visibleMask = mask;
    this.compact();
  }

  /** Hide blocks whose CURRENT centre is above zDomain. null disables. */
  setSection(zDomain: number | null): void {
    this.uniforms.uSectionOn.value = zDomain === null ? 0 : 1;
    this.uniforms.uSectionZ.value = zDomain === null ? 0 : zDomain - this.frame.origin[2];
  }

  /** Whether a block index is currently drawn (mask, section and t). */
  isDrawn(index: number): boolean {
    if (this.visibleMask && !this.visibleMask[index]) return false;
    if (this.uniforms.uSectionOn.value > 0.5) return this.currentCenter(index)[2] <= this.uniforms.uSectionZ.value;
    return true;
  }

  /** Current render-space centre of a block index. */
  currentCenter(index: number): Vec3 {
    const t = this.uniforms.uT.value;
    const s = 1 - t;
    const o = index * 3;
    return [
      s * this.allBefore[o] + t * this.allAfter[o],
      s * this.allBefore[o + 1] + t * this.allAfter[o + 1],
      s * this.allBefore[o + 2] + t * this.allAfter[o + 2],
    ];
  }

  /** Nearest drawn block hit by a render-space ray, as block id, or null. */
  pick(ray: Ray): number | null {
    const sectionOn = this.uniforms.uSectionOn.value > 0.5;
    const zCut = this.uniforms.uSectionZ.value;
    const k = pickNearest(ray, {
      count: this.visibleCount,
      before: this.aBefore.array as Float32Array,
      after: this.aAfter.array as Float32Array,
      halfSize: this.halfSize,
      t: this.uniforms.uT.value,
      isVisibleAt: sectionOn ? (_x, _y, z) => z <= zCut : undefined,
    });
    return k < 0 ? null : this.instanceToBlock[k];
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }

  private compact(): void {
    const m = this.model;
    const rgb = this.colorMode === 'grade' ? this.gradeRgb : this.dispRgb;
    const bArr = this.aBefore.array as Float32Array;
    const aArr = this.aAfter.array as Float32Array;
    const sArr = this.aSize.array as Float32Array;
    const cArr = this.mesh.instanceColor!.array as Float32Array;
    let k = 0;
    for (let i = 0; i < m.count; i++) {
      if (this.visibleMask && !this.visibleMask[i]) continue;
      const o = i * 3;
      const q = k * 3;
      for (let c = 0; c < 3; c++) {
        bArr[q + c] = this.allBefore[o + c];
        aArr[q + c] = this.allAfter[o + c];
        sArr[q + c] = m.size[o + c];
        this.halfSize[q + c] = m.size[o + c] / 2;
        cArr[q + c] = rgb[o + c];
      }
      this.instanceToBlock[k] = m.ids[i];
      this.instanceToIndex[k] = i;
      k++;
    }
    this.visibleCount = k;
    this.mesh.count = k;
    for (const attr of [this.aBefore, this.aAfter, this.aSize, this.mesh.instanceColor!]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, k * 3);
      attr.needsUpdate = true;
    }
  }

  private fillColors(scale: ColorScale, value: (i: number) => number, out: Float32Array): void {
    const color = new THREE.Color();
    const rgb: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < this.model.count; i++) {
      sampleScale(scale, value(i), rgb);
      color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace); // stored linear
      out[i * 3] = color.r;
      out[i * 3 + 1] = color.g;
      out[i * 3 + 2] = color.b;
    }
  }

  private unionSphere(): THREE.Sphere {
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    const s = this.model.size;
    for (const arr of [this.allBefore, this.allAfter]) {
      for (let i = 0; i < arr.length; i += 3) {
        const h = Math.max(s[i], s[i + 1], s[i + 2]) / 2;
        box.expandByPoint(v.set(arr[i] - h, arr[i + 1] - h, arr[i + 2] - h));
        box.expandByPoint(v.set(arr[i] + h, arr[i + 1] + h, arr[i + 2] + h));
      }
    }
    return box.getBoundingSphere(new THREE.Sphere());
  }
}
