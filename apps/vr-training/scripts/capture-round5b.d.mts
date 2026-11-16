import type { RoadsLayout } from '../src/training/roads-geometry.js';
export function captureLayout(speedLimit?: 60 | 80, blindBend?: boolean): RoadsLayout;
export function rotate(point: readonly number[], quaternion: readonly number[] | {x: number; y: number; z: number; w: number}): number[];
export function gripDestination(objectOrigin: readonly number[], heldOffset: readonly number[], initialObjectYaw: number, targetObjectYaw: number, initialHandYawDegrees?: number): { position: number[]; yaw: number };
