// Amanatides & Woo grid traversal: finds the first solid voxel along a ray.

export function raycastVoxel(world, origin, dir, maxDist = 160) {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);
  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;
  const stepZ = dir.z > 0 ? 1 : -1;
  const tDeltaX = Math.abs(1 / dir.x);
  const tDeltaY = Math.abs(1 / dir.y);
  const tDeltaZ = Math.abs(1 / dir.z);
  const boundary = (i, step) => (step > 0 ? i + 1 : i);
  let tMaxX = dir.x === 0 ? Infinity : (boundary(x, stepX) - origin.x) / dir.x;
  let tMaxY = dir.y === 0 ? Infinity : (boundary(y, stepY) - origin.y) / dir.y;
  let tMaxZ = dir.z === 0 ? Infinity : (boundary(z, stepZ) - origin.z) / dir.z;
  let normal = [0, 0, 0];
  let t = 0;

  // the camera may start inside a block; check that first
  const start = world.get(x, y, z);
  if (start && start.spec.solid) {
    return { entry: start, voxel: { x, y, z }, normal, point: { ...origin }, distance: 0 };
  }

  for (let guard = 0; guard < 512; guard++) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
      normal = [-stepX, 0, 0];
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
      normal = [0, -stepY, 0];
    } else {
      z += stepZ;
      t = tMaxZ;
      tMaxZ += tDeltaZ;
      normal = [0, 0, -stepZ];
    }
    if (t > maxDist) return null;
    const entry = world.get(x, y, z);
    if (entry && entry.spec.solid) {
      return {
        entry,
        voxel: { x, y, z },
        normal,
        point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t },
        distance: t,
      };
    }
  }
  return null;
}
