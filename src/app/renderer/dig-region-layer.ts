import * as THREE from 'three';
import { DigRegion } from '../domain/dig-analysis';
import { WorldFrame } from './world-frame';

export interface DigRegionDisplay {
  readonly original: DigRegion | null;
  readonly adjusted: DigRegion | null;
  /** Vertical extent drawn for both regions, domain metres. */
  readonly zMin: number;
  readonly zMax: number;
}

const ORIGINAL_COLOR = 0xf0b44c;
const ADJUSTED_COLOR = 0x4fd1c5;

/**
 * Dig regions as vertical wireframe boxes (the region spans the full vertical
 * range). Drawn without depth test so they stay readable through the blocks.
 * Original is dashed amber, adjusted is solid teal (colour + pattern, not colour alone).
 */
export class DigRegionLayer {
  readonly mesh = new THREE.Group();
  private readonly edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  private readonly original: THREE.LineSegments;
  private readonly adjusted: THREE.LineSegments;

  constructor(private readonly frame: WorldFrame) {
    this.original = new THREE.LineSegments(
      this.edges,
      new THREE.LineDashedMaterial({ color: ORIGINAL_COLOR, dashSize: 0.06, gapSize: 0.04, depthTest: false, transparent: true }),
    );
    this.original.computeLineDistances();
    this.adjusted = new THREE.LineSegments(this.edges, new THREE.LineBasicMaterial({ color: ADJUSTED_COLOR, depthTest: false, transparent: true }));
    for (const l of [this.original, this.adjusted]) {
      l.renderOrder = 5;
      l.visible = false;
      this.mesh.add(l);
    }
  }

  set(display: DigRegionDisplay): void {
    this.place(this.original, display.original, display);
    this.place(this.adjusted, display.adjusted, display);
  }

  dispose(): void {
    this.edges.dispose();
    (this.original.material as THREE.Material).dispose();
    (this.adjusted.material as THREE.Material).dispose();
  }

  private place(line: THREE.LineSegments, r: DigRegion | null, d: DigRegionDisplay): void {
    if (!r) {
      line.visible = false;
      return;
    }
    const c = this.frame.toRender([r.centerE, r.centerN, (d.zMin + d.zMax) / 2]);
    line.position.set(c[0], c[1], c[2]);
    line.scale.set(r.width, r.length, d.zMax - d.zMin);
    line.visible = true;
  }
}
