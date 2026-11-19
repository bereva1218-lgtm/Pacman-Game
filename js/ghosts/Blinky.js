/* P3 — Nivel 1: Blinky, la embestida.
 *
 * Base: persigue la casilla exacta de Pac-Man.
 * Especial: si quedan en la misma fila o columna sin paredes en medio, se lanza
 *           en línea recta a mucha más velocidad. Se esquiva doblando una esquina.
 * Lo vence: la poción de velocidad, 1 impacto.
 *
 * Es el fantasma más simple a propósito: es el primero que ve el jugador y lo
 * que tiene que aprender aquí es "no te quedes alineado con él en un pasillo".
 */
import { Ghost, GHOST_STATE } from './Ghost.js';
import { lineaDeVision } from './PathFinding.js';

export const BLINKY = {
    speed: 4.2,             // casillas/s persiguiendo (antes 3.4; Pac-Man va a 5)
    dashCooldown: 4.0,      // espera entre embestidas
    visionRange: 10,        // hasta dónde ve por el pasillo
    dashSpeedMul: 4.5,      // velocidad de la embestida = speed × esto (antes 3)
    dashMaxTime: 2.0,
    warnTime: 0.5,          // aviso antes de salir disparado
};

export class Blinky extends Ghost {
    constructor(opts) {
        super({
            name: 'blinky', color: 0xff2222, speed: BLINKY.speed,
            vulnerableA: ['melee', 'superball'],
            ...opts,
        });
        this.dashing = false;
        this.charging = 0;
        this.dashTime = 0;
        this.pendingDir = null;
    }

    /* -----------------------------------------------------------------
     * -------------- MOVIMIENTO BASE: PERSECUCIÓN DIRECTA -------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Va siempre a la casilla exacta donde está Pac-Man, sin trucos. Es el
     * mismo comportamiento que el Blinky del juego original.
     *
     * QUÉ USA
     * - getTargetTile() lo llama Ghost.pickNextTile() cada vez que el
     *   fantasma llega al centro de una casilla, NO cada frame. Devuelve a
     *   dónde quiere ir, y el BFS de PathFinding.js decide el camino.
     * - this.playerTile es un getter de Ghost.js que lee player.tile.
     * --------------------------------------------------------------- */

    getTargetTile() {
        this.state = GHOST_STATE.PERSEGUIR;
        return this.playerTile;
    }

    /* -----------------------------------------------------------------
     * ------------------ ATAQUE ESPECIAL: LA EMBESTIDA ----------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Tiene tres fases encadenadas. Primero busca a Pac-Man en línea recta:
     * si están en la misma fila o columna y no hay pared en medio, se FRENA
     * medio segundo y parpadea — ese es el aviso, sin él la embestida se
     * siente injusta. Después sale disparado a 4,5 veces su velocidad en línea
     * recta, sin seguir el BFS. La embestida termina al chocar con una pared
     * o a los 2 s, y entonces empieza una espera de 4 s antes de repetirla.
     * Se esquiva doblando una esquina: en cuanto deja de haber línea recta,
     * el fantasma pasa de largo.
     *
     * QUÉ USA
     * - updateSpecial(dt) lo llama Ghost.update() una vez por frame. Los tres
     *   bloques if con return son las tres fases: cargando, embistiendo, o
     *   buscando objetivo. Nunca se ejecutan dos a la vez.
     * - lineaDeVision() de PathFinding.js es quien decide si hay embestida:
     *   devuelve la dirección unitaria si el pasillo está despejado, o null.
     * - this.forcedDir es la clave del ataque: mientras tenga valor,
     *   Ghost.pickNextTile() ignora el BFS y sigue recto. Ponerlo a null
     *   devuelve el control a la persecución normal.
     * - this.speedMul lo multiplica Ghost.speed. Vale 0.2 mientras carga (por
     *   eso se frena) y 4,5 durante la embestida.
     * - onForcedDirBlocked() lo llama Ghost.pickNextTile() cuando la línea
     *   recta choca con una pared; aquí se aprovecha para cortar el ataque.
     * - stun() está sobrescrito para cancelar la embestida: si le pegan
     *   mientras corre, no puede seguir deslizándose aturdido.
     * --------------------------------------------------------------- */

    updateSpecial(dt) {
        // Se frena un momento antes de embestir (el aviso que pedía el documento)
        if (this.charging > 0) {
            this.charging -= dt;
            this.speedMul = 0.2;
            if (this.charging <= 0) this.startDash();
            return;
        }

        if (this.dashing) {
            this.dashTime += dt;
            if (this.dashTime >= BLINKY.dashMaxTime) this.endDash();
            return;
        }

        if (this.specialCd > 0) return;

        const dir = lineaDeVision(this.maze, this.tile, this.playerTile, BLINKY.visionRange);
        if (dir) {
            this.pendingDir = dir;
            this.charging = BLINKY.warnTime;
            this.warn(BLINKY.warnTime);
            this.bus.emit('blinky:charge', { ghost: this.name });
        }
    }

    startDash() {
        this.dashing = true;
        this.dashTime = 0;
        this.forcedDir = this.pendingDir;
        this.speedMul = BLINKY.dashSpeedMul;
        this.bus.emit('blinky:dash', { ghost: this.name });
    }

    endDash() {
        if (!this.dashing && this.charging <= 0) return;
        this.dashing = false;
        this.charging = 0;
        this.forcedDir = null;
        this.pendingDir = null;
        this.speedMul = 1;
        this.specialCd = BLINKY.dashCooldown;
        this.bus.emit('blinky:dashEnd', { ghost: this.name });
    }

    /** Chocó con una pared: ahí termina la embestida */
    onForcedDirBlocked() { this.endDash(); }

    onDamage() {
        this.endDash();
        this.specialCd = BLINKY.dashCooldown;
    }

    stun(seconds) {
        this.endDash();
        super.stun(seconds);
    }
}