/* P3 — Nivel 3: Inky, el teletransporte.
 *
 * Base (el documento lo dejaba "por definir"): mantiene distancia. Si Pac-Man se
 *       acerca a menos de 5 casillas retrocede; si está a más de 9 se aproxima.
 *       Mientras tanto dispara proyectiles en línea recta.
 * Especial: cada 20 s aparece 5 casillas al frente de Pac-Man para cortarle el
 *       paso. Si esa casilla es pared, prueba la 4, 3, 2 y 1.
 * Lo vence: el cristal protector (aguanta el contacto y bloquea proyectiles), 3 impactos.
 *
 * Es el fantasma que invierte la regla del juego: hasta ahora había que huir, y
 * con él hay que ir hacia delante. Por eso mantiene distancia en vez de
 * perseguir, y por eso el escudo es el poder que toca.
 *
 * En nivel 5 (classic) usa la IA original: vector de Blinky a 2 casillas delante
 * de Pac-Man, duplicado.
 */
import { Ghost, GHOST_STATE } from './Ghost.js';
import { lineaDeVision } from './PathFinding.js';
import { Projectile } from './Projectile.js';

export const INKY = {
    speed: 3.1,
    teleportEvery: 20.0,
    teleportTiles: 5,
    safeDistance: 5,        // a menos de esto retrocede
    approachDistance: 9,    // a más de esto se acerca
    shootEvery: 3.5,
    shootRange: 12,
    warnTime: 0.6,
};

export class Inky extends Ghost {
    constructor(opts) {
        super({
            name: 'inky', color: 0x22ddff, speed: INKY.speed,
            vulnerableA: ['melee', 'superball'],
            ...opts,
        });
        this.blinky = opts.blinky ?? null;   // solo para la IA clásica del nivel 5
        this.projectiles = [];
        this.specialCd = INKY.teleportEvery;
        this.shootCd = INKY.shootEvery;
        this.fleeTarget = null;
        this.warning = 0;
    }

    /* -----------------------------------------------------------------
     * ------------- MOVIMIENTO BASE: MANTENER LA DISTANCIA ------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Tres zonas según lo lejos que esté Pac-Man. A menos de 5 casillas
     * retrocede, porque es un fantasma que dispara y no quiere pelea de
     * cerca. A más de 9 se acerca, para no perderse en la otra punta del
     * mapa. Entre medias se queda merodeando y disparando. El resultado es
     * que nunca se deja alcanzar sin el escudo.
     *
     * QUÉ USA
     * - getTargetTile() lo llama Ghost.pickNextTile() en cada casilla. Los
     *   tres if con return son las tres zonas; el orden importa, porque
     *   huir manda sobre todo lo demás.
     * - Al huir guarda el destino en this.fleeTarget y solo busca otro si ya
     *   llegó o si Pac-Man se le acercó demasiado al escondite. Sin esa
     *   variable sortearía una casilla distinta cada paso y temblaría en el
     *   sitio.
     * - this.fleeTarget = null en cuanto sale de la zona de huida: si no, al
     *   volver a acercarse seguiría yendo al escondite viejo.
     * --------------------------------------------------------------- */

    getTargetTile() {
        if (this.classic) return this.classicTarget();

        const dist = this.distanceToPlayer();

        if (dist < INKY.safeDistance) {          // demasiado cerca: huye
            this.state = GHOST_STATE.PATRULLAR;
            if (!this.fleeTarget ||
                this.maze.distance(this.tile, this.fleeTarget) <= 1 ||
                this.maze.distance(this.playerTile, this.fleeTarget) < INKY.safeDistance) {
                this.fleeTarget = this.randomTile();
            }
            return this.fleeTarget;
        }

        this.fleeTarget = null;

        if (dist > INKY.approachDistance) {      // demasiado lejos: se acerca
            this.state = GHOST_STATE.PERSEGUIR;
            return this.playerTile;
        }

        this.state = GHOST_STATE.PATRULLAR;      // en rango: merodea y dispara
        return this.tileAheadOfPlayer(INKY.safeDistance);
    }

    /* -----------------------------------------------------------------
     * ----------------- LA IA ORIGINAL (SOLO NIVEL 5) -----------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * El Inky del Pac-Man de 1980 es el único que mira a otro fantasma: se
     * toma la casilla 2 posiciones delante de Pac-Man, se traza el vector
     * desde Blinky hasta ella y se duplica. El efecto es que Inky y Blinky
     * trabajan en equipo para acorralar: cuanto más cerca esté Blinky, más
     * se cierra Inky por el otro lado.
     *
     * QUÉ USA
     * - classicTarget() solo se llama si this.classic es true, o sea en el
     *   nivel 5. En el 3 este método ni se toca.
     * - Duplicar el vector es la línea pivot.col * 2 - blinky.tile.col: es la
     *   forma corta de  pivot + (pivot - blinky).
     * - Math.max/Math.min recortan el resultado dentro del mapa, porque
     *   duplicar un vector puede dar coordenadas fuera del laberinto.
     * - Si la casilla resultante es pared, devuelve el pivote: un objetivo
     *   inalcanzable dejaría a Inky dando vueltas sin rumbo.
     * - this.blinky lo inyecta GhostManager al crear el nivel; si no está,
     *   Inky se conforma con apuntar 2 delante.
     * --------------------------------------------------------------- */

    /** Original: casilla 2 delante de Pac-Man, vector desde Blinky, duplicado */
    classicTarget() {
        const pivot = this.tileAheadOfPlayer(2);
        if (!this.blinky) return pivot;

        const col = Math.max(0, Math.min(this.maze.cols - 1, pivot.col * 2 - this.blinky.tile.col));
        const row = Math.max(0, Math.min(this.maze.rows - 1, pivot.row * 2 - this.blinky.tile.row));
        return this.maze.isWalkable(col, row) ? { col, row } : pivot;
    }

    /* -----------------------------------------------------------------
     * ------------- ATAQUE ESPECIAL: EL TELETRANSPORTE ----------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Dos cosas a la vez, cada una con su temporizador. Cada 3,5 s dispara un
     * proyectil, pero solo si tiene a Pac-Man en línea recta. Y cada 20 s
     * desaparece y reaparece 5 casillas por delante de él para cortarle el
     * paso: si Pac-Man sigue de frente se lo come. Antes de hacerlo parpadea
     * 0,6 s, que es el aviso.
     *
     * QUÉ USA
     * - updateSpecial(dt) lo llama Ghost.update() cada frame y lleva TRES
     *   contadores distintos: shootCd para el disparo, warning para el aviso
     *   y specialCd (el de Ghost) para el teletransporte. Están separados
     *   porque las dos cosas ocurren en paralelo.
     * - teleport() usa tileAheadOfPlayer(5), que ya resuelve el caso de que
     *   esa casilla sea pared probando la 4, 3, 2 y 1. Esa era una de las
     *   preguntas abiertas del documento.
     * - placeAt() es de Ghost.js: coloca el fantasma y recalcula su siguiente
     *   casilla. No vale con mover la posición a mano, porque el movimiento
     *   va por casillas y se quedaría interpolando desde el sitio viejo.
     * - shoot() depende de lineaDeVision(): si no hay pasillo despejado no
     *   dispara, así los proyectiles nunca salen contra una pared.
     * - updateProjectiles(dt) los mueve con un for...of y luego los limpia
     *   con filter() por p.alive. Quien mira si golpean a Pac-Man es
     *   Collisions.js, que los pide con GhostManager.projectiles.
     * - onDefeat() borra los proyectiles que quedaran volando: si no, seguirían
     *   en pantalla después de muerto.
     * --------------------------------------------------------------- */

    updateSpecial(dt) {
        this.updateProjectiles(dt);

        this.shootCd -= dt;
        if (this.shootCd <= 0) {
            this.shootCd = INKY.shootEvery;
            this.shoot();
        }

        if (this.warning > 0) {
            this.warning -= dt;
            if (this.warning <= 0) this.teleport();
            return;
        }
        if (this.specialCd > 0) return;

        this.warning = INKY.warnTime;
        this.warn(INKY.warnTime);
        this.bus.emit('inky:charge', { ghost: this.name });
    }

    teleport() {
        const target = this.tileAheadOfPlayer(INKY.teleportTiles);
        this.placeAt(target);
        this.specialCd = INKY.teleportEvery;
        this.bus.emit('inky:teleport', { col: target.col, row: target.row });
    }

    shoot() {
        const dir = lineaDeVision(this.maze, this.tile, this.playerTile, INKY.shootRange);
        if (!dir) return;

        this.projectiles.push(new Projectile({
            scene: this.scene, maze: this.maze, bus: this.bus,
            origin: this.tile, dir, owner: this,
        }));
        this.bus.emit('inky:shoot', {});
    }

    updateProjectiles(dt) {
        for (const p of this.projectiles) p.update(dt);
        this.projectiles = this.projectiles.filter((p) => p.alive);
    }

    onDefeat() {
        for (const p of this.projectiles) p.dispose();
        this.projectiles = [];
    }
}