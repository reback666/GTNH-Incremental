import * as THREE from 'three';

export const TURBINE_EFFECT_IDS = new Set([
  'g-hv-mb-steam', 'g-ev-mb-gas', 'g-zpm-mb-plasma', 'g-uev-mb-decay',
]);
export const EYE_EFFECT_ID = 'g-max-mb-blackhole';

export function multiblockEffectKind(id) {
  if (id === EYE_EFFECT_ID) return 'eye';
  return TURBINE_EFFECT_IDS.has(id) ? 'turbine' : null;
}

export function modelCenterOffset(model) {
  return model.size.map(size => (size - 1) / 2);
}

export function effectAnchor(model, kind) {
  const center = modelCenterOffset(model);
  return model.controller.map((coordinate, axis) => coordinate - center[axis]
    + (axis === 2 ? kind === 'eye' ? -16 : 0.501 : 0));
}

export function effectRunning(state, index) {
  return state.activity > 0 && index < Math.min(state.count, state.running);
}

export function eyeDetail(distance) {
  if (distance > 240) return 0;
  return distance > 110 ? 1 : 2;
}

export function turbineGeometry(keys, atlas) {
  const positions = [], uvs = [], indices = [];
  keys.forEach((key, index) => {
    const tile = atlas.tiles.get(key);
    if (!tile) throw new Error(`缺少涡轮覆盖层：${key}`);
    const x = index % 3 - 1, y = 1 - Math.floor(index / 3);
    const offset = positions.length / 3;
    positions.push(x - 0.5, y - 0.5, 0, x + 0.5, y - 0.5, 0,
      x + 0.5, y + 0.5, 0, x - 0.5, y + 0.5, 0);
    uvs.push(tile.uv.u0, tile.uv.v0, tile.uv.u1, tile.uv.v0,
      tile.uv.u1, tile.uv.v1, tile.uv.u0, tile.uv.v1);
    indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function orbitGeometry(keys, atlas) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const uv = geometry.getAttribute('uv');
  for (const [face, source] of [3, 2, 4, 5, 0, 1].entries()) {
    const tile = atlas.tiles.get(keys[source]);
    if (!tile) throw new Error(`缺少轨道天体纹理：${keys[source]}`);
    for (let corner = 0; corner < 4; corner++) {
      const vertex = face * 4 + corner;
      uv.setXY(vertex, THREE.MathUtils.lerp(tile.uv.u0, tile.uv.u1, uv.getX(vertex)),
        THREE.MathUtils.lerp(tile.uv.v0, tile.uv.v1, uv.getY(vertex)));
    }
  }
  geometry.clearGroups();
  return geometry;
}

export function createMultiblockEffects(scene, assets) {
  const { manifest, textures, geometries, turbineAtlas, planetAtlas } = assets;
  const root = new THREE.Group();
  root.name = 'multiblock-running-effects';
  scene.add(root);
  const batches = [];
  const ownedGeometry = new Set(geometries.values());
  const ownedMaterial = new Set();
  function batch(name, geometry, material) {
    ownedGeometry.add(geometry);
    ownedMaterial.add(material);
    const item = { name, geometry, material, mesh: null, capacity: 0, count: 0 };
    batches.push(item);
    return item;
  }
  function append(item, matrix) {
    if (item.count >= item.capacity) {
      const previous = item.mesh;
      item.capacity = Math.max(4, item.capacity * 2);
      item.mesh = new THREE.InstancedMesh(item.geometry, item.material, item.capacity);
      item.mesh.name = item.name;
      item.mesh.frustumCulled = false;
      item.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (previous) {
        item.mesh.instanceMatrix.array.set(previous.instanceMatrix.array);
        previous.removeFromParent();
        previous.dispose();
      }
      root.add(item.mesh);
    }
    item.mesh.setMatrixAt(item.count++, matrix);
  }
  const turbineMaterial = new THREE.MeshBasicMaterial({
    map: turbineAtlas.texture, alphaTest: 0.02, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const turbineIdle = batch('turbine-idle', turbineGeometry(manifest.turbine.idle, turbineAtlas), turbineMaterial);
  const turbineActive = batch('turbine-active', turbineGeometry(manifest.turbine.active, turbineAtlas), turbineMaterial);
  const parameters = manifest.eye.parameters;
  const shell = batch('eye-space', geometries.get('space'), new THREE.MeshBasicMaterial({
    map: textures.get(manifest.eye.spaceTexture), side: parameters.spaceInward ? THREE.FrontSide : THREE.BackSide,
    toneMapped: false,
  }));
  const starLayers = manifest.eye.starLayers.map((key, index) => batch(`eye-star-${index}`, geometries.get('star'),
    new THREE.MeshBasicMaterial({ map: textures.get(key), color: 0xff660d,
      transparent: true, opacity: parameters.layerAlphas[index], depthWrite: false,
      blending: index === 0 ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: false })));
  const planetMaterial = new THREE.MeshBasicMaterial({ map: planetAtlas.texture, toneMapped: false });
  const planets = manifest.eye.orbitTextures.map((keys, index) => batch(`eye-orbit-${index}`,
    orbitGeometry(keys, planetAtlas), planetMaterial));
  const frustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const matrix = new THREE.Matrix4();
  const pose = new THREE.Object3D();
  const axis = new THREE.Vector3();
  const orbitRotation = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const orbitPosition = new THREE.Vector3();
  const axes = [[0, 1, 1], [1, 1, 0], [1, 0, 1]].map(values => new THREE.Vector3(...values).normalize());
  const starFacing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  let records = [];
  let previousTime = -1;
  let running = false;
  const metrics = { eyes: 0, orbits: 0, turbines: 0, animated: false, time: 0 };

  function update(states, filter, placementFor, matchesFilter) {
    records = [];
    running = false;
    for (const state of states) {
      const kind = multiblockEffectKind(state.id);
      if (!kind || !matchesFilter(state, filter)) continue;
      for (let index = 0; index < state.count; index++) {
        const placement = placementFor(state, index);
        const position = new THREE.Vector3(...effectAnchor(placement.model, kind)).add(placement.position);
        const active = effectRunning(state, index);
        records.push({ kind, position, active, index });
        running ||= active;
      }
    }
  }

  function frame(camera, time, animated) {
    camera.updateMatrixWorld();
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    for (const item of batches) item.count = 0;
    metrics.eyes = metrics.orbits = metrics.turbines = 0;
    metrics.animated = false;
    let animateTurbines = false;
    const ticks = Math.floor(time * 20);
    for (const record of records) {
      const { kind, position, active } = record;
      const distance = camera.position.distanceTo(position);
      sphere.set(position, kind === 'eye' ? 16 : 2.2);
      if (!frustum.intersectsSphere(sphere)) continue;
      if (kind === 'turbine') {
        if (distance > 240) continue;
        matrix.makeTranslation(position.x, position.y, position.z);
        append(active ? turbineActive : turbineIdle, matrix);
        metrics.turbines++;
        animateTurbines ||= animated && active && distance < 120;
        metrics.animated ||= animateTurbines;
        continue;
      }
      const detail = eyeDetail(distance);
      if (!active || !detail) continue;
      metrics.eyes++;
      metrics.animated ||= animated;
      pose.position.copy(position);
      pose.quaternion.identity();
      pose.scale.setScalar(parameters.spaceScale);
      pose.updateMatrix();
      append(shell, pose.matrix);
      for (let layer = 0; layer < (detail === 2 ? starLayers.length : 1); layer++) {
        const degrees = parameters.baseAngles[layer] + time * parameters.rotationDegreesPerSecond;
        pose.quaternion.copy(starFacing).multiply(spin.setFromAxisAngle(axes[layer], degrees * Math.PI / 180));
        pose.scale.setScalar(parameters.starBaseScale * parameters.layerGrowth ** layer);
        pose.updateMatrix();
        append(starLayers[layer], pose.matrix);
      }
      if (detail !== 2) continue;
      for (let index = 0; index < parameters.orbits.length; index++) {
        const orbit = parameters.orbits[index];
        const phase = time * orbit.speed;
        axis.set(0, 0, 1);
        orbitRotation.setFromAxisAngle(axis, orbit.zAngle);
        axis.set(1, 0, 0);
        orbitRotation.multiply(spin.setFromAxisAngle(axis, orbit.xAngle));
        orbitPosition.set(-Math.cos(phase) * orbit.distance, 0, Math.sin(phase) * orbit.distance).applyQuaternion(orbitRotation);
        pose.position.copy(position).add(orbitPosition);
        axis.set(0, 1, 0);
        pose.quaternion.copy(orbitRotation).multiply(spin.setFromAxisAngle(axis, phase + time * orbit.spin));
        pose.scale.setScalar(orbit.scale);
        pose.updateMatrix();
        append(planets[orbit.texture], pose.matrix);
        metrics.orbits++;
      }
    }
    const activeTextures = animateTurbines ? new Set(manifest.turbine.active) : new Set();
    const textureChanged = turbineAtlas.update(ticks, activeTextures);
    for (const item of batches) if (item.mesh) {
      item.mesh.visible = item.count > 0;
      item.mesh.count = item.count;
      if (item.count) item.mesh.instanceMatrix.needsUpdate = true;
    }
    const changed = textureChanged || time !== previousTime && metrics.animated;
    previousTime = time;
    metrics.time = time;
    return { changed, animated: metrics.animated };
  }

  return {
    update, frame, metrics,
    get hasRunning() { return running; },
    dispose() {
      root.removeFromParent();
      batches.forEach(item => item.mesh?.dispose());
      ownedGeometry.forEach(geometry => geometry.dispose());
      ownedMaterial.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
      turbineAtlas.dispose();
      planetAtlas.dispose();
      records = [];
    },
  };
}
