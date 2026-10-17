// Free-view camera: pointer drag to look around, WASD/Space/Shift to fly,
// wheel to zoom, and a Minecraft-style walking mode.

import * as THREE from "three";

const DEG = Math.PI / 180;

export class FreeCamera {
  constructor(camera, domElement, opts = {}) {
    this.camera = camera;
    this.dom = domElement;
    this.mode = "fly"; // "fly" | "walk" | "orbit"
    this.yaw = opts.yaw ?? -0.6;
    this.pitch = opts.pitch ?? -0.42;
    this.flySpeed = 18;
    this.sensitivity = 0.0026;
    this.orbitTarget = new THREE.Vector3(0, 1, 0);
    this.orbitDistance = opts.orbitDistance ?? 90;
    this.orbitPitch = 0.5;
    this.keys = new Set();
    this.velocity = new THREE.Vector3();
    this.onMode = opts.onMode || (() => {});
    this.onClick = opts.onClick || null;
    this.onSpeed = opts.onSpeed || null;
    this._dragging = 0;
    this._moved = 0;
    camera.rotation.order = "YXZ";
    this.home = {
      pos: camera.position.clone(),
      yaw: this.yaw,
      pitch: this.pitch,
      speed: this.flySpeed,
    };
    this._bind();
    this.sync();
  }

  _bind() {
    const dom = this.dom;
    dom.addEventListener("contextmenu", (e) => e.preventDefault());
    dom.addEventListener("pointerdown", (e) => {
      dom.setPointerCapture?.(e.pointerId);
      this._dragging = e.button + 1;
      this._moved = 0;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    });
    window.addEventListener("pointerup", (e) => {
      if (this._dragging && this._moved < 4) this.onClick?.(e);
      this._dragging = 0;
      dom.releasePointerCapture?.(e.pointerId);
    });
    window.addEventListener("pointermove", (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this._moved += Math.abs(dx) + Math.abs(dy);
      if (this.mode === "orbit") {
        this.orbitYaw = (this.orbitYaw ?? 0) - dx * this.sensitivity * 1.6;
        this.orbitPitch = Math.min(1.45, Math.max(-0.15, this.orbitPitch + dy * this.sensitivity * 1.6));
        return;
      }
      this.yaw -= dx * this.sensitivity;
      this.pitch = Math.min(1.55, Math.max(-1.55, this.pitch - dy * this.sensitivity));
    });
    dom.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (this.mode === "orbit") {
          this.orbitDistance = Math.min(600, Math.max(6, this.orbitDistance * (1 + Math.sign(e.deltaY) * 0.12)));
        } else {
          this.flySpeed = Math.min(400, Math.max(2, this.flySpeed * (1 - Math.sign(e.deltaY) * 0.15)));
          this.onSpeed?.(this.flySpeed);
        }
      },
      { passive: false }
    );
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === "f") this.setMode(this.mode === "fly" ? "walk" : "fly");
      if (k === "o") this.setMode(this.mode === "orbit" ? "fly" : "orbit");
      if (k === "r") this.reset();
      if (["w", "a", "s", "d", " "].includes(k)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
  }

  setMode(mode) {
    if (mode === "orbit" && this.mode !== "orbit") {
      this.orbitYaw = this.yaw;
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      this.orbitTarget.copy(this.camera.position).addScaledVector(dir, 40);
      this.orbitTarget.y = 2;
    }
    if (this.mode === "orbit" && mode !== "orbit") {
      // keep looking at the same direction we had
      const off = this.camera.position.clone().sub(this.orbitTarget);
      this.yaw = Math.atan2(-off.x, -off.z);
      this.pitch = Math.asin(THREE.MathUtils.clamp(off.y / off.length(), -1, 1));
    }
    this.mode = mode;
    this.onMode(mode);
    this.sync();
  }

  reset() {
    this.mode = "fly";
    this.camera.position.copy(this.home.pos);
    this.yaw = this.home.yaw;
    this.pitch = this.home.pitch;
    this.flySpeed = this.home.speed;
    this.onMode(this.mode);
    this.onSpeed?.(this.flySpeed);
    this.sync();
  }

  sync() {
    if (this.mode === "orbit") {
      const yaw = this.orbitYaw ?? this.yaw;
      const d = this.orbitDistance;
      const cp = Math.cos(this.orbitPitch);
      this.camera.position.set(
        this.orbitTarget.x + Math.sin(yaw) * cp * d,
        this.orbitTarget.y + Math.sin(this.orbitPitch) * d,
        this.orbitTarget.z + Math.cos(yaw) * cp * d
      );
      this.camera.lookAt(this.orbitTarget);
      return;
    }
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }

  update(dt) {
    const k = this.keys;
    const fwd = (k.has("w") ? 1 : 0) - (k.has("s") ? 1 : 0);
    const right = (k.has("d") ? 1 : 0) - (k.has("a") ? 1 : 0);
    if (this.mode === "orbit") {
      if (fwd || right) {
        const s = this.orbitDistance * 0.9 * dt;
        const yaw = this.orbitYaw ?? this.yaw;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        this.orbitTarget.x += (fx * fwd + fz * right) * s * -1;
        this.orbitTarget.z += (fz * fwd - fx * right) * s * -1;
      }
      this.sync();
      return;
    }
    const speed = (k.has("control") ? this.flySpeed * 3 : k.has("shift") && this.mode === "fly" ? 0.35 : 1) * this.flySpeed;
    if (this.mode === "fly") {
      const up = (k.has(" ") ? 1 : 0) - (k.has("shift") ? 1 : 0);
      const dir = new THREE.Vector3(right, up, -fwd);
      if (dir.lengthSq() > 0) {
        dir.normalize().applyEuler(this.camera.rotation);
        this.camera.position.addScaledVector(dir, speed * dt);
      }
      this.camera.position.y = Math.max(0.2, this.camera.position.y);
    } else {
      const flat = new THREE.Vector3(right, 0, -fwd).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      this.camera.position.addScaledVector(flat, 4.6 * dt * (k.has("control") ? 2.2 : 1));
      this.camera.position.y = 2.7;
    }
    this.sync();
  }

  forward() {
    const v = new THREE.Vector3();
    this.camera.getWorldDirection(v);
    return v;
  }
}
