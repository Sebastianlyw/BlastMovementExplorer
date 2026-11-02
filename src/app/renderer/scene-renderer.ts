import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildIdIndex } from '../domain/blocks';
import { BlockModel, Bounds3, Vec3 } from '../domain/types';
import { GRADE_SCALE, sampleScale } from './colormap';
import { pickNearest, Ray } from './picking';
import { WorldFrame } from './world-frame';

export type CameraPreset = 'reset' | 'fit' | 'top' | 'front' | 'iso';

export interface RenderStats {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly points: number;
  readonly geometries: number;
  readonly textures: number;
  readonly instances: number;
  readonly pixelRatio: number;
  readonly canvasSize: readonly [number, number];
  /** Median browser frame interval over recent continuous frames, ms (null when idle). */
  readonly frameIntervalMedianMs: number | null;
  readonly framesRendered: number;
}

/** Screen-space projection of the domain axes, for the orientation indicator. */
export interface ViewIndicator {
  readonly east: readonly [number, number];
  readonly north: readonly [number, number];
  readonly up: readonly [number, number];
  /** Metres covered by 100 CSS pixels at the orbit target. */
  readonly metresPer100Px: number;
}

export interface RendererCallbacks {
  onStats?(stats: RenderStats): void;
  onView?(view: ViewIndicator): void;
  /** Click (not drag) in the viewport, resolved against what is currently visible. */
  onClickPick?(blockId: number | null): void;
  onContextLost?(): void;
  onContextRestored?(): void;
}

export interface SceneInput {
  readonly blocks: BlockModel;
  readonly blockBounds: Bounds3;
  readonly terrainExtent: Bounds3;
  readonly heightAt: (x: number, y: number) => number;
}

export class WebGLUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('WebGL is not available in this browser.');
    this.name = 'WebGLUnavailableError';
    this.cause = cause;
  }
}

/** Visual gap between blocks. Tonnes always use true dimensions. */
const BLOCK_VISUAL_SCALE = 0.94;

const BLOCK_VERTEX_PARS = /* glsl */ `
attribute vec3 aBefore;
attribute vec3 aAfter;
attribute vec3 aSize;
uniform float uT;
uniform float uVisualScale;
`;

const BLOCK_BEGIN_VERTEX = /* glsl */ `
vec3 blockCenter = aBefore * (1.0 - uT) + aAfter * uT;
vec3 transformed = position * aSize * uVisualScale + blockCenter;
`;

/**
 * Owns every Three.js object of the viewport. Angular never touches Three.js
 * directly — it calls these methods and receives low-frequency callbacks.
 */
export class SceneRenderer {
  /** Number of renderer instances not yet disposed (for leak checks). */
  static liveInstances = 0;
  /** Number of pending requestAnimationFrame callbacks across all instances. */
  static pendingFrames = 0;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly canvas: HTMLCanvasElement;
  private readonly uniforms = { uT: { value: 0 }, uVisualScale: { value: BLOCK_VISUAL_SCALE } };

  private frameHandle = 0;
  private disposed = false;
  private contextLost = false;
  private maxPixelRatio = 2;

  private frame: WorldFrame = new WorldFrame([0, 0, 0]);
  private input: SceneInput | null = null;
  private idIndex = new Map<number, number>();
  private blockMesh: THREE.InstancedMesh | null = null;
  private terrainMesh: THREE.Mesh | null = null;
  private selectionBox: THREE.LineSegments;
  private selectedBlockId: number | null = null;

  /** Render-space buffers for the visible (compacted) instances. */
  private visBefore: Float32Array = new Float32Array(0);
  private visAfter: Float32Array = new Float32Array(0);
  private visHalf: Float32Array = new Float32Array(0);
  private instanceToBlock: Int32Array = new Int32Array(0);
  private visibleCount = 0;

  private pointerDown: { x: number; y: number; time: number } | null = null;
  private lastFrameTime = 0;
  private readonly intervals: number[] = [];
  private framesRendered = 0;
  private statsTimer: ReturnType<typeof setInterval>;

  private constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: RendererCallbacks,
  ) {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      throw new WebGLUnavailableError(e);
    }
    SceneRenderer.liveInstances++;
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', '3D viewport. Drag to orbit, right-drag to pan, wheel to zoom, click a block to select it.');
    container.appendChild(this.canvas);

    this.renderer.setClearColor(0x14181d, 1);
    this.renderer.localClippingEnabled = false;

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 5000);
    this.camera.up.set(0, 0, 1); // Z-up: domain and render frames share axes.

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.495; // never orbit below the horizon
    this.controls.minDistance = 4;
    this.controls.maxDistance = 1500;
    this.controls.addEventListener('change', this.invalidate);

    const hemi = new THREE.HemisphereLight(0xf2f4f8, 0x5a5348, 1.7);
    hemi.position.set(0, 0, 1);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.45, -0.75, 1);
    this.scene.add(hemi, sun);

    const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.selectionBox = new THREE.LineSegments(
      boxEdges,
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }),
    );
    this.selectionBox.renderOrder = 10;
    this.selectionBox.visible = false;
    this.scene.add(this.selectionBox);

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.statsTimer = setInterval(() => this.emitStats(), 500);
  }

  /** Throws WebGLUnavailableError when no WebGL context can be created. */
  static create(container: HTMLElement, callbacks: RendererCallbacks = {}): SceneRenderer {
    return new SceneRenderer(container, callbacks);
  }

  // ---------------------------------------------------------------- data

  setScene(input: SceneInput): void {
    this.input = input;
    this.frame = WorldFrame.centeredOn(input.blockBounds);
    this.idIndex = buildIdIndex(input.blocks);
    this.buildBlocks(input.blocks);
    this.buildTerrain(input);
    this.setSelection(null);
    this.applyCameraPreset('reset');
  }

  setSelection(blockId: number | null): void {
    this.selectedBlockId = blockId;
    this.updateSelectionBox();
    this.invalidate();
  }

  setQuality(maxPixelRatio: number): void {
    this.maxPixelRatio = maxPixelRatio;
    this.resize();
  }

  // ---------------------------------------------------------------- camera

  applyCameraPreset(preset: CameraPreset): void {
    if (!this.input) return;
    const b = this.input.blockBounds;
    const minR = this.frame.toRender(b.min);
    const maxR = this.frame.toRender(b.max);
    const center = new THREE.Vector3((minR[0] + maxR[0]) / 2, (minR[1] + maxR[1]) / 2, (minR[2] + maxR[2]) / 2);
    const radius = new THREE.Vector3(maxR[0] - minR[0], maxR[1] - minR[1], maxR[2] - minR[2]).length() / 2;

    let dir: THREE.Vector3;
    switch (preset) {
      case 'top':
        dir = new THREE.Vector3(0, -0.0001, 1); // tiny -Y offset keeps North up on screen
        break;
      case 'front':
        dir = new THREE.Vector3(0, -1, 0.08);
        break;
      case 'fit': {
        dir = this.camera.position.clone().sub(this.controls.target);
        if (dir.lengthSq() < 1e-6) dir = new THREE.Vector3(0.55, -1, 0.75);
        break;
      }
      case 'iso':
      case 'reset':
      default:
        dir = new THREE.Vector3(0.55, -1, 0.75);
    }
    dir.normalize();
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const fov = Math.min(vfov, hfov);
    const distance = (radius / Math.sin(fov / 2)) * 1.02;
    const pos = center.clone().addScaledVector(dir, distance);

    // Keep the camera above the terrain surface.
    const domainPos = this.frame.toDomain([pos.x, pos.y, pos.z]);
    const ground = this.input.heightAt(domainPos[0], domainPos[1]) - this.frame.origin[2];
    if (pos.z < ground + 2) pos.z = ground + 2;

    this.controls.target.copy(center);
    this.camera.position.copy(pos);
    this.camera.near = Math.max(0.1, distance / 500);
    this.camera.far = distance * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.invalidate();
  }

  /** Camera position and target in domain coordinates (for tests and diagnostics). */
  cameraState(): { position: Vec3; target: Vec3 } {
    const p = this.camera.position;
    const t = this.controls.target;
    return { position: this.frame.toDomain([p.x, p.y, p.z]), target: this.frame.toDomain([t.x, t.y, t.z]) };
  }

  // ---------------------------------------------------------------- picking

  /** Pick the nearest visible block under a client-space point. */
  pickAt(clientX: number, clientY: number): number | null {
    if (!this.input || this.visibleCount === 0) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    this.camera.updateMatrixWorld(); // matrices may be stale until the next frame
    raycaster.setFromCamera(ndc, this.camera);
    const r = raycaster.ray;
    const ray: Ray = { origin: [r.origin.x, r.origin.y, r.origin.z], dir: [r.direction.x, r.direction.y, r.direction.z] };
    const idx = pickNearest(ray, {
      count: this.visibleCount,
      before: this.visBefore,
      after: this.visAfter,
      halfSize: this.visHalf,
      t: this.uniforms.uT.value,
    });
    return idx < 0 ? null : this.instanceToBlock[idx];
  }

  /** Client-space position of a block's current centre, or null if not visible / off-screen. */
  projectBlock(blockId: number): { x: number; y: number } | null {
    const i = this.idIndex.get(blockId);
    if (i === undefined || !this.input) return null;
    const p = this.currentRenderCenter(i);
    this.camera.updateMatrixWorld();
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
    if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  // ---------------------------------------------------------------- lifecycle

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frameHandle) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = 0;
      SceneRenderer.pendingFrames--;
    }
    clearInterval(this.statsTimer);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener('change', this.invalidate);
    this.controls.dispose();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.scene.traverse((obj) => disposeObject(obj));
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
    SceneRenderer.liveInstances--;
  }

  /** Request a frame. At most one frame is ever pending. */
  readonly invalidate = (): void => {
    if (this.disposed || this.contextLost || this.frameHandle || document.hidden) return;
    this.frameHandle = requestAnimationFrame(this.renderFrame);
    SceneRenderer.pendingFrames++;
  };

  // ---------------------------------------------------------------- internals

  private readonly renderFrame = (now: number): void => {
    this.frameHandle = 0;
    SceneRenderer.pendingFrames--;
    if (this.disposed) return;
    const dampingActive = this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.framesRendered++;
    if (this.lastFrameTime > 0 && now - this.lastFrameTime < 250) {
      this.intervals.push(now - this.lastFrameTime);
      if (this.intervals.length > 240) this.intervals.shift();
    }
    this.lastFrameTime = now;
    this.emitView();
    if (dampingActive) this.invalidate();
  };

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  private buildBlocks(model: BlockModel): void {
    if (this.blockMesh) {
      this.scene.remove(this.blockMesh);
      disposeObject(this.blockMesh);
      this.blockMesh = null;
    }
    const n = model.count;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const before = this.frame.bufferToRender(model.before);
    const after = before.slice(); // movement arrives in a later change
    const size = new Float32Array(model.size);
    const aBefore = new THREE.InstancedBufferAttribute(before, 3);
    const aAfter = new THREE.InstancedBufferAttribute(after, 3);
    const aSize = new THREE.InstancedBufferAttribute(size, 3);
    geometry.setAttribute('aBefore', aBefore);
    geometry.setAttribute('aAfter', aAfter);
    geometry.setAttribute('aSize', aSize);

    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    material.onBeforeCompile = (shader) => {
      shader.uniforms['uT'] = this.uniforms.uT;
      shader.uniforms['uVisualScale'] = this.uniforms.uVisualScale;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${BLOCK_VERTEX_PARS}`)
        .replace('#include <begin_vertex>', BLOCK_BEGIN_VERTEX);
    };

    const mesh = new THREE.InstancedMesh(geometry, material, n);
    // instanceMatrix stays identity: placement comes from aBefore/aAfter in the shader.
    const color = new THREE.Color();
    const rgb: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      sampleScale(GRADE_SCALE, model.grade[i], rgb);
      color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    this.visBefore = before;
    this.visAfter = after;
    this.visHalf = new Float32Array(n * 3);
    for (let k = 0; k < n * 3; k++) this.visHalf[k] = size[k] / 2;
    this.instanceToBlock = new Int32Array(model.ids);
    this.visibleCount = n;
    mesh.count = n;
    mesh.boundingSphere = this.unionSphere(before, after, size);
    this.blockMesh = mesh;
    this.scene.add(mesh);
  }

  /** Bounding sphere enclosing both movement endpoints, so culling matches the shader. */
  private unionSphere(before: Float32Array, after: Float32Array, size: Float32Array): THREE.Sphere {
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let i = 0; i < before.length; i += 3) {
      const h = Math.max(size[i], size[i + 1], size[i + 2]) / 2;
      box.expandByPoint(v.set(before[i] - h, before[i + 1] - h, before[i + 2] - h));
      box.expandByPoint(v.set(before[i] + h, before[i + 1] + h, before[i + 2] + h));
      box.expandByPoint(v.set(after[i] - h, after[i + 1] - h, after[i + 2] - h));
      box.expandByPoint(v.set(after[i] + h, after[i + 1] + h, after[i + 2] + h));
    }
    return box.getBoundingSphere(new THREE.Sphere());
  }

  private buildTerrain(input: SceneInput): void {
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      disposeObject(this.terrainMesh);
      this.terrainMesh = null;
    }
    const ext = input.terrainExtent;
    const fp = input.blockBounds;
    const step = 1;
    const nx = Math.round((ext.max[0] - ext.min[0]) / step) + 1;
    const ny = Math.round((ext.max[1] - ext.min[1]) / step) + 1;
    const positions = new Float32Array(nx * ny * 3);
    const colors = new Float32Array(nx * ny * 3);
    const low = new THREE.Color().setRGB(0.3, 0.29, 0.27, THREE.SRGBColorSpace);
    const high = new THREE.Color().setRGB(0.52, 0.5, 0.46, THREE.SRGBColorSpace);
    const c = new THREE.Color();
    const zMin = input.heightAt(ext.min[0], ext.min[1] + 1);
    let zMax = zMin;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = ext.min[0] + i * step;
        const y = ext.min[1] + j * step;
        const z = input.heightAt(x, y);
        zMax = Math.max(zMax, z);
        const k = (j * nx + i) * 3;
        const r = this.frame.toRender([x, y, z]);
        positions[k] = r[0];
        positions[k + 1] = r[1];
        positions[k + 2] = r[2];
      }
    }
    for (let k = 0; k < nx * ny; k++) {
      const zd = positions[k * 3 + 2] + this.frame.origin[2];
      c.copy(low).lerp(high, Math.min(1, Math.max(0, (zd - zMin) / Math.max(1, zMax - zMin))));
      colors[k * 3] = c.r;
      colors[k * 3 + 1] = c.g;
      colors[k * 3 + 2] = c.b;
    }
    // Skip cells over the block-model footprint: the blocks themselves form that surface.
    const indices: number[] = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const cx = ext.min[0] + (i + 0.5) * step;
        const cy = ext.min[1] + (j + 0.5) * step;
        if (cx > fp.min[0] && cx < fp.max[0] && cy > fp.min[1] && cy < fp.max[1]) continue;
        const a = j * nx + i;
        const b = a + 1;
        const d = a + nx;
        const e = d + 1;
        indices.push(a, b, e, a, e, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.FrontSide });
    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.terrainMesh);
  }

  private currentRenderCenter(index: number): Vec3 {
    const model = this.input!.blocks;
    const b = this.frame.toRender([model.before[index * 3], model.before[index * 3 + 1], model.before[index * 3 + 2]]);
    return b;
  }

  private updateSelectionBox(): void {
    const id = this.selectedBlockId;
    const i = id === null ? undefined : this.idIndex.get(id);
    if (i === undefined || !this.input) {
      this.selectionBox.visible = false;
      return;
    }
    const s = this.input.blocks.size;
    const p = this.currentRenderCenter(i);
    this.selectionBox.position.set(p[0], p[1], p[2]);
    this.selectionBox.scale.set(s[i * 3] * 1.04, s[i * 3 + 1] * 1.04, s[i * 3 + 2] * 1.04);
    this.selectionBox.visible = true;
  }

  private emitView(): void {
    if (!this.callbacks.onView) return;
    const project = (v: THREE.Vector3): [number, number] => {
      const p = v.clone().transformDirection(this.camera.matrixWorldInverse);
      return [p.x, -p.y];
    };
    const dist = this.camera.position.distanceTo(this.controls.target);
    const heightPx = Math.max(1, this.container.clientHeight);
    const worldHeight = 2 * dist * Math.tan((this.camera.fov * Math.PI) / 360);
    this.callbacks.onView({
      east: project(new THREE.Vector3(1, 0, 0)),
      north: project(new THREE.Vector3(0, 1, 0)),
      up: project(new THREE.Vector3(0, 0, 1)),
      metresPer100Px: (worldHeight / heightPx) * 100,
    });
  }

  private emitStats(): void {
    if (!this.callbacks.onStats || this.disposed) return;
    const info = this.renderer.info;
    let median: number | null = null;
    if (this.intervals.length >= 10 && performance.now() - this.lastFrameTime < 500) {
      const sorted = [...this.intervals].sort((a, b) => a - b);
      median = sorted[Math.floor(sorted.length / 2)];
    }
    this.callbacks.onStats({
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      instances: this.blockMesh?.count ?? 0,
      pixelRatio: this.renderer.getPixelRatio(),
      canvasSize: [this.canvas.width, this.canvas.height],
      frameIntervalMedianMs: median,
      framesRendered: this.framesRendered,
    });
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.pointerDown = { x: e.clientX, y: e.clientY, time: performance.now() };
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down || e.button !== 0) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved > 4 || performance.now() - down.time > 600) return; // a drag, not a click
    this.callbacks.onClickPick?.(this.pickAt(e.clientX, e.clientY));
  };

  private readonly onContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    if (this.frameHandle) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = 0;
      SceneRenderer.pendingFrames--;
    }
    this.callbacks.onContextLost?.();
  };

  private readonly onContextRestored = (): void => {
    this.contextLost = false;
    this.callbacks.onContextRestored?.();
    this.invalidate();
  };

  private readonly onVisibilityChange = (): void => {
    if (!document.hidden) this.invalidate();
  };
}

function disposeObject(obj: THREE.Object3D): void {
  const mesh = obj as THREE.Mesh;
  if (mesh.geometry) mesh.geometry.dispose();
  const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
  else mat?.dispose();
  if ((obj as THREE.InstancedMesh).isInstancedMesh) (obj as THREE.InstancedMesh).dispose();
}
