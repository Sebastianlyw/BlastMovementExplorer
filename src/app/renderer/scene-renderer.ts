import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildIdIndex } from '../domain/blocks';
import { BlockModel, Bounds3, Vec3 } from '../domain/types';
import { BlockColorMode, BlockLayer } from './block-layer';
import { DigRegionDisplay, DigRegionLayer } from './dig-region-layer';
import { PointCloudLayer, PointStyle } from './point-cloud-layer';
import { Ray } from './picking';
import { TerrainLayer } from './terrain-layer';
import { WorldFrame } from './world-frame';

export type CameraPreset = 'reset' | 'fit' | 'top' | 'front' | 'iso';
export type { BlockColorMode } from './block-layer';

export interface RenderStats {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly points: number;
  readonly geometries: number;
  readonly textures: number;
  readonly instances: number;
  /** Surface points loaded (drawn only when the layer is visible). */
  readonly pointCloudPoints: number;
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
  /** Movement t during playback (≤ 10 Hz) and exactly once when playback stops. */
  onMovementT?(t: number, playing: boolean): void;
  onContextLost?(): void;
  onContextRestored?(): void;
}

export interface SceneInput {
  readonly blocks: BlockModel;
  readonly blockBounds: Bounds3;
  readonly finalBounds: Bounds3;
  readonly terrainExtent: Bounds3;
  readonly heightAt: (x: number, y: number) => number;
  /** Elevation of the lower bench floor, metres. */
  readonly floorZ: number;
}

export interface LayerVisibility {
  readonly blocks: boolean;
  readonly terrain: boolean;
  readonly pointCloud: boolean;
}

export interface RendererOptions {
  /** MSAA. Fixed for the lifetime of a WebGL context. */
  readonly antialias: boolean;
  /** Upper bound for devicePixelRatio. */
  readonly maxPixelRatio: number;
  /** Camera inertia. Disabled when the user prefers reduced motion. */
  readonly damping: boolean;
}

export const DEFAULT_RENDERER_OPTIONS: RendererOptions = { antialias: true, maxPixelRatio: 2, damping: true };

export class WebGLUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('WebGL is not available in this browser.');
    this.name = 'WebGLUnavailableError';
    this.cause = cause;
  }
}

export interface BenchmarkResult {
  readonly measurement: string;
  readonly startedAt: string;
  readonly warmupMs: number;
  readonly sampleMs: number;
  readonly frames: number;
  readonly medianFrameMs: number;
  readonly p95FrameMs: number;
  readonly maxFrameMs: number;
  readonly fpsFromMedian: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly points: number;
  readonly blockInstances: number;
  readonly surfacePoints: number;
  readonly pixelRatio: number;
  readonly canvasPx: readonly [number, number];
  readonly viewportCss: readonly [number, number];
  readonly antialias: boolean;
  readonly gpuRenderer: string;
  readonly userAgent: string;
}

interface BenchmarkState {
  startTime: number;
  lastTime: number;
  readonly warmupMs: number;
  readonly sampleMs: number;
  readonly radius: number;
  readonly height: number;
  readonly intervals: number[];
  readonly saved: { position: THREE.Vector3; target: THREE.Vector3; t: number };
  readonly resolve: (r: BenchmarkResult) => void;
  readonly reject: (e: Error) => void;
}

/** Duration of a full 0 → 1 playback, ms. */
const PLAYBACK_MS = 4000;

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
  private readonly selectionBox: THREE.LineSegments;

  private frameHandle = 0;
  private disposed = false;
  private contextLost = false;

  private frame: WorldFrame = new WorldFrame([0, 0, 0]);
  private input: SceneInput | null = null;
  private idIndex = new Map<number, number>();
  private blocks: BlockLayer | null = null;
  private terrain: TerrainLayer | null = null;
  private digRegions: DigRegionLayer | null = null;
  private digRegionDisplay: DigRegionDisplay | null = null;
  private pointCloud: PointCloudLayer | null = null;
  private pointStyle: PointStyle = { size: 2, colorMode: 'height' };
  private selectedBlockId: number | null = null;
  private layers: LayerVisibility = { blocks: true, terrain: true, pointCloud: false };
  private colorMode: BlockColorMode = 'grade';
  private visibleMask: Uint8Array | null = null;
  private sectionZ: number | null = null;
  private movementT = 0;
  private playback: { startTime: number; fromT: number; lastReport: number } | null = null;

  private benchmark: BenchmarkState | null = null;
  private loseContextExt: WEBGL_lose_context | null = null;
  private pointerDown: { x: number; y: number; time: number } | null = null;
  private lastFrameTime = 0;
  private readonly intervals: number[] = [];
  private framesRendered = 0;
  private readonly statsTimer: ReturnType<typeof setInterval>;

  private constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: RendererCallbacks,
    private readonly options: RendererOptions,
  ) {
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: options.antialias, powerPreference: 'high-performance' });
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

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 5000);
    this.camera.up.set(0, 0, 1); // Z-up: domain and render frames share axes.

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = options.damping;
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

    this.selectionBox = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
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
  static create(container: HTMLElement, callbacks: RendererCallbacks = {}, options: RendererOptions = DEFAULT_RENDERER_OPTIONS): SceneRenderer {
    return new SceneRenderer(container, callbacks, options);
  }

  // ---------------------------------------------------------------- data

  /** Replace the dataset. Previous scene objects are disposed. */
  setScene(input: SceneInput): void {
    this.abortBenchmark('the scene changed');
    this.stopPlayback(false);
    this.input = input;
    this.frame = WorldFrame.centeredOn(input.blockBounds);
    this.idIndex = buildIdIndex(input.blocks);

    this.removeLayer(this.blocks);
    this.blocks = new BlockLayer(input.blocks, this.frame);
    this.blocks.setT(this.movementT);
    this.blocks.setColorMode(this.colorMode);
    this.blocks.setVisibleMask(this.visibleMask && this.visibleMask.length === input.blocks.count ? this.visibleMask : null);
    this.blocks.setSection(this.sectionZ);
    this.scene.add(this.blocks.mesh);

    this.removeLayer(this.terrain);
    this.terrain = new TerrainLayer(this.frame, input.terrainExtent, input.blockBounds, input.heightAt, input.floorZ);
    this.scene.add(this.terrain.mesh);

    // A point cloud belongs to the previous dataset.
    this.removeLayer(this.pointCloud);
    this.pointCloud = null;

    this.removeLayer(this.digRegions);
    this.digRegions = new DigRegionLayer(this.frame);
    if (this.digRegionDisplay) this.digRegions.set(this.digRegionDisplay);
    this.scene.add(this.digRegions.mesh);

    this.applyLayers();
    this.selectedBlockId = null;
    this.updateSelectionBox();
    this.applyCameraPreset('reset');
  }

  setSelection(blockId: number | null): void {
    this.selectedBlockId = blockId;
    this.updateSelectionBox();
    this.invalidate();
  }

  /**
   * Show a surface point cloud (domain coordinates). Ownership of `positions` passes to
   * the renderer, which converts it in place. null removes the cloud. Call after setScene.
   */
  setPointCloud(positions: Float32Array | null, zRange: readonly [number, number] = [0, 1]): void {
    this.removeLayer(this.pointCloud);
    this.pointCloud = null;
    if (positions && this.input) {
      this.pointCloud = new PointCloudLayer(this.frame, positions, zRange, this.renderer.getPixelRatio(), this.pointStyle);
      this.scene.add(this.pointCloud.mesh);
    }
    this.applyLayers();
    this.invalidate();
  }

  setPointStyle(style: PointStyle): void {
    this.pointStyle = style;
    this.pointCloud?.setStyle(style);
    this.invalidate();
  }

  /** Number of surface points currently loaded (0 when none). */
  get pointCount(): number {
    return this.pointCloud?.count ?? 0;
  }

  /** Dig region outlines in domain coordinates. Call after setScene. */
  setDigRegions(display: DigRegionDisplay): void {
    this.digRegionDisplay = display;
    this.digRegions?.set(display);
    this.invalidate();
  }

  setLayers(layers: LayerVisibility): void {
    this.layers = layers;
    this.applyLayers();
    this.invalidate();
  }

  setColorMode(mode: BlockColorMode): void {
    this.colorMode = mode;
    this.blocks?.setColorMode(mode);
    this.invalidate();
  }

  /** Per-block-index visibility (1 = shown). null shows every block. */
  setVisibleMask(mask: Uint8Array | null): void {
    this.visibleMask = mask;
    this.blocks?.setVisibleMask(mask);
    this.updateSelectionBox();
    this.invalidate();
  }

  /** Horizontal section: hide blocks whose current centre is above z (domain metres). */
  setSection(zDomain: number | null): void {
    this.sectionZ = zDomain;
    this.blocks?.setSection(zDomain);
    this.updateSelectionBox();
    this.invalidate();
  }

  // ---------------------------------------------------------------- movement

  /** Set movement interpolation t ∈ [0, 1]. Stops playback. */
  setMovementT(t: number): void {
    if (this.playback) this.stopPlayback(false);
    this.applyT(t);
  }

  get isPlaying(): boolean {
    return this.playback !== null;
  }

  /** Play from the current t to 1 (from 0 if already at 1). User-initiated only. */
  play(): void {
    if (this.playback || !this.blocks) return;
    const from = this.movementT >= 1 ? 0 : this.movementT;
    this.applyT(from);
    this.playback = { startTime: performance.now(), fromT: from, lastReport: 0 };
    this.callbacks.onMovementT?.(from, true);
    this.invalidate();
  }

  pause(): void {
    this.stopPlayback(true);
  }

  /** Whether a block is drawn right now (filters, section, t). */
  isBlockDrawn(blockId: number): boolean {
    const i = this.idIndex.get(blockId);
    return i !== undefined && !!this.blocks && this.layers.blocks && this.blocks.isDrawn(i);
  }

  // ---------------------------------------------------------------- camera

  applyCameraPreset(preset: CameraPreset): void {
    if (!this.input) return;
    const a = this.input.blockBounds;
    const b = this.input.finalBounds;
    const minR = this.frame.toRender([Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])]);
    const maxR = this.frame.toRender([Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])]);
    const center = new THREE.Vector3((minR[0] + maxR[0]) / 2, (minR[1] + maxR[1]) / 2, (minR[2] + maxR[2]) / 2);
    const radius = new THREE.Vector3(maxR[0] - minR[0], maxR[1] - minR[1], maxR[2] - minR[2]).length() / 2;

    let dir: THREE.Vector3;
    switch (preset) {
      case 'top':
        dir = new THREE.Vector3(0, -0.0001, 1); // tiny −Y offset keeps North up on screen
        break;
      case 'front':
        dir = new THREE.Vector3(0, -1, 0.08);
        break;
      case 'fit':
        dir = this.camera.position.clone().sub(this.controls.target);
        if (dir.lengthSq() < 1e-6) dir = new THREE.Vector3(0.55, -1, 0.75);
        break;
      default:
        dir = new THREE.Vector3(0.55, -1, 0.75);
    }
    dir.normalize();
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const distance = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.02;
    const pos = center.clone().addScaledVector(dir, distance);

    // Keep the camera above the terrain surface.
    const domainPos = this.frame.toDomain([pos.x, pos.y, pos.z]);
    const ground = this.frame.zToRender(this.input.heightAt(domainPos[0], domainPos[1]));
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

  /** Pick the nearest drawn block under a client-space point. */
  pickAt(clientX: number, clientY: number): number | null {
    if (!this.blocks || !this.layers.blocks) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    this.camera.updateMatrixWorld(); // matrices may be stale until the next frame
    raycaster.setFromCamera(ndc, this.camera);
    const r = raycaster.ray;
    const ray: Ray = { origin: [r.origin.x, r.origin.y, r.origin.z], dir: [r.direction.x, r.direction.y, r.direction.z] };
    return this.blocks.pick(ray);
  }

  /** Client-space position of a block's current centre, or null if not drawn / off-screen. */
  projectBlock(blockId: number): { x: number; y: number } | null {
    const i = this.idIndex.get(blockId);
    if (i === undefined || !this.blocks || !this.isBlockDrawn(blockId)) return null;
    const p = this.blocks.currentCenter(i);
    this.camera.updateMatrixWorld();
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
    if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  // ---------------------------------------------------------------- benchmark & diagnostics

  /**
   * Fixed, repeatable benchmark: orbit the target once per 10 s at the isometric
   * radius/elevation while looping movement t, rendering every animation frame.
   * Reports BROWSER FRAME INTERVALS (requestAnimationFrame timestamps), not GPU time.
   */
  runBenchmark(warmupMs = 2000, sampleMs = 10000): Promise<BenchmarkResult> {
    if (this.benchmark) return Promise.reject(new Error('A benchmark is already running.'));
    if (!this.input) return Promise.reject(new Error('No scene loaded.'));
    this.stopPlayback(true);
    const saved = { position: this.camera.position.clone(), target: this.controls.target.clone(), t: this.movementT };
    this.applyCameraPreset('iso');
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.enabled = false;
    return new Promise((resolve, reject) => {
      this.benchmark = {
        startTime: -1,
        lastTime: -1,
        warmupMs,
        sampleMs,
        radius: Math.hypot(offset.x, offset.y),
        height: offset.z,
        intervals: [],
        saved,
        resolve,
        reject,
      };
      this.invalidate();
    });
  }

  get isBenchmarking(): boolean {
    return this.benchmark !== null;
  }

  /** Selection outline state in domain coordinates (for tests and diagnostics). */
  selectionOutline(): { visible: boolean; center: Vec3 } {
    const p = this.selectionBox.position;
    return { visible: this.selectionBox.visible, center: this.frame.toDomain([p.x, p.y, p.z]) };
  }

  /** Renderer object counts for leak checks (not memory sizes). */
  resourceCounts(): { geometries: number; textures: number; framesRendered: number } {
    return { geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, framesRendered: this.framesRendered };
  }

  get pixelRatio(): number {
    return this.renderer.getPixelRatio();
  }

  /** Test/diagnostic hooks using WEBGL_lose_context. */
  simulateContextLoss(): boolean {
    this.loseContextExt ??= this.renderer.getContext().getExtension('WEBGL_lose_context');
    this.loseContextExt?.loseContext();
    return !!this.loseContextExt;
  }

  simulateContextRestore(): void {
    this.loseContextExt?.restoreContext();
  }

  /** Settle a running benchmark as failed (never leave its promise pending). */
  private abortBenchmark(reason: string): void {
    const b = this.benchmark;
    if (!b) return;
    this.benchmark = null;
    this.controls.enabled = true;
    b.reject(new Error(`Benchmark aborted: ${reason}.`));
  }

  private advanceBenchmark(now: number): void {
    const b = this.benchmark!;
    if (b.startTime < 0) b.startTime = now;
    const elapsed = now - b.startTime;
    const angle = -Math.PI / 3 + (2 * Math.PI * elapsed) / 10000;
    const target = this.controls.target;
    this.camera.position.set(target.x + b.radius * Math.cos(angle), target.y + b.radius * Math.sin(angle), target.z + b.height);
    this.camera.lookAt(target);
    const phase = (elapsed % 4000) / 4000; // triangle wave, 4 s period
    this.applyT(phase < 0.5 ? phase * 2 : 2 - phase * 2, false);
  }

  private recordBenchmarkFrame(now: number): void {
    const b = this.benchmark!;
    const elapsed = now - b.startTime;
    if (elapsed > b.warmupMs && b.lastTime >= 0) b.intervals.push(now - b.lastTime);
    b.lastTime = now;
    if (elapsed < b.warmupMs + b.sampleMs) return;

    const sorted = [...b.intervals].sort((x, y) => x - y);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? NaN;
    const info = this.renderer.info.render;
    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const result: BenchmarkResult = {
      measurement: 'Browser frame interval from requestAnimationFrame timestamps (not GPU timing; capped by display refresh rate)',
      startedAt: new Date().toISOString(),
      warmupMs: b.warmupMs,
      sampleMs: b.sampleMs,
      frames: sorted.length,
      medianFrameMs: q(0.5),
      p95FrameMs: q(0.95),
      maxFrameMs: sorted[sorted.length - 1] ?? NaN,
      fpsFromMedian: 1000 / q(0.5),
      drawCalls: info.calls,
      triangles: info.triangles,
      points: info.points,
      blockInstances: this.blocks?.count ?? 0,
      surfacePoints: this.pointCloud && this.layers.pointCloud ? this.pointCloud.count : 0,
      pixelRatio: this.renderer.getPixelRatio(),
      canvasPx: [this.canvas.width, this.canvas.height],
      viewportCss: [this.container.clientWidth, this.container.clientHeight],
      antialias: this.options.antialias,
      gpuRenderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'not exposed',
      userAgent: navigator.userAgent,
    };
    // Restore the user's view.
    this.camera.position.copy(b.saved.position);
    this.controls.target.copy(b.saved.target);
    this.controls.enabled = true;
    this.controls.update();
    this.applyT(b.saved.t, false);
    this.benchmark = null;
    b.resolve(result);
  }

  // ---------------------------------------------------------------- lifecycle

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abortBenchmark('the renderer was replaced or closed');
    this.playback = null;
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
    this.blocks?.dispose();
    this.terrain?.dispose();
    this.digRegions?.dispose();
    this.digRegions = null;
    this.pointCloud?.dispose();
    this.pointCloud = null;
    this.selectionBox.geometry.dispose();
    (this.selectionBox.material as THREE.Material).dispose();
    this.blocks = null;
    this.terrain = null;
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
    const dampingActive = this.benchmark ? false : this.controls.update();
    if (this.benchmark) this.advanceBenchmark(now);
    else this.advancePlayback(now);
    this.renderer.render(this.scene, this.camera);
    this.framesRendered++;
    if (this.lastFrameTime > 0 && now - this.lastFrameTime < 250) {
      this.intervals.push(now - this.lastFrameTime);
      if (this.intervals.length > 240) this.intervals.shift();
    }
    this.lastFrameTime = now;
    this.emitView();
    if (this.benchmark) this.recordBenchmarkFrame(now);
    if (dampingActive || this.playback || this.benchmark) this.invalidate();
  };

  private advancePlayback(now: number): void {
    const p = this.playback;
    if (!p) return;
    const t = Math.min(1, p.fromT + (now - p.startTime) / PLAYBACK_MS);
    this.applyT(t, false);
    if (t >= 1) {
      this.stopPlayback(true);
    } else if (now - p.lastReport >= 100) {
      p.lastReport = now;
      this.callbacks.onMovementT?.(t, true);
    }
  }

  private stopPlayback(report: boolean): void {
    if (!this.playback) return;
    this.playback = null;
    if (report) this.callbacks.onMovementT?.(this.movementT, false);
  }

  private applyT(t: number, invalidate = true): void {
    this.movementT = Math.min(1, Math.max(0, t));
    this.blocks?.setT(this.movementT);
    this.updateSelectionBox();
    if (invalidate) this.invalidate();
  }

  private applyLayers(): void {
    if (this.blocks) this.blocks.mesh.visible = this.layers.blocks;
    if (this.terrain) this.terrain.mesh.visible = this.layers.terrain;
    if (this.pointCloud) this.pointCloud.mesh.visible = this.layers.pointCloud;
    this.updateSelectionBox();
  }

  private removeLayer(layer: { mesh: THREE.Object3D; dispose(): void } | null): void {
    if (!layer) return;
    this.scene.remove(layer.mesh);
    layer.dispose();
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.options.maxPixelRatio));
    this.renderer.setSize(w, h, false);
    this.pointCloud?.setPixelRatio(this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  private updateSelectionBox(): void {
    const id = this.selectedBlockId;
    const i = id === null ? undefined : this.idIndex.get(id);
    if (i === undefined || !this.input || !this.blocks || !this.isBlockDrawn(id!)) {
      this.selectionBox.visible = false;
      return;
    }
    const s = this.input.blocks.size;
    const p = this.blocks.currentCenter(i);
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
      const sorted = [...this.intervals].sort((x, y) => x - y);
      median = sorted[Math.floor(sorted.length / 2)];
    }
    this.callbacks.onStats({
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      instances: this.blocks?.count ?? 0,
      pointCloudPoints: this.pointCloud?.count ?? 0,
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
    if (!document.hidden) {
      // Resume playback from where it was rather than jumping ahead.
      if (this.playback) this.playback = { startTime: performance.now(), fromT: this.movementT, lastReport: 0 };
      this.invalidate();
    }
  };
}
