/* P3 — Ghost: clase base de todos los fantasmas.
 *
 * Trae: vida, velocidad, estados (patrullar, perseguir, aturdido, derrotado),
 * takeHit(), parpadeo al recibir un golpe y barra de vida encima.
 *
 * Lo que usa de los demás:
 *   P1  maze.isWalkable / neighbors / tileToWorld / worldToTile / tile / cols / rows
 *       assets.get(key, { size })          modelo voxel o placeholder
 *       bus.emit(EVENTS.GHOST_DEFEATED, { ghost, col, row })   → LevelManager pone la llave
 *   P2  player.mesh.position   posición continua, para colisiones
 *       player.tile            { col, row }
 *       player.dir             { x, z } (como Input) o { col, row }; puede ser null
 *       powers.has('speed'|'invisibility'|'shield'|'energy')  → PowerState.js
 *
 * Mientras P2 no esté listo, Debug.js / GhostDebug.js hacen de jugador.
 */
import * as THREE from 'three';
import { EVENTS } from '../config.js';
import { bfsNextStep } from './PathFinding.js';

export const GHOST_STATE = Object.freeze({
    PATRULLAR: 'patrullar',
    PERSEGUIR: 'perseguir',
    ATURDIDO: 'aturdido',
    DERROTADO: 'derrotado',
});

export class Ghost {
    constructor(opts) {
        const {
            scene, maze, player, bus, assets, powers,
            manager = null,
            name = 'ghost',
            modelKey = name,
            color = 0xffffff,
            maxHits = 1,
            speed = 3.2,                 // casillas por segundo
            spawnTile = { col: 1, row: 1 },
            vulnerableA = ['melee'],     // qué tipo de daño le hace efecto
            classic = false,             // nivel 5: IA original, sin ataque especial
        } = opts;

        Object.assign(this, { scene, maze, player, bus, assets, powers, manager });

        this.name = name;
        this.color = color;
        this.maxHits = maxHits;
        this.hits = 0;
        this.baseSpeed = speed;
        this.speedMul = 1;
        this.vulnerableA = vulnerableA;
        this.classic = classic;

        this.spawnTile = { ...spawnTile };
        this.state = GHOST_STATE.PERSEGUIR;
        this.locked = false;             // nivel 5: comido y encerrado en su spawn

        this.forcedDir = null;           // movimiento en línea recta (embestida)
        this.stunTime = 0;
        this.blinkTime = 0;
        this.specialCd = 0;
        this.hitCooldown = 0;            // evita varios golpes en el mismo contacto
        this.lastPlayerDir = { col: 1, row: 0 };

        this._a = new THREE.Vector3();   // vectores de trabajo (no crear uno por frame)
        this._b = new THREE.Vector3();

        this._buildMesh(modelKey);
        this._buildHealthBar();
        this.placeAt(this.spawnTile);
    }

    // ---------------------------------------------------------------- visual

    _buildMesh(modelKey) {
        this.group = new THREE.Group();
        this.group.name = `ghost_${this.name}`;

        this.model = this.assets.get(modelKey, { size: 0.8 * this.maze.tile });
        this.group.add(this.model);

        // Clonamos materiales: así teñir a uno no tiñe a los demás (el AssetLoader los comparte)
        this.materials = [];
        this.model.traverse((o) => {
            if (!o.isMesh || !o.material) return;
            o.material = o.material.clone();
            this.materials.push(o.material);
        });

        this.scene.add(this.group);
    }

    _buildHealthBar() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 24;
        this._barCanvas = canvas;
        this._barCtx = canvas.getContext('2d');

        this._barTex = new THREE.CanvasTexture(canvas);
        this.healthBar = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this._barTex, depthTest: false, transparent: true,
        }));
        this.healthBar.scale.set(this.maze.tile * 1.1, this.maze.tile * 0.2, 1);
        this.healthBar.position.y = this.maze.tile * 1.15;
        this.healthBar.renderOrder = 999;
        this.group.add(this.healthBar);

        this.updateHealthBar();
    }

    updateHealthBar() {
        const ctx = this._barCtx;
        const { width: w, height: h } = this._barCanvas;
        const left = Math.max(0, this.maxHits - this.hits) / this.maxHits;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(0,0,0,.65)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = left > 0.5 ? '#4caf50' : left > 0.25 ? '#ffc107' : '#f44336';
        ctx.fillRect(3, 3, (w - 6) * left, h - 6);

        // Separadores: se ve cuántos impactos faltan
        if (this.maxHits > 1) {
            ctx.fillStyle = 'rgba(0,0,0,.8)';
            for (let i = 1; i < this.maxHits; i++) {
                ctx.fillRect(3 + ((w - 6) / this.maxHits) * i - 1, 3, 2, h - 6);
            }
        }
        this._barTex.needsUpdate = true;
    }

    // ------------------------------------------------------- grilla y jugador

    placeAt(tile) {
        this.tile = { ...tile };
        this.prevTile = { ...tile };
        this.nextTile = { ...tile };
        this.progress = 0;
        this.maze.tileToWorld(tile.col, tile.row, this.group.position);
        this.pickNextTile();   // así arranca a moverse de una, sin quedarse un instante quieto
    }

    get position() { return this.group.position; }

    get speed() { return this.baseSpeed * this.speedMul; }

    get playerTile() { return this.player.tile; }

    /** Normaliza la dirección del jugador: Input usa {x,z}, la grilla usa {col,row} */
    get playerDir() {
        const d = this.player.dir;
        if (d) {
            const dir = ('col' in d) ? { col: d.col, row: d.row } : { col: d.x, row: d.z };
            if (dir.col !== 0 || dir.row !== 0) this.lastPlayerDir = dir;
        }
        return this.lastPlayerDir;
    }

    distanceToPlayer() {
        return this.maze.distance(this.tile, this.playerTile);
    }

    /** Casilla N posiciones delante del jugador; si es pared prueba N-1, N-2... */
    tileAheadOfPlayer(n) {
        const dir = this.playerDir;
        const p = this.playerTile;
        for (let i = n; i >= 1; i--) {
            const col = p.col + dir.col * i;
            const row = p.row + dir.row * i;
            if (this.maze.isWalkable(col, row)) return { col, row };
        }
        return { ...p };
    }

    randomTile() {
        return this.maze.randomFreeTile((t) => this.maze.distance(t, this.playerTile) >= 5)
            ?? this.spawnTile;
    }

    // ------------------------------------------------------------ movimiento

    /** Casilla objetivo: cada fantasma la sobrescribe */
    getTargetTile() {
        return this.playerTile;
    }

    pickNextTile() {
        this.prevTile = { ...this.tile };

        // Movimiento forzado en línea recta (embestida de Blinky)
        if (this.forcedDir) {
            const col = this.tile.col + this.forcedDir.col;
            const row = this.tile.row + this.forcedDir.row;
            if (this.maze.isWalkable(col, row)) {
                this.nextTile = { col, row };
                return;
            }
            this.onForcedDirBlocked();
        }

        const next = bfsNextStep(this.maze, this.tile, this.getTargetTile(), this.prevTile);
        this.nextTile = next ?? { ...this.tile };
    }

    onForcedDirBlocked() { this.forcedDir = null; }

    move(dt) {
        this.progress += this.speed * dt;

        let guard = 0;
        while (this.progress >= 1 && guard++ < 8) {
            this.progress -= 1;
            this.tile = { ...this.nextTile };
            this.pickNextTile();
        }

        const a = this.maze.tileToWorld(this.tile.col, this.tile.row, this._a);
        const b = this.maze.tileToWorld(this.nextTile.col, this.nextTile.row, this._b);
        this.group.position.lerpVectors(a, b, this.progress);

        if (!a.equals(b)) this.group.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    }

    // ------------------------------------------------------------------ loop

    update(dt) {
        if (this.state === GHOST_STATE.DERROTADO || this.locked) return;

        if (this.hitCooldown > 0) this.hitCooldown -= dt;
        if (this.specialCd > 0) this.specialCd -= dt;
        this._updateBlink(dt);

        if (this.state === GHOST_STATE.ATURDIDO) {
            this.stunTime -= dt;
            if (this.stunTime <= 0) {
                this.state = GHOST_STATE.PERSEGUIR;
                this.resetColor();
            }
            return; // aturdido no se mueve ni ataca
        }

        if (!this.classic) this.updateSpecial(dt);
        this.move(dt);
    }

    /** Ataque especial: lo implementa cada fantasma */
    updateSpecial(dt) { }

    // --------------------------------------------------------------- combate

    /**
     * @param {'melee'|'wave'|'superball'} type
     * @returns {boolean} true si el golpe contó
     */
    takeHit(type = 'melee', amount = 1) {
        if (this.state === GHOST_STATE.DERROTADO) return false;
        if (this.hitCooldown > 0) return false;
        if (!this.vulnerableA.includes(type)) {
            this.bus.emit('ghost:immune', { ghost: this.name, type });
            return false;
        }

        this.hits += amount;
        this.hitCooldown = 0.4;
        this.blink(0.5);
        this.updateHealthBar();
        this.bus.emit('ghost:hit', {
            ghost: this.name, type, hits: this.hits, maxHits: this.maxHits,
        });

        if (this.hits >= this.maxHits) {
            this.defeat();
            return true;
        }
        this.stun(0.6); // se frena un momento: el jugador ve que le pegó
        return true;
    }

    stun(seconds) {
        if (this.state === GHOST_STATE.DERROTADO) return;
        this.state = GHOST_STATE.ATURDIDO;
        this.stunTime = seconds;
        this.forcedDir = null;
        this.speedMul = 1;
        this.tint(0x5555ff); // versión aturdida
    }

    defeat() {
        this.state = GHOST_STATE.DERROTADO;
        this.forcedDir = null;
        this.group.visible = false;
        // LevelManager usa col/row para poner la llave donde cayó
        this.bus.emit(EVENTS.GHOST_DEFEATED, {
            ghost: this.name, col: this.tile.col, row: this.tile.row,
        });
        this.onDefeat();
    }

    onDefeat() { /* hook: p. ej. borrar clones o proyectiles */ }

    /** Nivel 5: comido con su súper bola — vuelve al spawn y queda encerrado */
    lockInSpawn() {
        this.locked = true;
        this.state = GHOST_STATE.PATRULLAR;
        this.placeAt(this.spawnTile);
        this.tint(0x444444);
        this.bus.emit('ghost:locked', { ghost: this.name });
    }

    // ---------------------------------------------------------------- efectos

    blink(duration = 0.5) { this.blinkTime = duration; }

    _updateBlink(dt) {
        if (this.blinkTime <= 0) return;
        this.blinkTime -= dt;
        this.model.visible = Math.floor(this.blinkTime * 16) % 2 === 0;
        if (this.blinkTime <= 0) this.model.visible = true;
    }

    tint(hex) {
        for (const m of this.materials) m.color?.setHex(hex);
    }

    resetColor() { this.tint(this.color); }

    /** Aviso antes de un ataque especial: parpadeo + evento para el sonido */
    warn(duration = 0.6) {
        this.blink(duration);
        this.bus.emit('ghost:warn', { ghost: this.name });
    }

    dispose() {
        this.scene.remove(this.group);
        this._barTex?.dispose();
        this.healthBar?.material?.dispose();
        for (const m of this.materials) m.dispose();
        // La geometría la comparte el AssetLoader: no se hace dispose aquí
    }
}
