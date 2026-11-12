/* P1 VALERIA — Input: teclado.
 *
 *  - WASD / flechas  → dirección (P2 la lee con input.getMoveDirection() en GridMover/Pacman)
 *  - Espacio         → emite EVENTS.INPUT_FIRE (P2: onda de energía)
 *  - P               → emite EVENTS.INPUT_PAUSE
 *  - Enter           → emite EVENTS.INPUT_START (empezar / reintentar)
 *
 * Movimiento: el personaje avanza SOLO mientras mantienes presionada una flecha.
 * Al soltarla termina la casilla en la que va y se detiene.
 */
import { EVENTS } from '../config.js';

const DIRS = {
    ArrowUp: { x: 0, z: -1, name: 'up' },
    KeyW: { x: 0, z: -1, name: 'up' },
    ArrowDown: { x: 0, z: 1, name: 'down' },
    KeyS: { x: 0, z: 1, name: 'down' },
    ArrowLeft: { x: -1, z: 0, name: 'left' },
    KeyA: { x: -1, z: 0, name: 'left' },
    ArrowRight: { x: 1, z: 0, name: 'right' },
    KeyD: { x: 1, z: 0, name: 'right' },
};

export class Input {
    constructor(bus) {
        this.bus = bus;
        this.down = new Set();      // teclas presionadas ahora mismo
        this.heldDirs = [];         // flechas que siguen presionadas, en el orden en que se presionaron
        this.tapDir = null;         // flecha tocada tan rápido que se soltó antes del siguiente frame

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        window.addEventListener('blur', () => {   // si cambias de ventana, se "sueltan" todas
            this.down.clear();
            this.heldDirs = [];
        });
    }

    _onKeyDown(e) {
        // que las flechas y el espacio no hagan scroll en la página
        if (DIRS[e.code] || e.code === 'Space') e.preventDefault();
        if (e.repeat) return; // ignorar autorepetición del teclado
        this.down.add(e.code);

        if (DIRS[e.code]) {
            this.tapDir = DIRS[e.code];
            this.heldDirs = this.heldDirs.filter((c) => c !== e.code);
            this.heldDirs.push(e.code);   // la última presionada queda al final
        }
        if (e.code === 'Space') this.bus.emit(EVENTS.INPUT_FIRE);
        if (e.code === 'KeyP' || e.code === 'Escape') this.bus.emit(EVENTS.INPUT_PAUSE);
        if (e.code === 'Enter') this.bus.emit(EVENTS.INPUT_START);
    }

    _onKeyUp(e) {
        this.down.delete(e.code);
        this.heldDirs = this.heldDirs.filter((c) => c !== e.code);
    }

    isDown(code) {
        return this.down.has(code);
    }

    /**
     * La función que debe llamar quien mueve al personaje (Pacman de Laura / DebugPlayer)
     * cada vez que llega al centro de una casilla.
     * Devuelve {x, z, name} de la flecha que sigues presionando (la más reciente si hay varias),
     * o null si no hay ninguna entonces el personaje se queda quieto.
     */
    getMoveDirection() {
        const code = this.heldDirs.at(-1);
        if (code) {
            this.tapDir = null;
            return DIRS[code];
        }
        // toque tan rápido que se soltó antes del siguiente frame: cuenta como 1 casilla
        const tap = this.tapDir;
        this.tapDir = null;
        return tap;
    }

    /** Olvida un toque pendiente */
    clearDirection() {
        this.tapDir = null;
    }

    dispose() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
    }
}
