/* P1 VALERIA — GameState:
 en qué "pantalla" está el juego y datos globales (vidas, llaves)

 *   gameState.is(STATES.PLAYING)
 *   gameState.set(STATES.PAUSED)   → emite EVENTS.STATE_CHANGED { from, to }
 */
import { EVENTS, CONFIG } from '../config.js';

export const STATES = Object.freeze({
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    LEVEL_COMPLETE: 'LEVEL_COMPLETE',
    GAME_OVER: 'GAME_OVER',
    WIN: 'WIN',
});

// Desde cada estado, a cuáles se puede pasar
const TRANSITIONS = {
    MENU: ['PLAYING'],
    PLAYING: ['PAUSED', 'LEVEL_COMPLETE', 'GAME_OVER', 'WIN', 'MENU'],
    PAUSED: ['PLAYING', 'MENU'],
    LEVEL_COMPLETE: ['PLAYING', 'MENU'],
    GAME_OVER: ['PLAYING', 'MENU'],
    WIN: ['PLAYING', 'MENU'],
};

export class GameState {
    constructor(bus) {
        this.bus = bus;
        this.current = STATES.MENU;
        this.reset();
    }

    /** Datos de una partida nueva, reinicia con las vidas originales, cero llaves y nivel 1 */
    reset() {
        this.lives = CONFIG.START_LIVES;
        this.keys = 0;
        this.levelIndex = 0;
    }

    // indica en que nivel esta el juego en ese momento, por eso current es ====  el parametro state
    is(state) {
        return this.current === state;
    }

    set(next) {
        if (next === this.current) return true;
        if (!TRANSITIONS[this.current].includes(next)) { // si no se deja pasar de ese escenario a otro, lanza aviso y no deja
            console.warn(`[GameState] Transición no permitida: ${this.current} → ${next}`);
            return false;
        }
        const from = this.current; // from es el estado actual, next es el estado al que se quiere pasar
        this.current = next;
        this.bus.emit(EVENTS.STATE_CHANGED, { from, to: next }); // le envia a todos los que escuchan el evento que cambio de estado
        return true;
    }

    togglePause() {
        if (this.is(STATES.PLAYING)) this.set(STATES.PAUSED);
        else if (this.is(STATES.PAUSED)) this.set(STATES.PLAYING);
    }
}
