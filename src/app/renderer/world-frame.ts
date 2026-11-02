import { Bounds3, Vec3 } from '../domain/types';

/**
 * The ONLY coordinate conversion between the domain and Three.js.
 *
 * Both frames are Z-up, right-handed, metres (the renderer sets camera.up to +Z),
 * so the mapping is a pure translation by `origin` — no axis is ever swapped.
 * The translation keeps render coordinates near zero for float precision.
 */
export class WorldFrame {
  constructor(readonly origin: Vec3) {}

  static centeredOn(bounds: Bounds3): WorldFrame {
    return new WorldFrame([
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      bounds.min[2],
    ]);
  }

  toRender(p: Vec3): Vec3 {
    return [p[0] - this.origin[0], p[1] - this.origin[1], p[2] - this.origin[2]];
  }

  toDomain(p: Vec3): Vec3 {
    return [p[0] + this.origin[0], p[1] + this.origin[1], p[2] + this.origin[2]];
  }

  /** Domain elevation → render z (for planes such as the section). */
  zToRender(z: number): number {
    return z - this.origin[2];
  }

  /** Converts an interleaved xyz buffer into render space IN PLACE (caller owns the buffer). */
  bufferToRenderInPlace(buf: Float32Array): Float32Array {
    const [ox, oy, oz] = this.origin;
    for (let i = 0; i < buf.length; i += 3) {
      buf[i] -= ox;
      buf[i + 1] -= oy;
      buf[i + 2] -= oz;
    }
    return buf;
  }

  /** Converts an interleaved xyz buffer into render space (new array). */
  bufferToRender(src: ArrayLike<number>): Float32Array {
    const out = new Float32Array(src.length);
    const [ox, oy, oz] = this.origin;
    for (let i = 0; i < src.length; i += 3) {
      out[i] = src[i] - ox;
      out[i + 1] = src[i + 1] - oy;
      out[i + 2] = src[i + 2] - oz;
    }
    return out;
  }
}
