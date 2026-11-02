import { PointTier } from '../domain/point-cloud';
import { Bounds3, GenerationParams } from '../domain/types';

export interface PointCloudRequest {
  readonly id: number;
  readonly seed: number;
  readonly params: GenerationParams;
  readonly tier: PointTier;
}

export type PointCloudResponse =
  | {
      readonly id: number;
      readonly ok: true;
      /** Transferred: ownership moves to the receiver. */
      readonly positions: Float32Array;
      readonly count: number;
      readonly bounds: Bounds3;
      readonly tier: PointTier;
      readonly ms: number;
    }
  | { readonly id: number; readonly ok: false; readonly error: string };
