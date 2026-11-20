// js/ui/TitleModels.js
// Muestra los modelos 3D del juego (jugador, 4 fantasmas y jefe) girando en la
// pantalla de título. Usa su propio renderer pequeño con fondo transparente.
import * as THREE from 'three';

const LINEUP = [
  { key: 'blinky', size: 1.0 },
  { key: 'pinky', size: 1.0 },
  { key: 'pacman', size: 1.15 },
  { key: 'inky', size: 1.0 },
  { key: 'clyde', size: 1.0 },
];
const SPACING = 1.5;

export class TitleModels {
  constructor(container, assets) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'scr-models';
    container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 4, 5);
    this.scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(30, 2, 0.1, 50);
    this.camera.position.set(0, 1.3, 7.5);
    this.camera.lookAt(0, 0.6, 0);

    this.items = LINEUP.map(({ key, size }, i) => {
      const model = assets.get(key, { size });
      model.position.x = (i - (LINEUP.length - 1) / 2) * SPACING;
      model.userData.phase = i * 0.9;
      this.scene.add(model);
      return model;
    });

    this.running = false;
    this._tick = this._tick.bind(this);
    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize);
    this._resize();
  }

  _resize() {
    const w = this.canvas.clientWidth || 340;
    const h = this.canvas.clientHeight || 170;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._resize();
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  _tick(now) {
    if (!this.running) return;
    const t = now / 1000;
    for (const m of this.items) {
      m.rotation.y = t * 0.9 + m.userData.phase;
      m.position.y = Math.sin(t * 2 + m.userData.phase) * 0.08;
    }
    this.renderer.render(this.scene, this.camera);
    this._raf = requestAnimationFrame(this._tick);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._resize);
    this.renderer.dispose();
    this.canvas.remove();
  }
}
