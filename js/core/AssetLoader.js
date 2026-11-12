/* COMPARTIDO (lo mantiene P1 VALERIA) — Carga los modelos voxel del juego.
 *
 * CÓMO SE USA (los 3 programadores):
 *   import { assets } from '../core/AssetLoader.js';
 *   const llave = assets.get('key', { size: 0.6 });   // Object3D listo para scene.add()
 *
 * SI EL MODELO TODAVÍA NO EXISTE:
 *   Se usa un "placeholder" (figura simple de Three.js) del mismo tamaño. El juego
 *   funciona igual. El día que guardes el .vox en assets/models/ con el nombre del
 *   MANIFEST, aparece solo, sin tocar código.
 *
 * Formatos soportados: .vox (MagicaVoxel directo), .glb/.gltf, .obj (+ .mtl con el mismo nombre).
 */
import * as THREE from 'three';
import { VOXLoader, buildMesh } from 'three/addons/loaders/VOXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { CONFIG } from '../config.js';

/** nombre → archivo. P2 y P3: agreguen aquí sus modelos (pacman, fantasmas...). */
export const MANIFEST = {
    // --- P1: mundo ---
    wall: 'assets/models/wall.vox',
    door: 'assets/models/door.vox',
    key: 'assets/models/key.vox',
    hint: 'assets/models/hint.vox',
    // --- P1: objetos de poder (uno por nivel) ---
    power_speed: 'assets/models/power_speed.vox',               // poción de velocidad
    power_invisibility: 'assets/models/power_invisibility.vox', // estrella de invisibilidad
    power_shield: 'assets/models/power_shield.vox',             // cristal protector
    power_energy: 'assets/models/power_energy.vox',             // esfera de energía
    // --- P1: objetos falsos (se parecen a los reales) ---
    fake_speed: 'assets/models/fake_speed.vox',
    fake_invisibility: 'assets/models/fake_invisibility.vox',
    fake_shield: 'assets/models/fake_shield.vox',
    fake_energy: 'assets/models/fake_energy.vox',
    // --- P2 / P3 (placeholders mientras tanto) ---
    pacman: 'assets/models/pacman.vox',
    blinky: 'assets/models/blinky.vox',
    pinky: 'assets/models/pinky.vox',
    inky: 'assets/models/inky.vox',
    clyde: 'assets/models/clyde.vox',
};

// ---------------------------------------------------------------------------
// Placeholders: figuras simples para cuando el .vox aún no existe
// ---------------------------------------------------------------------------
const mat = (color, emissive = 0) =>
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: emissive, roughness: 0.6 });

function starShape(points = 5, outer = 0.5, inner = 0.22) {
    const s = new THREE.Shape();
    for (let i = 0; i <= points * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        i === 0 ? s.moveTo(x, y) : s.lineTo(x, y);
    }
    return s;
}

function ghostPlaceholder(color) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 16), mat(color, 0.2));
    body.position.y = 0.25;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(color, 0.2));
    head.position.y = 0.5;
    g.add(body, head);
    return g;
}

const POWER_LOOK = {
    speed: () => {
        const g = new THREE.Group();
        const flask = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), mat(0xff3355, 0.5));
        flask.position.y = 0.3;
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.25, 8), mat(0xffffff, 0.2));
        neck.position.y = 0.65;
        g.add(flask, neck);
        return g;
    },
    invisibility: () => new THREE.Mesh(
        new THREE.ExtrudeGeometry(starShape(), { depth: 0.15, bevelEnabled: false }),
        mat(0xd9b3ff, 0.5)),
    shield: () => new THREE.Mesh(new THREE.OctahedronGeometry(0.4), mat(0x33e6ff, 0.5)),
    energy: () => new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), mat(0xffee33, 0.7)),
};

const PLACEHOLDERS = {
    wall: () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat(CONFIG.COLORS.WALL, 0.15)),
    door: () => {
        const g = new THREE.Group();
        const board = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.25), mat(CONFIG.COLORS.DOOR));
        board.position.y = 0.6;
        const lock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.1), mat(CONFIG.COLORS.KEY, 0.4));
        lock.position.set(0, 0.6, 0.15);
        g.add(board, lock);
        return g;
    },
    key: () => {
        const g = new THREE.Group();
        const gold = mat(CONFIG.COLORS.KEY, 0.5);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.06, 8, 16), gold);
        ring.position.y = 0.75;
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), gold);
        shaft.position.y = 0.32;
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.08), gold);
        tooth.position.set(0.1, 0.12, 0);
        g.add(ring, shaft, tooth);
        return g;
    },
    hint: () => new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 10), mat(CONFIG.COLORS.HINT, 0.5)),

    power_speed: POWER_LOOK.speed,
    power_invisibility: POWER_LOOK.invisibility,
    power_shield: POWER_LOOK.shield,
    power_energy: POWER_LOOK.energy,
    // Los falsos usan la misma forma: la idea es que confundan
    fake_speed: POWER_LOOK.speed,
    fake_invisibility: POWER_LOOK.invisibility,
    fake_shield: POWER_LOOK.shield,
    fake_energy: POWER_LOOK.energy,

    pacman: () => new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 16), mat(0xffdd00, 0.3)),
    blinky: () => ghostPlaceholder(0xff2222),
    pinky: () => ghostPlaceholder(0xff88cc),
    inky: () => ghostPlaceholder(0x22ddff),
    clyde: () => ghostPlaceholder(0xffaa33),
};

// ---------------------------------------------------------------------------

export class AssetLoader {
    constructor() {
        this.cache = new Map();      // key -> Object3D original (sin normalizar)
        this.placeholders = new Set();
        this.vox = new VOXLoader();
        this.gltf = new GLTFLoader();
    }

    /** Carga todo el MANIFEST. Nunca falla: lo que no existe queda como placeholder. */
    async loadAll(onProgress = () => {}) {
        const keys = Object.keys(MANIFEST);
        let done = 0;
        await Promise.all(keys.map(async (key) => {
            try {
                this.cache.set(key, await this._loadFile(MANIFEST[key]));
            } catch {
                this._usePlaceholder(key);
            }
            onProgress(++done / keys.length, key);
        }));
        if (this.placeholders.size) {
            console.info(`[AssetLoader] Usando placeholder para: ${[...this.placeholders].join(', ')}`);
        }
    }

    _usePlaceholder(key) {
        const build = PLACEHOLDERS[key] ?? (() => new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(0xff00ff)));
        this.cache.set(key, build());
        this.placeholders.add(key);
    }

    async _loadFile(path) {
        const ext = path.split('.').pop().toLowerCase();
        let obj;
        if (ext === 'vox') {
            const result = await this.vox.loadAsync(path);
            obj = result.scene ?? new THREE.Group().add(...result.chunks.map(buildMesh));
        } else if (ext === 'glb' || ext === 'gltf') {
            obj = (await this.gltf.loadAsync(path)).scene;
        } else if (ext === 'obj') {
            const obj_ = new OBJLoader();
            try {
                const mtl = await new MTLLoader().loadAsync(path.replace(/\.obj$/i, '.mtl'));
                mtl.preload();
                obj_.setMaterials(mtl);
            } catch { /* sin .mtl: se carga sin colores */ }
            obj = await obj_.loadAsync(path);
        } else {
            throw new Error(`Formato no soportado: ${path}`);
        }
        obj.traverse((o) => {
            if (!o.isMesh) return;
            o.castShadow = o.receiveShadow = true;
            // pixeles nítidos en paletas de MagicaVoxel exportadas a textura
            const m = o.material;
            if (m?.map) { m.map.magFilter = THREE.NearestFilter; m.map.minFilter = THREE.NearestFilter; }
        });
        return obj;
    }

    has(key) { return this.cache.has(key); }
    isPlaceholder(key) { return this.placeholders.has(key); }

    /**
     * Devuelve una COPIA lista para añadir a la escena.
     * size: la dimensión más grande del modelo medirá esto (en casillas).
     * El modelo queda centrado en X/Z y apoyado en el piso (y = 0).
     * Ojo: las copias comparten material; si quieres cambiarle el color a una sola,
     * clona su material primero.
     */
    get(key, { size = 1 } = {}) {
        if (!this.cache.has(key)) this._usePlaceholder(key);
        const inner = this.cache.get(key).clone(true);
        inner.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });

        const box = new THREE.Box3().setFromObject(inner);
        const dims = box.getSize(new THREE.Vector3());
        const scale = size / Math.max(dims.x, dims.y, dims.z, 1e-6);
        const center = box.getCenter(new THREE.Vector3());
        inner.scale.multiplyScalar(scale);
        inner.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

        const wrapper = new THREE.Group();
        wrapper.name = key;
        wrapper.add(inner);
        return wrapper;
    }

    /**
     * Para InstancedMesh: una sola geometría + material con la escala ya aplicada.
     * Se usa con modelos de UNA pieza (p. ej. el bloque de pared).
     */
    getInstancingData(key, size = 1) {
        const obj = this.get(key, { size });
        obj.updateMatrixWorld(true);
        let found = null;
        obj.traverse((o) => { if (o.isMesh && !found) found = o; });
        const geometry = found.geometry.clone().applyMatrix4(found.matrixWorld);
        return { geometry, material: found.material };
    }
}

// Instancia compartida
export const assets = new AssetLoader();
