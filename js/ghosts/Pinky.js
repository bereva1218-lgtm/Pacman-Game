/* P3 — Nivel 2: Pinky, los clones.
 *
 * Base: no va a la casilla de Pac-Man, apunta 4 casillas adelante de hacia donde
 *       mira, para cortarle el camino.
 * Especial: cada 7 s genera un clon, y cada clon también se duplica cada 7 s
 *       (hasta 8 clones en total). Con el tiempo hay menos caminos seguros.
 * Invisibilidad: Pinky y sus clones pierden el rastro y patrullan al azar.
 * La vence: acercarse invisible, 2 impactos. Al vencerla los clones desaparecen.
 *
 * Es el único fantasma cuya dificultad crece sola: cuanto más tardes, más
 * clones hay. Esa es la lección del nivel — no dar vueltas.
 *
 * CÓMO ESTÁ ORGANIZADO EL ARCHIVO
 *   1. Pinky: el movimiento que corta el paso y la clonación
 *   2. PinkyClone: la copia, al final
 */
import { Ghost, GHOST_STATE } from './Ghost.js';

export const PINKY = {
    speed: 3.6,             // más rápida que Blinky
    tilesAhead: 4,
    cloneEvery: 7.0,        // segundos entre duplicaciones (antes 15)
    maxClones: 8,           // tope TOTAL de clones, contando los de los clones
    cloneSpeed: 3.0,
};

export class Pinky extends Ghost {
    constructor(opts) {
        super({
            name: 'pinky', color: 0xff88cc, speed: PINKY.speed,
            vulnerableA: ['melee', 'superball'],
            ...opts,
        });
        this.clones = [];
        this.specialCd = PINKY.cloneEvery;
        this.patrolTarget = null;
    }

    /* -----------------------------------------------------------------
     * --------------- MOVIMIENTO BASE: CORTAR EL CAMINO ---------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * No persigue a Pac-Man: apunta 4 casillas por DELANTE de hacia donde
     * mira, así que intenta salirle al paso en vez de ir detrás. El efecto
     * es que parece adivinar hacia dónde vas. Con la estrella de
     * invisibilidad pierde el rastro: deja de apuntar y se pone a patrullar
     * casillas al azar, que es lo que permite acercarse y golpearla.
     *
     * QUÉ USA
     * - getTargetTile() lo llama Ghost.pickNextTile() en cada casilla.
     * - tileAheadOfPlayer(4) es de Ghost.js. Si esa casilla es pared prueba
     *   la 3, la 2 y la 1, así que nunca devuelve un objetivo imposible.
     * - powers.has('invisibility') consulta a PowerState.js, que escucha el
     *   bus. Pinky no sabe nada de cómo se recoge el poder.
     * - Al patrullar guarda el destino en this.patrolTarget y solo elige otro
     *   cuando llega. Sin esa variable sortearía una casilla distinta en cada
     *   paso y se quedaría temblando en el sitio.
     * --------------------------------------------------------------- */

    getTargetTile() {
        if (this.powers?.has('invisibility')) {
            this.state = GHOST_STATE.PATRULLAR;
            if (!this.patrolTarget ||
                (this.tile.col === this.patrolTarget.col && this.tile.row === this.patrolTarget.row)) {
                this.patrolTarget = this.randomTile();
            }
            return this.patrolTarget;
        }
        this.state = GHOST_STATE.PERSEGUIR;
        this.patrolTarget = null;
        return this.tileAheadOfPlayer(PINKY.tilesAhead);
    }

    /* -----------------------------------------------------------------
     * ----------------- ATAQUE ESPECIAL: LOS CLONES -------------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Cada 7 s aparece un clon en una casilla al azar lejos de Pac-Man. Los
     * clones también se duplican cada 7 s, así que crecen rápido (1, 2, 4…)
     * hasta un máximo de 8 en total. Los clones no se pueden golpear: solo cuenta la
     * Pinky original, y al vencerla desaparecen todos de golpe. Por eso son
     * más pequeños y semitransparentes, para que el jugador sepa a cuál
     * tiene que ir.
     *
     * QUÉ USA
     * - updateSpecial(dt) es muy corto porque el temporizador ya lo lleva
     *   Ghost.update(): descuenta this.specialCd cada frame y aquí solo se
     *   mira si llegó a cero. Recargarlo ANTES de crear el clon evita que se
     *   dispare otra vez si spawnClone() sale sin hacer nada.
     * - spawnClone(from) limpia primero la lista con un filter() por si algún
     *   clon murió, y corta si ya hay 8. Lo llaman tanto Pinky como sus
     *   clones (from = quien se duplica), pero la lista y el tope los lleva
     *   siempre la Pinky original, así no se descontrola.
     * - manager.addExtra(clone) mete el clon en la lista 'extras' de
     *   GhostManager, que es la de los fantasmas añadidos a mitad de nivel.
     *   Sin esa llamada el clon existiría en pantalla pero nadie lo
     *   actualizaría ni miraría sus choques.
     * - onDefeat() lo llama Ghost.defeat() al morir: recorre los clones con
     *   un for...of y los hace desaparecer.
     * --------------------------------------------------------------- */

    updateSpecial(dt) {
        if (this.specialCd > 0) return;
        this.specialCd = PINKY.cloneEvery;
        this.spawnClone();
    }

    /** @param from quién se duplica: la propia Pinky o uno de sus clones */
    spawnClone(from = this) {
        if (this.state === GHOST_STATE.DERROTADO) return;
        this.clones = this.clones.filter((c) => c.state !== GHOST_STATE.DERROTADO);
        if (this.clones.length >= PINKY.maxClones) return;

        const tile = from.randomTile();
        if (!tile) return;
        from.warn(0.4);

        const clone = new PinkyClone({
            scene: this.scene, maze: this.maze, player: this.player, bus: this.bus,
            assets: this.assets, powers: this.powers, manager: this.manager,
            spawnTile: tile, owner: this,
        });
        this.clones.push(clone);
        this.manager?.addExtra(clone);
        this.bus.emit('pinky:clone', { total: this.clones.length, col: tile.col, row: tile.row });
    }

    onDefeat() {
        for (const c of this.clones) c.vanish();
        this.clones = [];
    }

    onDamage() {
        for (const c of this.clones) c.vanish();
        this.clones = [];
        this.specialCd = PINKY.cloneEvery;
        this.patrolTarget = null;
    }
}

/* ---------------------------------------------------------------------
 * ------------------------- EL CLON DE PINKY --------------------------
 * ---------------------------------------------------------------------
 *
 * CÓMO FUNCIONA
 * Una copia de Pinky con tres diferencias que importan. Persigue DIRECTO en
 * vez de apuntar 4 adelante, para que las copias no calculen todas el mismo
 * objetivo y acaben amontonadas en una casilla. No se puede golpear, así que
 * el jugador no pierde el tiempo con el clon equivocado. Y se ve distinto:
 * más pequeño, semitransparente y sin barra de vida.
 *
 * QUÉ USA
 * - Hereda de Ghost igual que Pinky, pero pasa vulnerableA: [] — lista
 *   vacía. Eso hace que Ghost.takeHit() rechace cualquier tipo de daño.
 *   Collisions.js además comprueba isClone antes de intentar golpear.
 * - modelKey: 'pinky' para reutilizar el mismo modelo del AssetLoader; el
 *   nombre 'pinky_clone' es solo para distinguirlo en el registro de eventos.
 * - En el constructor toca el grupo y los materiales DESPUÉS del super(),
 *   que es quien los crea. Los materiales ya vienen clonados de Ghost.js, por
 *   eso se les puede bajar la opacidad sin afectar a la Pinky original.
 * - updateSpecial() hace que el clon también se duplique cada cloneEvery
 *   segundos, pero se lo pide a owner.spawnClone(this): Pinky lleva la
 *   cuenta y el tope de maxClones, si no se llenaría la pantalla en segundos.
 * - vanish() se llama desde Pinky.onDefeat(). Avisa a removeExtra() para
 *   salir de la lista de GhostManager antes de borrarse de la escena.
 * ------------------------------------------------------------------- */
export class PinkyClone extends Ghost {
    constructor(opts) {
        super({
            name: 'pinky_clone', modelKey: 'pinky', color: 0xff88cc,
            speed: PINKY.cloneSpeed, maxHits: 1, vulnerableA: [],
            ...opts,
        });
        this.owner = opts.owner;
        this.isClone = true;

        this.group.scale.setScalar(0.7);
        this.healthBar.visible = false;
        for (const m of this.materials) { m.transparent = true; m.opacity = 0.6; }

        // El clon recién nacido espera un ciclo completo antes de duplicarse
        this.specialCd = PINKY.cloneEvery;
    }

    getTargetTile() {
        if (this.powers?.has('invisibility')) {
            if (!this.patrolTarget ||
                (this.tile.col === this.patrolTarget.col && this.tile.row === this.patrolTarget.row)) {
                this.patrolTarget = this.randomTile();
            }
            return this.patrolTarget;
        }
        return this.playerTile;
    }

    /** Los clones también se duplican. Pinky lleva la cuenta y el tope. */
    updateSpecial() {
        if (this.specialCd > 0) return;
        this.specialCd = PINKY.cloneEvery;
        this.owner?.spawnClone(this);
    }

    vanish() {
        this.state = GHOST_STATE.DERROTADO;
        this.manager?.removeExtra(this);
        this.dispose();
    }
}