import * as THREE from 'three';
import { Bounds3 } from '../domain/types';
import { WorldFrame } from './world-frame';

/**
 * Pre-blast terrain as a heightfield mesh sampled from the domain height
 * function. Cells over the block-model footprint are cut out: the blocks
 * themselves form that part of the surface.
 */
export class TerrainLayer {
  readonly mesh = new THREE.Group();

  constructor(
    frame: WorldFrame,
    extent: Bounds3,
    footprint: Bounds3,
    heightAt: (x: number, y: number) => number,
    floorZ: number,
    step = 1,
  ) {
    const nx = Math.round((extent.max[0] - extent.min[0]) / step) + 1;
    const ny = Math.round((extent.max[1] - extent.min[1]) / step) + 1;
    const positions = new Float32Array(nx * ny * 3);
    const colors = new Float32Array(nx * ny * 3);
    const heights = new Float32Array(nx * ny);
    let zMin = Infinity;
    let zMax = -Infinity;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = extent.min[0] + i * step;
        const y = extent.min[1] + j * step;
        const z = heightAt(x, y);
        heights[j * nx + i] = z;
        zMin = Math.min(zMin, z);
        zMax = Math.max(zMax, z);
        const r = frame.toRender([x, y, z]);
        positions.set(r, (j * nx + i) * 3);
      }
    }
    const low = new THREE.Color().setRGB(0.3, 0.29, 0.27, THREE.SRGBColorSpace);
    const high = new THREE.Color().setRGB(0.52, 0.5, 0.46, THREE.SRGBColorSpace);
    const c = new THREE.Color();
    for (let k = 0; k < nx * ny; k++) {
      c.copy(low).lerp(high, (heights[k] - zMin) / Math.max(1, zMax - zMin));
      colors[k * 3] = c.r;
      colors[k * 3 + 1] = c.g;
      colors[k * 3 + 2] = c.b;
    }
    const indices: number[] = [];
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const cx = extent.min[0] + (i + 0.5) * step;
        const cy = extent.min[1] + (j + 0.5) * step;
        if (cx > footprint.min[0] && cx < footprint.max[0] && cy > footprint.min[1] && cy < footprint.max[1]) continue;
        const a = j * nx + i;
        indices.push(a, a + 1, a + nx + 1, a, a + nx + 1, a + nx);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh.add(new THREE.Mesh(geometry, material));

    // Floor of the next bench under the footprint, exposed once blocks move away.
    const floor = new THREE.PlaneGeometry(footprint.max[0] - footprint.min[0], footprint.max[1] - footprint.min[1]);
    const centre = frame.toRender([(footprint.min[0] + footprint.max[0]) / 2, (footprint.min[1] + footprint.max[1]) / 2, floorZ]);
    floor.translate(centre[0], centre[1], centre[2] - 0.02);
    const floorColor = new THREE.Color().setRGB(0.27, 0.26, 0.25, THREE.SRGBColorSpace);
    this.mesh.add(new THREE.Mesh(floor, new THREE.MeshLambertMaterial({ color: floorColor })));
  }

  dispose(): void {
    for (const child of this.mesh.children) {
      const m = child as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
