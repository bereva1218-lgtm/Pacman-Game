/* P2 LAURA — Pacman: el jugador.
 *
 * Reemplaza al TestPlayer provisional. Expone EXACTAMENTE lo que leen los
 * fantasmas (P3) y Collisions: mesh.position, tile, dir, speed, boost y teleport().
 *
 * MOVIMIENTO (estilo Pac-Man clásico)
 *   · Se mueve casilla a casilla y sigue avanzando aunque sueltes la tecla.
 *   · Giro anticipado: si presionas una dirección antes de llegar a una esquina,
 *     se guarda y se aplica en cuanto esa casilla esté libre.
 *   · Dar media vuelta es instantáneo, incluso a mitad de casilla.
 *   · Al llegar al centro de cada casilla emite EVENTS.PLAYER_TILE (lo escucha LevelManager).
 *   · Si prefieren "solo avanza mientras mantienes la tecla", pongan holdToMove: true.
 *
 * ANIMACIÓN Y EFECTOS (todo por código, el modelo voxel no se toca)
 *   · Saltito y squash & stretch al caminar; respiración suave en reposo.
 *   · Farol: una luz cálida que lo acompaña por la mansión.
 *   · Poderes (escucha 'power:changed' { power }):
 *       speed        → más rápido (boost) + estela de sombras
 *       invisibility → semitransparente
 *       shield       → burbuja azul alrededor
 *       energy       → aura morada girando en el piso
 *   · Parpadeo al recibir daño (EVENTS.PLAYER_HIT).
 */
import * as THREE from 'three';
import { EVENTS } from '../config.js';
import { assets } from '../core/AssetLoader.js';
import { PLAYER_TELEPORT } from '../ghosts/Clyde.js';

const SPEED_BOOST = 1.8;          // multiplicador con la poción de velocidad
const HURT_TIME = 1.5;            // segundos de parpadeo tras un golpe
const TURN_SPEED = 18;            // qué tan rápido gira el modelo hacia donde va
const TRAIL_COUNT = 3;            // sombras de la estela de velocidad

const sameDir = (a, b) => a && b && a.x === b.x && a.z === b.z;
const isReverse = (a, b) => a && b && a.x === -b.x && a.z === -b.z;

export class Pacman {
    /**
     * @param {Object} ctx  el ctx de main.js (usa scene, maze, input, bus)
     * @param {Object} ctx.start      casilla inicial { col, row }
     * @param {boolean} [ctx.holdToMove=false]
     * @param {number}  [ctx.lantern=1.4]  intensidad del farol (0 = sin farol)
     */
    constructor({ scene, maze, input, bus, start, holdToMove = false, lantern = 1.4 }) {
        Object.assign(this, { scene, maze, input, bus, holdToMove });

        this.speed = 5;           // casillas por segundo (lo leen los fantasmas)
        this.boost = 1;           // lo cambia el poder de velocidad (lo lee Clyde)
        this.dir = null;          // dirección actual { x, z } (lo leen los fantasmas)
        this.queued = null;       // giro guardado para la próxima esquina
        this.target = null;       // casilla hacia la que va
        this.power = null;
        this.hurtTime = 0;
        this.time = 0;

        this._buildMesh(lantern);
        this.teleport(start);

        bus.on(EVENTS.PLAYER_RESPAWN, (t) => this.teleport(t));   // vida perdida / nivel nuevo
        bus.on(PLAYER_TELEPORT, (t) => this.teleport(t));         // intercambio de Clyde y etapa del jefe
        bus.on(EVENTS.PLAYER_HIT, () => { this.hurtTime = HURT_TIME; });
        bus.on('power:changed', ({ power } = {}) => this.setPower(power));
    }

    // ───────────────────────── API que usan otros módulos ─────────────────────────

    teleport({ col, row }) {
        this.tile = { col, row };
        this.target = null;
        this.dir = null;
        this.queued = null;
        this.input.clearDirection();
        this.maze.tileToWorld(col, row, this.mesh.position);
        this._trail.forEach((g) => { g.visible = false; });
        this.bus.emit(EVENTS.PLAYER_TILE, { ...this.tile });
    }

    setPower(power) {
        this.power = power ?? null;
        this.boost = this.power === 'speed' ? SPEED_BOOST : 1;
        this._setOpacity(this.power === 'invisibility' ? 0.25 : 1);
        this._shield.visible = this.power === 'shield';
        this._aura.visible = this.power === 'energy';
        if (this.power !== 'speed') this._trail.forEach((g) => { g.visible = false; });
    }

    update(dt) {
        this.time += dt;
        this._move(dt);
        this._animate(dt);
        this._updateEffects(dt);
    }

    dispose() {
        this.scene.remove(this.mesh);
        this._trail.forEach((g) => this.scene.remove(g));
    }

    // ───────────────────────── Movimiento ─────────────────────────

    _move(dt) {
        const want = this.input.getMoveDirection();
        if (want) this.queued = { x: want.x, z: want.z };

        // Media vuelta instantánea a mitad de casilla
        if (this.target && isReverse(this.queued, this.dir)) {
            this.target = { ...this.tile };
            this.dir = this.queued;
            this.queued = null;
        }

        let step = this.speed * this.boost * this.maze.tile * dt;

        // Puede llegar a una casilla y seguir a la siguiente en el mismo frame
        for (let i = 0; i < 2 && step > 0; i++) {
            if (!this.target && !this._chooseNext(want)) return;

            const goal = this.maze.tileToWorld(this.target.col, this.target.row);
            const pos = this.mesh.position;
            const dist = pos.distanceTo(goal);

            if (dist <= step) {
                pos.copy(goal);
                step -= dist;
                this.tile = this.target;
                this.target = null;
                this.bus.emit(EVENTS.PLAYER_TILE, { ...this.tile });
            } else {
                pos.addScaledVector(goal.clone().sub(pos).normalize(), step);
                step = 0;
            }
        }
    }

    /** En el centro de una casilla: decide hacia dónde seguir. Devuelve false si se queda quieto. */
    _chooseNext(want) {
        const free = (d) => d && this.maze.isWalkable(this.tile.col + d.x, this.tile.row + d.z);

        if (free(this.queued)) {
            this.dir = this.queued;
            this.queued = null;
        } else if (this.holdToMove && !want) {
            this.dir = null;
        } else if (!free(this.dir)) {
            this.dir = null;
        }

        if (!this.dir) return false;
        this.target = { col: this.tile.col + this.dir.x, row: this.tile.row + this.dir.z };
        return true;
    }

    // ───────────────────────── Animación ─────────────────────────

    _animate(dt) {
        const t = this.time;
        const tile = this.maze.tile;
        const moving = !!this.target;

        // Girar suave hacia la dirección (por el camino más corto)
        if (this.dir) {
            const goal = Math.atan2(this.dir.x, this.dir.z);
            let diff = goal - this.model.rotation.y;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            this.model.rotation.y += diff * Math.min(1, TURN_SPEED * dt);
        }

        // Caminar: saltitos + squash & stretch. Quieto: respiración.
        const rate = 14 * this.boost;
        const hop = moving ? Math.abs(Math.sin(t * rate)) * 0.08 * tile : 0;
        const squash = moving ? Math.sin(t * rate * 2) * 0.06 : Math.sin(t * 2.5) * 0.025;
        this.model.position.y = this._baseY + hop;
        this.model.scale.set(
            this._baseScale.x * (1 + squash),
            this._baseScale.y * (1 - squash),
            this._baseScale.z * (1 + squash),
        );

        // Parpadeo tras un golpe
        if (this.hurtTime > 0) {
            this.hurtTime -= dt;
            this.model.visible = this.hurtTime <= 0 || Math.floor(this.hurtTime * 12) % 2 === 0;
        }
    }

    _updateEffects(dt) {
        const t = this.time;

        // Farol: titila como una vela
        if (this._light) {
            this._light.intensity = this._lightBase * (0.88 + Math.sin(t * 9) * 0.06 + Math.sin(t * 23) * 0.04);
            this._light.color.set(this.power === 'energy' ? 0xb9a8ff : 0xffc27a);
        }

        if (this._shield.visible) {
            const s = 1 + Math.sin(t * 5) * 0.05;
            this._shield.scale.setScalar(s);
            this._shield.material.opacity = 0.22 + Math.sin(t * 5) * 0.06;
            this._shield.rotation.y += dt * 0.8;
        }

        if (this._aura.visible) {
            this._aura.rotation.z += dt * 2.5;
            this._aura.material.opacity = 0.45 + Math.sin(t * 8) * 0.15;
        }

        if (this.power === 'speed') this._updateTrail(dt);
    }

    /** Estela de velocidad: copias semitransparentes que se quedan atrás. */
    _updateTrail(dt) {
        // Las sombras visibles se desvanecen en cada frame
        this._trail.forEach((g) => {
            if (!g.visible) return;
            g.userData.life -= dt;
            if (g.userData.life <= 0) g.visible = false;
            else g.traverse((o) => { if (o.material) o.material.opacity = g.userData.life * 1.2; });
        });

        // Y se suelta una nueva cada 0,06 s mientras avanza
        this._trailTimer -= dt;
        if (this._trailTimer > 0 || !this.target) return;
        this._trailTimer = 0.06;

        const ghost = this._trail[this._trailIndex];
        this._trailIndex = (this._trailIndex + 1) % TRAIL_COUNT;
        ghost.position.copy(this.mesh.position);
        ghost.position.y += this._baseY;
        ghost.rotation.y = this.model.rotation.y;
        ghost.visible = true;
        ghost.userData.life = 0.25;
    }

    // ───────────────────────── Construcción ─────────────────────────

    _buildMesh(lantern) {
        const tile = this.maze.tile;

        // mesh = contenedor (su posición es la que leen los fantasmas)
        // model = el voxel (se anima sin mover la posición lógica)
        this.mesh = new THREE.Group();
        this.mesh.name = 'Pacman';
        this.model = assets.get('pacman', { size: 0.8 * tile });
        this.model.traverse((o) => {
            if (o.isMesh) {
                o.castShadow = true;
                o.material = o.material.clone(); // propio, para la invisibilidad
                o.material.transparent = true;
            }
        });
        this.mesh.add(this.model);
        this._baseY = this.model.position.y;
        this._baseScale = this.model.scale.clone();

        // Farol
        this._lightBase = lantern;
        if (lantern > 0) {
            this._light = new THREE.PointLight(0xffc27a, lantern, tile * 5, 1.6);
            this._light.position.y = tile * 0.9;
            this.mesh.add(this._light);
        }

        // Escudo
        this._shield = new THREE.Mesh(
            new THREE.IcosahedronGeometry(tile * 0.62, 2),
            new THREE.MeshBasicMaterial({
                color: 0x5ee0ff, transparent: true, opacity: 0.25,
                depthWrite: false, blending: THREE.AdditiveBlending,
            }),
        );
        this._shield.position.y = tile * 0.4;
        this._shield.visible = false;
        this.mesh.add(this._shield);

        // Aura de energía (anillo en el piso)
        this._aura = new THREE.Mesh(
            new THREE.RingGeometry(tile * 0.45, tile * 0.6, 6),
            new THREE.MeshBasicMaterial({
                color: 0xb9a8ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
                depthWrite: false, blending: THREE.AdditiveBlending,
            }),
        );
        this._aura.rotation.x = -Math.PI / 2;
        this._aura.position.y = 0.02;
        this._aura.visible = false;
        this.mesh.add(this._aura);

        // Estela (copias del modelo en la escena, no dentro de mesh)
        this._trail = [];
        this._trailIndex = 0;
        this._trailTimer = 0;
        for (let i = 0; i < TRAIL_COUNT; i++) {
            const ghost = this.model.clone(true);
            ghost.traverse((o) => {
                if (o.isMesh) {
                    o.castShadow = false;
                    o.material = new THREE.MeshBasicMaterial({
                        color: 0xffe29a, transparent: true, opacity: 0.3, depthWrite: false,
                    });
                }
            });
            ghost.visible = false;
            this.scene.add(ghost);
            this._trail.push(ghost);
        }

        this.scene.add(this.mesh);
    }

    _setOpacity(value) {
        this.model.traverse((o) => {
            if (o.isMesh) {
                o.material.opacity = value;
                o.material.depthWrite = value >= 1;
            }
        });
    }
}