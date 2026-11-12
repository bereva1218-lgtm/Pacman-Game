/* P1 VALERIA — Herramientas de prueba (solo si CONFIG.DEBUG = true).
 *
 * Sirve para probar el laberinto y los niveles SIN esperar a P2 y P3:
 *   - DebugPlayer: una esfera que se mueve por la grilla y emite PLAYER_TILE
 *   - simula el PowerManager: emite POWER_EXPIRED cuando se acaba el poder
 *   - teclas:  G = "vencí al fantasma"   H = "me golpearon"   X = "se acabó el poder"
 *   - un panel de texto con el estado del juego
 *
 * Cuando P2 tenga Pacman listo: CONFIG.DEBUG = false y esto deja de existir.
 */
import { EVENTS } from '../config.js';
import { PLAYER_START } from '../world/mazeData.js';

export class DebugPlayer {
    constructor({ scene, maze, input, bus, assets }) {
        Object.assign(this, { maze, input, bus });
        this.mesh = assets.get('pacman', { size: 0.8 * maze.tile });
        scene.add(this.mesh);
        this.speed = 5;      // casillas por segundo
        this.boost = 1;
        this.teleport(PLAYER_START);

        bus.on(EVENTS.PLAYER_RESPAWN, (t) => this.teleport(t));
    }

    teleport({ col, row }) {
        this.tile = { col, row };
        this.target = null;
        this.dir = null;
        this.input.clearDirection();
        this.mesh.position.copy(this.maze.tileToWorld(col, row));
    }

    update(dt) {
        if (!this.target) {
            const want = this.input.getMoveDirection();
            const free = (d) => d && this.maze.isWalkable(this.tile.col + d.x, this.tile.row + d.z);
            // solo se mueve hacia la flecha presionada; sin tecla o con pared enfrente → quieto
            this.dir = free(want) ? want : null;
            if (this.dir) this.target = { col: this.tile.col + this.dir.x, row: this.tile.row + this.dir.z };
        }
        if (!this.target) return;

        const goal = this.maze.tileToWorld(this.target.col, this.target.row);
        const step = this.speed * this.boost * this.maze.tile * dt;
        const pos = this.mesh.position;
        if (pos.distanceTo(goal) <= step) {
            pos.copy(goal);
            this.tile = this.target;
            this.target = null;
            this.bus.emit(EVENTS.PLAYER_TILE, { ...this.tile });
        } else {
            pos.addScaledVector(goal.clone().sub(pos).normalize(), step);
        }
        if (this.dir) this.mesh.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    }
}

/** Simula lo que harán P2 (PowerManager) y P3 (fantasmas) + panel de texto. */
export class DebugTools {
    constructor({ bus, gameState, levelManager, player }) {
        Object.assign(this, { bus, gameState, levelManager, player });
        this.power = null;    // { power, left }
        this.msg = '';
        this.time = 0;

        this.panel = document.createElement('pre');
        Object.assign(this.panel.style, {
            position: 'fixed', top: '8px', left: '8px', margin: 0, padding: '8px 10px',
            font: '12px/1.4 monospace', color: '#fff', background: 'rgba(0,0,0,.6)',
            borderRadius: '6px', pointerEvents: 'none', zIndex: 10,
        });
        document.body.appendChild(this.panel);

        bus.on(EVENTS.LEVEL_TIME, ({ remaining }) => (this.time = remaining));
        bus.on(EVENTS.POWER_PICKED, ({ power, duration }) => {
            this.power = { power, left: duration };
            if (power === 'speed') player.boost = 1.8;
            this.msg = `¡Poder "${power}" por ${duration}s!`;
        });
        bus.on(EVENTS.FAKE_PICKED, () => (this.msg = 'Era un objeto FALSO 😈'));
        bus.on(EVENTS.HINT_PICKED, ({ text }) => (this.msg = `Pista: ${text}`));
        bus.on(EVENTS.ITEM_RESPAWNED, ({ col, row }) => (this.msg = `El objeto reapareció en (${col}, ${row})`));
        bus.on(EVENTS.KEY_SPAWNED, ({ col, row }) => {
            this.endPower();
            this.msg = `¡Apareció la llave en (${col}, ${row})!`;
        });
        bus.on(EVENTS.KEY_COLLECTED, ({ keys }) => keys && (this.msg = `Llave ${keys}/4`));
        bus.on(EVENTS.EXIT_OPENED, () => (this.msg = '¡La salida está abierta! Ve abajo al centro.'));
        bus.on(EVENTS.LIVES_CHANGED, ({ reason }) => reason && (this.msg = `Perdiste una vida (${reason})`));
        bus.on(EVENTS.LEVEL_START, () => this.endPower());

        window.addEventListener('keydown', (e) => {
            const level = levelManager.level;
            if (!level) return;
            if (e.code === 'KeyG') bus.emit(EVENTS.GHOST_DEFEATED, { ghost: level.ghost });
            if (e.code === 'KeyH') bus.emit(EVENTS.PLAYER_HIT, {});
            if (e.code === 'KeyX' && this.power) this.power.left = 0;
        });
    }

    endPower() {
        this.power = null;
        this.player.boost = 1;
    }

    update(dt) {
        if (this.power) {
            this.power.left -= dt;
            if (this.power.left <= 0) {
                const { power } = this.power;
                this.endPower();
                this.bus.emit(EVENTS.POWER_EXPIRED, { power });
            }
        }
        const lm = this.levelManager;
        const gs = this.gameState;
        this.panel.textContent = [
            gs.is('MENU') ? '>>> PRESIONA ENTER PARA EMPEZAR <<<\n' : '',
            `Estado: ${gs.current}`,
            `${lm.level?.name ?? '-'}   fantasma: ${lm.level?.ghost ?? '-'}  (fase: ${lm.phase ?? '-'})`,
            `Tiempo: ${this.time}s   Vidas: ${gs.lives}   Llaves: ${gs.keys}/4`,
            `Poder: ${this.power ? `${this.power.power} ${this.power.left.toFixed(1)}s` : '—'}`,
            `Casilla: (${this.player.tile.col}, ${this.player.tile.row})`,
            '',
            this.msg,
            '',
            'ENTER empezar · WASD/flechas mover · P pausa',
            'G vencer fantasma · H recibir golpe · X acabar poder',
        ].join('\n');
    }
}
