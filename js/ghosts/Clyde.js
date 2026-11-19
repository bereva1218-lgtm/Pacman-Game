/* P3 — Nivel 4: Clyde, el intercambio.
 *
 * Base: persigue SIEMPRE la casilla exacta de Pac-Man, sin modo dispersión, y
 *       aprieta cuanto más cerca está: a 10 casillas iguala su velocidad y a 5
 *       va 0.2 casillas/s más rápido. Además da giros bruscos.
 * Especial: cada 10 s intercambia su posición con la de Pac-Man.
 * Lo vence: SOLO las ondas de energía (por eso vulnerableA no tiene 'melee'),
 *       4 impactos antes de que se acabe el poder. Como tocarlo siempre quita
 *       vida, toca dispararle mientras se retrocede.
 *
 * Es el último nivel y el único donde no se puede ganar tocando al fantasma.
 * El nivel entero va de retroceder disparando sin dejar que te alcance.
 *
 * En nivel 5 (classic) sí usa la IA original: dispersión a 8 casillas o menos,
 * velocidad normal y sin ataque especial.
 */
import { Ghost, GHOST_STATE } from './Ghost.js';
import { GHOST_INFO } from '../config.js';
import { EVENTS } from '../config.js';

/** Mover a Pac-Man sin reiniciar el nivel (intercambio de Clyde).
 *  Si P1 lo añade a EVENTS en config.js, cambiar esta línea por EVENTS.PLAYER_TELEPORT. */
export const PLAYER_TELEPORT = EVENTS.PLAYER_TELEPORT ?? 'player:teleport';

export const CLYDE = {
    speed: 3.3,                 // velocidad normal, lejos de Pac-Man
    scatterRadiusClassic: 8,    // solo nivel 5: en el 4 no hay dispersión
    swapEvery: 10.0,
    sharpTurnChance: 0.25,
    warnTime: 0.7,

    // Velocidad según la distancia (solo nivel 4, no en el jefe final):
    matchRange: 10,             // a 10 casillas o menos: igual de rápido que Pac-Man
    closeRange: 5,              // a 5 o menos: 0.2 casillas/s más rápido que Pac-Man
    closeBonus: 0.2,
};

export class Clyde extends Ghost {
    constructor(opts) {
        super({
            name: 'clyde', color: GHOST_INFO.clyde.hex, speed: CLYDE.speed,
            vulnerableA: ['wave', 'superball'],
            ...opts,
        });
        // Esquina de dispersión (solo la usa el nivel 5): inferior izquierda
        this.scatterCorner = opts.scatterCorner
            ?? this.maze.randomFreeTile((t) => t.col <= 2 && t.row >= this.maze.rows - 3)
            ?? { col: 1, row: this.maze.rows - 2 };
        this.specialCd = CLYDE.swapEvery;
        this.warning = 0;
    }

    /* -----------------------------------------------------------------
     * --------------- VELOCIDAD SEGÚN LA DISTANCIA --------------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Cuanto más cerca está, más aprieta. Lejos va a su ritmo (3,3) y se
     * esquiva fácil; a 10 casillas iguala la velocidad de Pac-Man, así que ya
     * no se le deja atrás corriendo; a 5 va 0,2 más rápido y solo se escapa
     * usando los cruces. En el jefe final no aplica: ahí va a velocidad
     * normal, porque son cuatro a la vez y sería injugable.
     *
     * QUÉ USA
     * - get speed() SOBRESCRIBE el de Ghost.js. Lo lee Ghost.move() en cada
     *   frame para saber cuánto avanzar, así que el cambio de velocidad es
     *   inmediato, sin tener que avisar a nadie.
     * - playerSpeed lee player.speed y lo multiplica por player.boost, que es
     *   lo que sube cuando Pac-Man tiene la poción. Si P2 aún no expone
     *   speed, devuelve la velocidad base y Clyde se comporta como siempre:
     *   nunca se rompe, solo deja de acelerar.
     * - this.speedMul se respeta en los tres casos. Es lo que vale 0 cuando
     *   está aturdido, así que un Clyde aturdido no se mueve por mucho que
     *   Pac-Man esté a dos casillas.
     * --------------------------------------------------------------- */

    /** Velocidad de Pac-Man ahora mismo, contando su poder de velocidad si lo tiene */
    get playerSpeed() {
        const s = this.player.speed;
        if (typeof s !== 'number') return this.baseSpeed;   // P2 aún no la expone
        return s * (this.player.boost ?? 1);
    }

    /**
     * Cuanto más cerca está de Pac-Man, más le aprieta:
     *   más de 10 casillas → su velocidad normal
     *   10 o menos         → la misma que Pac-Man
     *   5 o menos          → 0.2 casillas/s más que Pac-Man
     * En el jefe final (classic) no aplica: ahí va a velocidad normal.
     */
    get speed() {
        if (this.classic) return this.baseSpeed * this.speedMul;

        const dist = this.distanceToPlayer();
        let base = this.baseSpeed;

        if (dist <= CLYDE.closeRange) base = this.playerSpeed + CLYDE.closeBonus;
        else if (dist <= CLYDE.matchRange) base = this.playerSpeed;

        return base * this.speedMul;
    }

    /* -----------------------------------------------------------------
     * -------- MOVIMIENTO BASE: PERSECUCIÓN SIN DESCANSO --------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Va siempre a por Pac-Man, sin modo dispersión. Lo que lo hace difícil
     * de predecir no es el objetivo sino el camino: en uno de cada cuatro
     * cruces se salta el BFS y toma una salida al azar. Así no se le puede
     * leer la ruta como a Blinky.
     *
     * QUÉ USA
     * - getTargetTile(): la rama de dispersión solo se ejecuta si
     *   this.classic, o sea en el nivel 5. En el 4 devuelve siempre la
     *   casilla de Pac-Man.
     * - pickNextTile() SOBRESCRIBE el de Ghost.js. Mira si la casilla actual
     *   es un cruce (más de 2 vecinos libres) y, con un 25% de probabilidad,
     *   elige vecino al azar en vez de llamar al BFS. Si no, delega en
     *   super.pickNextTile() y se comporta normal.
     * - Al desviarse hay que actualizar this.prevTile a mano, que es lo que
     *   el BFS usa para no devolverse sobre sus pasos; sin esa línea podría
     *   quedarse rebotando entre dos casillas.
     * --------------------------------------------------------------- */

    getTargetTile() {
        // La dispersión solo existe en el nivel 5, donde usa la IA del original
        if (this.classic && this.distanceToPlayer() <= CLYDE.scatterRadiusClassic) {
            this.state = GHOST_STATE.PATRULLAR;
            return this.scatterCorner;
        }
        // Nivel 4: persecución directa y sin descanso
        this.state = GHOST_STATE.PERSEGUIR;
        return this.playerTile;
    }

    /** Cambios bruscos de dirección: a veces ignora el BFS en un cruce */
    pickNextTile() {
        const vecinos = this.maze.neighbors(this.tile.col, this.tile.row);
        if (vecinos.length > 2 && Math.random() < CLYDE.sharpTurnChance) {
            this.prevTile = { ...this.tile };
            this.nextTile = vecinos[Math.floor(Math.random() * vecinos.length)];
            return;
        }
        super.pickNextTile();
    }

    onDamage() {
        this.warning = 0;
        this.specialCd = CLYDE.swapEvery;
    }

    /* -----------------------------------------------------------------
     * ------------- ATAQUE ESPECIAL: EL INTERCAMBIO -------------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Cada 10 s cambia de sitio con Pac-Man: él aparece donde estaba Clyde y
     * Clyde donde estaba él. No hace daño, pero rompe la ruta que llevabas y
     * te puede dejar lejos del objeto del nivel o en una zona peligrosa.
     * Avisa 0,7 s antes parpadeando, que es el margen para reaccionar.
     *
     * QUÉ USA
     * - updateSpecial(dt) lo llama Ghost.update() cada frame. Dos
     *   contadores: this.warning para el aviso y this.specialCd (el de
     *   Ghost) para la espera entre intercambios.
     * - swap() copia las dos casillas ANTES de mover nada. Si se moviera
     *   primero a Clyde, la segunda lectura ya estaría contaminada y los dos
     *   acabarían en el mismo sitio.
     * - placeAt() mueve a Clyde; a Pac-Man lo mueve el evento, porque este
     *   archivo no debe tocar el objeto de P2 directamente.
     * - PLAYER_TELEPORT es un evento propio, NO PLAYER_RESPAWN. Ese error ya
     *   nos pasó: PLAYER_RESPAWN significa "perdiste una vida" y lo escuchan
     *   LevelManager y GhostManager para devolver todo a su sitio, así que el
     *   intercambio se deshacía solo en el mismo frame. Ver el comentario de
     *   dentro del método.
     * --------------------------------------------------------------- */

    updateSpecial(dt) {
        if (this.warning > 0) {
            this.warning -= dt;
            if (this.warning <= 0) this.swap();
            return;
        }
        if (this.specialCd > 0) return;

        this.warning = CLYDE.warnTime;
        this.warn(CLYDE.warnTime);
        this.bus.emit('clyde:charge', { ghost: this.name });
    }

    swap() {
        const mine = { ...this.tile };
        const theirs = { ...this.playerTile };

        // Nunca intercambiar dos posiciones que ya coinciden: podría dejar a
        // Clyde encima de Pac-Man y matarlo nada más ejecutarse el intercambio.
        if (mine.col === theirs.col && mine.row === theirs.row) {
            const safeTile = this.maze.randomFreeTile((t) =>
                this.maze.distance(t, this.playerTile) >= 6
            ) ?? this.spawnTile;
            if (safeTile.col !== this.playerTile.col || safeTile.row !== this.playerTile.row) {
                this.placeAt(safeTile);
                this.specialCd = CLYDE.swapEvery;
                return;
            }
        }

        this.placeAt(theirs);

        /* OJO: NO se puede usar PLAYER_RESPAWN para mover a Pac-Man.
         * Ese evento significa "perdiste una vida / empieza el nivel" y lo
         * escuchan LevelManager y mi GhostManager para devolver todo a su
         * sitio, así que el intercambio se deshacía solo.
         * Pac-Man debe escuchar PLAYER_TELEPORT: mover sin reiniciar nada. */
        this.bus.emit(PLAYER_TELEPORT, { ...mine });
        this.bus.emit('clyde:swap', { ghostTo: theirs, playerTo: mine });

        this.specialCd = CLYDE.swapEvery;
    }
}