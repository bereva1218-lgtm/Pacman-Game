/* P3 — GhostManager: crea el fantasma de cada nivel al recibir LEVEL_START.
 *
 * Es el único punto de contacto entre los fantasmas y el resto del juego. Ni
 * main.js ni LevelManager saben qué fantasma toca en cada nivel: se limitan a
 * emitir LEVEL_START y este archivo decide todo lo demás.
 *
 * Lee del nivel de P1 (levels.js):  level.ghost · level.ghostHits · level.ghostSpawn
 * Para el nivel 5 (jefe final) el nivel puede traer  level.ghosts: ['blinky', ...]
 * y entonces se crean los cuatro con la IA clásica, sin ataques especiales.
 *
 * CÓMO ESTÁ ORGANIZADO EL ARCHIVO
 *   1. Creación: qué fantasma sale, dónde y con cuánta vida
 *   2. El bucle y el fin de la etapa 1 del jefe
 *   3. Lo que consulta Collisions.js
 *   4. Limpieza
 *
 * En main.js:
 *   const ghosts = new GhostManager({ scene, maze, player, bus, assets, powers });
 *   // en el loop:
 *   ghosts.update(dt);
 */
import { EVENTS } from '../config.js';
import { Blinky } from './Blinky.js';
import { Pinky } from './Pinky.js';
import { Inky } from './Inky.js';
import { Clyde } from './Clyde.js';
import { GHOST_STATE } from './Ghost.js';

const CLASSES = { blinky: Blinky, pinky: Pinky, inky: Inky, clyde: Clyde };

export class GhostManager {
    constructor({ scene, maze, player, bus, assets, powers }) {
        Object.assign(this, { scene, maze, player, bus, assets, powers });
        this.ghosts = [];    // los del nivel
        this.extras = [];    // clones de Pinky y demás añadidos en caliente
        this.active = false;

        bus.on(EVENTS.LEVEL_START, (data) => this.onLevelStart(data));
        bus.on(EVENTS.PLAYER_RESPAWN, () => this.onPlayerRespawn());
    }

    /* -----------------------------------------------------------------
     * ------------------- CREAR EL FANTASMA DEL NIVEL -----------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Al empezar un nivel se borra lo que hubiera y se crea lo que pida el
     * nivel: uno solo en los niveles 1 a 4, o los cuatro en el jefe final.
     * La diferencia la marca que el nivel traiga 'ghosts' (lista) en vez de
     * 'ghost' (uno). Si trae lista, todos nacen en modo clásico: IA del
     * Pac-Man original, sin ataques especiales y de un solo impacto.
     *
     * QUÉ USA
     * - onLevelStart() se engancha a EVENTS.LEVEL_START en el constructor. Es
     *   el disparador de todo: nadie llama a este método a mano.
     * - El for...of sobre 'names' crea cada fantasma con spawn(), que busca
     *   la clase en el objeto CLASSES. Ese objeto es lo que evita tener un
     *   switch con cuatro ramas y lo que permite añadir un fantasma nuevo
     *   tocando una sola línea.
     * - Las dos líneas de Inky y Blinky del final no son opcionales: en el
     *   nivel 5, Inky calcula su objetivo a partir de la posición de Blinky,
     *   así que necesita la referencia. Si no, se queda con su IA de nivel 3.
     * - spawnTileFor() protege de un error real: los ghostSpawn de levels.js
     *   son del laberinto viejo, y en los mapas nuevos algunos caen dentro de
     *   una pared. Si eso pasa, ordena las casillas libres por distancia con
     *   un sort() y coge la más cercana, además de avisar por consola de qué
     *   nivel hay que corregir. Sin esto el fantasma nace encerrado y no se
     *   mueve nunca.
     * --------------------------------------------------------------- */

    onLevelStart({ level } = {}) {
        this.clear();
        if (!level) return;

        this.level = level;
        const names = level.ghosts ?? [level.ghost];
        const classic = !!level.ghosts;   // varios fantasmas = etapa clásica del jefe

        for (const name of names) {
            const ghost = this.spawn(name, {
                maxHits: level.ghosts ? 1 : (level.ghostHits ?? 1),
                spawnTile: this.spawnTileFor(name, level),
                classic,
            });
            if (ghost) this.ghosts.push(ghost);
        }

        // Inky clásico necesita a Blinky para calcular su objetivo
        const inky = this.get('inky');
        const blinky = this.get('blinky');
        if (inky && blinky) inky.blinky = blinky;

        this.active = true;
        this.bus.emit('ghosts:ready', { ghosts: this.ghosts.map((g) => g.name) });
    }

    spawnTileFor(name, level) {
        const pedido = level.ghostSpawns?.[name] ?? level.ghostSpawn ?? null;
        const isSafeSpawn = (t) =>
            !!t &&
            this.maze.isWalkable(t.col, t.row) &&
            this.maze.distance(t, this.player.tile) >= 6;

        if (!pedido) {
            return this.maze.randomFreeTile(isSafeSpawn)
                ?? this.maze.randomFreeTile((t) => this.maze.distance(t, this.player.tile) >= 1)
                ?? this.player.tile;
        }
        if (isSafeSpawn(pedido)) return pedido;

        // El spawn del nivel cayó en pared (p. ej. es de otro mapa): la más cercana
        const reason = this.maze.isWalkable(pedido.col, pedido.row)
            ? 'demasiado cerca de Pac-Man'
            : 'en una pared';
        console.warn(`[GhostManager] spawn de ${name} ${reason} (${pedido.col},${pedido.row}); ` +
            'se usa una casilla libre segura. Revisar ghostSpawn en levels.js.');
        const libres = this.maze.freeTiles();
        const seguras = libres.filter(isSafeSpawn);
        seguras.sort((a, b) => this.maze.distance(a, pedido) - this.maze.distance(b, pedido));
        return seguras[0]
            ?? this.maze.randomFreeTile((t) => this.maze.distance(t, this.player.tile) >= 1)
            ?? this.player.tile;
    }

    spawn(name, opts = {}) {
        const Clase = CLASSES[name];
        if (!Clase) {
            console.warn('[GhostManager] fantasma desconocido:', name);
            return null;
        }
        return new Clase({
            scene: this.scene, maze: this.maze, player: this.player, bus: this.bus,
            assets: this.assets, powers: this.powers, manager: this,
            ...opts,
        });
    }

    /* Los clones de Pinky aparecen a mitad de nivel, así que no pueden estar
     * en this.ghosts: esa lista es la de los fantasmas "de verdad", la que
     * mira checkStageOne() y la que devuelve get(). Van aparte en this.extras
     * y es la propia Pinky quien los añade y los quita. */
    addExtra(ghost) { this.extras.push(ghost); }
    removeExtra(ghost) { this.extras = this.extras.filter((g) => g !== ghost); }

    /* -----------------------------------------------------------------
     * ---------------------------- EL BUCLE ---------------------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Un frame de todos los fantasmas. Se actualizan los del nivel y los
     * extras (los clones), se tiran los que ya murieron y se comprueba si
     * terminó la etapa 1 del jefe.
     *
     * QUÉ USA
     * - update(dt) lo llama el bucle principal de main.js (o ghostTest.js).
     *   Si this.active es false no hace nada: así entre nivel y nivel no se
     *   mueve nadie sin haber hecho LEVEL_START.
     * - Dos for...of separados, uno por lista, y después un filter() que
     *   quita de extras a los clones derrotados. Se filtra DESPUÉS de
     *   actualizar y no durante, porque modificar un array mientras se
     *   recorre se salta elementos.
     * --------------------------------------------------------------- */

    update(dt) {
        if (!this.active) return;
        for (const g of this.ghosts) g.update(dt);
        for (const g of this.extras) g.update(dt);
        this.extras = this.extras.filter((g) => g.state !== GHOST_STATE.DERROTADO);
        this.checkStageOne();
    }

    /* -----------------------------------------------------------------
     * ------------------ FIN DE LA ETAPA 1 DEL JEFE -------------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * En el nivel 5 los fantasmas no se derrotan: se comen con su súper bola
     * y quedan ENCERRADOS en su punto de aparición (g.locked). Cuando los
     * cuatro están encerrados se fusionan y empieza la etapa 2.
     *
     * QUÉ USA
     * - checkStageOne() se llama al final de update(), o sea una vez por
     *   frame. Sale enseguida si no hay cuatro fantasmas, así que en los
     *   niveles 1 a 4 no cuesta nada.
     * - every((g) => g.locked) es la condición: TODOS encerrados, no basta
     *   con que lo esté el último que tocaste.
     * - this.stageOneDone evita que el evento se emita en cada frame a partir
     *   de ese momento, que es lo que pasaría sin la bandera. Se reinicia en
     *   clear(), al cargar otro nivel.
     * - Emite 'boss:fusion', que es lo que escucha ghostTest.js (o main.js)
     *   para crear el BossStage. Este archivo no sabe nada de la etapa 2.
     * --------------------------------------------------------------- */

    checkStageOne() {
        if (this.stageOneDone || this.ghosts.length < 4) return;
        if (!this.ghosts.every((g) => g.locked)) return;

        this.stageOneDone = true;
        this.bus.emit('boss:fusion', { ghosts: this.ghosts.map((g) => g.name) });
    }

    /* -----------------------------------------------------------------
     * --------------------- CUANDO REAPARECE PAC-MAN ------------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Si Pac-Man pierde una vida y reaparece con el fantasma encima, lo mata
     * otra vez al instante y se queda sin vidas en dos segundos. Por eso los
     * fantasmas vuelven a su casa y se les retrasa el ataque especial un par
     * de segundos: da tiempo a reaccionar. Los clones de Pinky desaparecen
     * del todo, que si no el nivel se vuelve imposible tras cada muerte.
     *
     * QUÉ USA
     * - Se engancha a EVENTS.PLAYER_RESPAWN en el constructor. OJO: ese
     *   evento significa "perdiste una vida" o "empieza el nivel", NO "muévete".
     *   Por eso el intercambio de Clyde usa un evento propio (PLAYER_TELEPORT):
     *   si usara este, el intercambio se desharía solo en el mismo frame.
     * - Math.max(g.specialCd, 2) respeta el cooldown si ya era mayor, en vez
     *   de regalarle tiempo extra al jugador.
     * --------------------------------------------------------------- */

    onPlayerRespawn() {
        for (const g of this.ghosts) {
            if (g.state === GHOST_STATE.DERROTADO || g.locked) continue;
            g.placeAt(g.spawnTile);
            g.specialCd = Math.max(g.specialCd, 2);
        }
        for (const g of this.extras) g.dispose();
        this.extras = [];
    }

    /* -----------------------------------------------------------------
     * ------------------- LO QUE CONSULTA COLLISIONS ------------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Collisions.js no guarda listas de fantasmas: las pide aquí en cada
     * frame. Así nunca trabaja con uno ya derrotado ni con un clon que acaba
     * de desaparecer, que es de donde salen los choques fantasma.
     *
     * QUÉ USA
     * - 'all' junta ghosts y extras con un spread y filtra los derrotados y
     *   los encerrados. Un fantasma encerrado sigue en escena pero no debe
     *   quitar vida al tocarlo.
     * - 'projectiles' usa flatMap() porque cada fantasma puede tener varios
     *   (solo Inky, de hecho) y hay que devolver una lista plana. El
     *   g.projectiles?. es necesario: los demás fantasmas ni siquiera tienen
     *   esa propiedad.
     * - Los dos son getters, no métodos: se escriben ghosts.all y
     *   ghosts.projectiles, y se recalculan cada vez que se leen.
     * --------------------------------------------------------------- */

    /** Fantasmas que pueden chocar con Pac-Man ahora mismo */
    get all() {
        return [...this.ghosts, ...this.extras]
            .filter((g) => g.state !== GHOST_STATE.DERROTADO && !g.locked);
    }

    /** Proyectiles activos en pantalla */
    get projectiles() {
        return this.ghosts.flatMap((g) => g.projectiles?.filter((p) => p.alive) ?? []);
    }

    get(name) { return this.ghosts.find((g) => g.name === name) ?? null; }

    /* -----------------------------------------------------------------
     * --------------------------- LIMPIEZA ----------------------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Borra todo lo del nivel anterior. Se llama al empezar cada nivel, antes
     * de crear nada, y desde la tecla 0 del banco de pruebas.
     *
     * QUÉ USA
     * - El dispose() de cada fantasma quita su grupo de la escena y libera la
     *   barra de vida y los materiales clonados. Las geometrías NO: esas son
     *   del AssetLoader y las comparten todos.
     * - Pone active en false y stageOneDone en false. Olvidar lo segundo
     *   haría que el jefe no se fusionara nunca en una segunda partida.
     * --------------------------------------------------------------- */

    clear() {
        for (const g of this.ghosts) g.dispose();
        for (const g of this.extras) g.dispose();
        this.ghosts = [];
        this.extras = [];
        this.active = false;
        this.stageOneDone = false;
    }
}