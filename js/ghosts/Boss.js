/* P3 — Nivel 5, etapa 2: el fantasma gigante.
 *
 * Cuando los cuatro fantasmas quedan encerrados en su spawn se fusionan, una
 * explosión destruye el laberinto y Pac-Man y el jefe quedan en un cuadrado
 * abierto. El jefe usa cuatro ataques, uno por cada fantasma, EN ESTE ORDEN:
 *
 *   1. Rebote               10 s  rebota por todo el mapa          → esquivarlo
 *   2. División             20 s  se divide en varios fantasmas    → escapar de las copias
 *   3. Lluvia de ectoplasma 30 s  cae ectoplasma mientras persigue → esquivar las dos cosas
 *   4. Piso que se cae      15 s  el piso cae por donde pasas      → no quedar encerrado
 *
 * Al terminar cada ataque aparece una súper bola. Recogerla le quita una vida
 * al jefe y empieza el siguiente ataque. Con la cuarta, Pac-Man se lo come y
 * termina el juego.
 *
 * CÓMO ESTÁ ORGANIZADO EL ARCHIVO
 *   1. Constantes de balance (BOSS) y lista de ataques (ATTACKS)
 *   2. La clase BossStage, con una sección por ataque en el mismo orden
 *   3. Al final, las tres clases auxiliares: Splinter, Ectoplasm y ArenaFloor
 *
 * DECISIONES QUE FALTABAN EN EL DOCUMENTO (están en BOSS, se cambian arriba):
 *   - Las súper bolas 1 a 3 SÍ le quitan vida (4 en total), para que se vea
 *     el avance en la barra. Si solo deben dar puntos, poner damagePerBall: 0.
 *   - El ataque 4 dura 15 s, como dice la tabla.
 *   - Al recibir un golpe Pac-Man no reinicia la etapa: sigue el ataque y solo
 *     pierde una vida (restartAttackOnHit: false para cambiarlo).
 *
 * En la arena no hay paredes, así que todo se mueve en línea recta: aquí no
 * hace falta BFS como en los niveles 1 a 4.
 */
import * as THREE from 'three';
import { EVENTS } from '../config.js';
import { PLAYER_TELEPORT } from './Clyde.js';

export const BOSS = {
    size: 2.6,                  // en casillas
    maxHits: 4,
    damagePerBall: 1,
    restartAttackOnHit: false,
    hurtInvuln: 1.5,

    explosionTime: 1.6,
    ballRadius: 0.45,

    bounceSpeed: 11.0,          // casillas por segundo al empezar (Pac-Man va a 5)
    bounceSpeedMax: 15.0,       // acelera hasta aquí al final del ataque
    bounceMinAngle: 25,         // grados mínimos respecto a los ejes: nunca rebota
    bounceMaxAngle: 65,         //   casi recto, así recorre todo el mapa en diagonal
    chaseSpeed: 2.6,
    rainChaseSpeed: 1.8,        // "pero más lento"
    floorChaseSpeed: 2.2,

    splinters: 8,
    splinterSpeed: 2.9,
    splinterSize: 0.9,
    splitRadius: 3.5,           // a qué distancia del jefe aparecen
    splinterScatter: 0.9,       // segundos saliendo hacia afuera antes de perseguir
    splinterScatterSpeed: 7.0,  // a qué velocidad se dispersan
    splinterSpeedVar: 0.45,     // variación de velocidad entre copias
    splinterSeparation: 2.2,    // a esta distancia (casillas) se empujan entre sí
    splinterSeparationForce: 1.6,

    rainEvery: 0.08,            // una gota nueva cada 0,08 s (antes 0,55)
    rainWarn: 0.9,
    rainFallTime: 0.32,         // lo que tarda en caer (antes 0,45)
    rainRadius: 0.8,
    rainPuddle: 1.2,

    floorFallDelay: 0.35,       // lo que tarda en caerse la casilla que dejaste
    floorShrinkStart: 1.5,      // s hasta que cae el primer anillo del borde
    floorShrinkEnd: 1.0,        // s antes del final en que cae el último anillo
    floorShrinkWarn: 1.2,       // s que parpadea en rojo un anillo antes de caer
    floorMinSize: 3,            // casillas desde el centro que NUNCA se caen
    contactRadius: 1.4,         // el jefe es grande
};

export const ATTACKS = [
    { id: 'rebote', nombre: 'Rebote', dur: 10 },
    { id: 'division', nombre: 'División', dur: 20 },
    { id: 'ectoplasma', nombre: 'Lluvia de ectoplasma', dur: 30 },
    { id: 'piso', nombre: 'Piso que se cae', dur: 15 },
];

/** Matriz de la arena: todo libre menos el borde. */
export function arenaMatrix(cols, rows) {
    return Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) =>
            (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) ? 1 : 0));
}

const KEY = (c, r) => c + ',' + r;

export class BossStage {
    /**
     * @param onReloadMaze opcional: (matrix) => void para redibujar el laberinto
     *        como arena. Si no se pasa, se oculta el laberinto y se usa el piso propio.
     */
    constructor({ scene, maze, player, bus, assets, onReloadMaze = null }) {
        Object.assign(this, { scene, maze, player, bus, assets, onReloadMaze });
        this.running = false;
        this.state = 'idle';
        this.attackIndex = -1;
        this.hits = 0;
        this.invuln = 0;
        this.t = 0;

        this.splinters = [];
        this.drops = [];
        this._pending = [];     // casillas de piso esperando caerse
        this.superBall = null;
    }

    get attack() { return ATTACKS[this.attackIndex] ?? null; }
    get alive() { return this.hits < BOSS.maxHits; }

    /* ---------------------------------------------------------------------
     * ------------------------ FASE 0: LA FUSIÓN --------------------------
     * ---------------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Los cuatro fantasmas ya están encerrados en su spawn. Una explosión
     * destruye el laberinto: todas las paredes interiores desaparecen y queda
     * un cuadrado abierto con el borde cerrado. El jefe aparece en el centro
     * creciendo y girando sobre sí mismo durante 1,6 s; al terminar arranca
     * solo el ataque 1. Pac-Man se coloca unas casillas más abajo para que no
     * nazca encima del jefe.
     *
     * QUÉ USA
     * - start() monta todo y deja state = 'explosion'.
     * - _buildArena() llama a arenaMatrix() y reemplaza maze.grid, así el resto
     *   del juego (movimiento, worldToTile) ya trabaja sobre la arena. Oculta
     *   maze.group y dibuja piso y borde propios (ArenaFloor + InstancedMesh).
     * - _buildBoss() crea el modelo y la barra de vida en un THREE.Sprite.
     * - _updateExplosion(dt) hace crecer el modelo con this.t / explosionTime
     *   y al llegar a 1 llama a _nextAttack().
     * ------------------------------------------------------------------- */

    start() {
        if (this.running) return;
        this.running = true;
        this.state = 'explosion';
        this.t = 0;

        this._buildArena();
        this._buildBoss();
        this.bus.emit('boss:etapa2', { ataques: ATTACKS.map((a) => a.nombre) });
    }

    _buildArena() {
        const matrix = arenaMatrix(this.maze.cols, this.maze.rows);

        // El laberinto desaparece: la lógica usa la matriz nueva
        this._prevGrid = this.maze.grid;
        this.maze.grid = matrix.map((r) => [...r]);
        if (this.onReloadMaze) this.onReloadMaze(matrix);
        else this.maze.group.visible = false;

        this.floor = new ArenaFloor(this.scene, this.maze);

        // Paredes del borde de la arena
        const g = new THREE.BoxGeometry(this.maze.tile, this.maze.tile * 1.2, this.maze.tile);
        const m = new THREE.MeshStandardMaterial({ color: 0x4b2b6a, roughness: 0.8 });
        const borde = [];
        for (let c = 0; c < this.maze.cols; c++) { borde.push([c, 0], [c, this.maze.rows - 1]); }
        for (let r = 1; r < this.maze.rows - 1; r++) { borde.push([0, r], [this.maze.cols - 1, r]); }
        this.walls = new THREE.InstancedMesh(g, m, borde.length);
        const mm = new THREE.Matrix4();
        borde.forEach(([c, r], i) => {
            const p = this.maze.tileToWorld(c, r);
            mm.makeTranslation(p.x, this.maze.tile * 0.5, p.z);
            this.walls.setMatrixAt(i, mm);
        });
        this.walls.instanceMatrix.needsUpdate = true;
        this.scene.add(this.walls);

        // Pac-Man al centro de la arena. Por evento, para no depender de que
        // Pacman.js tenga un teleport() con una firma concreta.
        const mid = {
            col: Math.floor(this.maze.cols / 2),
            row: Math.floor(this.maze.rows / 2) + 4,
        };
        this.bus.emit(PLAYER_TELEPORT, mid);
    }

    _buildBoss() {
        this.group = new THREE.Group();
        this.model = this.assets.get('blinky', { size: BOSS.size * this.maze.tile });
        this.model.traverse((o) => {
            if (!o.isMesh) return;
            o.material = o.material.clone();
            o.material.color?.setHex(0x8e44ff);
            o.material.emissive?.setHex(0x3a0d66);
        });
        this.group.add(this.model);

        const p = this.maze.tileToWorld(
            Math.floor(this.maze.cols / 2), Math.floor(this.maze.rows / 2) - 3);
        this.group.position.copy(p);
        this.scene.add(this.group);

        // Barra de vida
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 28;
        this._barCtx = canvas.getContext('2d');
        this._barTex = new THREE.CanvasTexture(canvas);
        this.bar = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this._barTex, depthTest: false, transparent: true,
        }));
        this.bar.scale.set(this.maze.tile * 3, this.maze.tile * 0.35, 1);
        this.bar.position.y = this.maze.tile * 2.2;
        this.group.add(this.bar);
        this._drawBar();

        this.vel = new THREE.Vector3();
    }

    _drawBar() {
        const ctx = this._barCtx;
        const w = 256, h = 28;
        const left = Math.max(0, BOSS.maxHits - this.hits) / BOSS.maxHits;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#b36bff'; ctx.fillRect(4, 4, (w - 8) * left, h - 8);
        ctx.fillStyle = 'rgba(0,0,0,.8)';
        for (let i = 1; i < BOSS.maxHits; i++) ctx.fillRect(4 + ((w - 8) / BOSS.maxHits) * i - 1, 4, 2, h - 8);
        this._barTex.needsUpdate = true;
    }

    _updateExplosion(dt) {
        const k = Math.min(1, this.t / BOSS.explosionTime);
        this.group.scale.setScalar(0.2 + 0.8 * k);
        this.group.rotation.y += dt * 10 * (1 - k);
        if (k >= 1) this._nextAttack();
    }

    /* ---------------------------------------------------------------------
     * ---------------------- EL BUCLE DE LA ETAPA -------------------------
     * ---------------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * La etapa tiene tres estados y va rotando entre ellos:
     *   'explosion' → 'attack' → 'superball' → 'attack' → ... → 'done'
     * Cada ataque dura lo que diga ATTACKS[i].dur. Al cumplirse ese tiempo
     * aparece la súper bola; al recogerla, el jefe pierde una vida y empieza
     * el siguiente ataque. Con las cuatro, se acaba.
     *
     * QUÉ USA
     * - update(dt) lo llama main.js (o ghostTest.js) una vez por frame, y
     *   reparte con un switch sobre this.state a _updateExplosion(),
     *   _updateAttack() o _updateSuperBall(). También descuenta this.invuln
     *   y acumula this.t, que es el cronómetro del estado actual.
     * - _nextAttack() sube attackIndex, limpia lo del ataque anterior con
     *   _clearAttack() y prepara el nuevo. Si ya no quedan ataques, _finish().
     * - _updateAttack(dt) elige qué hacer según this.attack.id y comprueba
     *   el final del ataque con  this.t >= a.dur.
     * ------------------------------------------------------------------- */

    update(dt) {
        if (!this.running) return;
        if (this.invuln > 0) this.invuln -= dt;
        this.t += dt;
        this.floor?.update(dt);

        switch (this.state) {
            case 'explosion': this._updateExplosion(dt); break;
            case 'attack': this._updateAttack(dt); break;
            case 'superball': this._updateSuperBall(dt); break;
        }
    }

    _nextAttack() {
        this.attackIndex++;
        if (this.attackIndex >= ATTACKS.length) { this._finish(); return; }

        this.state = 'attack';
        this.t = 0;
        this._clearAttack();

        const a = this.attack;
        if (a.id === 'rebote') {
            this.vel.set(Math.random() < 0.5 ? -1 : 1, 0, Math.random() < 0.5 ? -1 : 1);
            this._setBounceDir(BOSS.bounceSpeed);
        }
        if (a.id === 'division') this._spawnSplinters();
        if (a.id === 'piso') {
            // Cuántos anillos del borde se pueden tirar dejando el centro libre
            const half = Math.floor((Math.min(this.maze.cols, this.maze.rows) - 1) / 2);
            this._ringsMax = Math.max(0, half - BOSS.floorMinSize);
            const span = a.dur - BOSS.floorShrinkStart - BOSS.floorShrinkEnd;
            this._ringEvery = this._ringsMax > 1 ? span / (this._ringsMax - 1) : 0;
            this._ringNext = 1;
        }

        this.bus.emit('boss:ataque', {
            n: this.attackIndex + 1, id: a.id, nombre: a.nombre, duracion: a.dur,
        });
    }

    _updateAttack(dt) {
        const a = this.attack;
        const target = this.player.mesh.position;

        if (a.id === 'rebote') this._moveBounce(dt);
        else if (a.id === 'division') {
            // El jefe no se mueve: ES las copias mientras dura el ataque
            for (const s of this.splinters) s.update(dt, target, this.splinters);
        } else if (a.id === 'ectoplasma') {
            this._moveToward(target, dt, BOSS.rainChaseSpeed);
            this._updateRain(dt);
        } else if (a.id === 'piso') {
            this._moveToward(target, dt, BOSS.floorChaseSpeed);
            this._updateFallingFloor(dt);
        }

        this._checkContact();

        if (this.t >= a.dur) this._spawnSuperBall();
    }

    /* ---------------------------------------------------------------------
     * ----------------------------- ATAQUE 1 ------------------------------
     * ---------------------------- REBOTE, 10 s ---------------------------
     * ---------------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * El jefe sale disparado en una dirección al azar y rebota contra las
     * cuatro paredes de la arena, como una bola de billar. No persigue a
     * Pac-Man: va a lo suyo, empezando a 11 casillas por segundo y
     * acelerando hasta 15 al final (Pac-Man va a 5). En cada rebote sortea
     * un ángulo diagonal nuevo (entre 25° y 65°), así nunca se queda yendo
     * casi recto por una franja y termina pasando por todo el mapa.
     * Pac-Man solo tiene que aguantar los 10 s.
     *
     * QUÉ USA
     * - La dirección inicial se sortea en _nextAttack(), en la rama
     *   a.id === 'rebote': un ángulo al azar que se guarda en this.vel ya
     *   multiplicado por BOSS.bounceSpeed.
     * - _moveBounce(dt) es todo el ataque. NO hay bucle propio: se llama una
     *   vez por frame desde _updateAttack(). Suma this.vel * dt a la posición
     *   y, si se pasa de los límites de la arena, recorta la posición al
     *   borde e invierte el signo de esa componente de la velocidad
     *   (this.vel.x o this.vel.z). Recortar antes de invertir es lo que
     *   evita que se quede vibrando pegado a la pared si baja el framerate.
     * - El daño al tocar a Pac-Man no se mira aquí, sino en _checkContact(),
     *   que _updateAttack() llama para todos los ataques por igual.
     * ------------------------------------------------------------------- */

    _moveBounce(dt) {
        const p = this.group.position;
        p.addScaledVector(this.vel, dt);

        const min = this.maze.tile * 1.5;
        const maxX = this.maze.tile * (this.maze.cols - 1.5);
        const maxZ = this.maze.tile * (this.maze.rows - 1.5);
        let reboto = false;
        if (p.x < min) { p.x = min; this.vel.x = Math.abs(this.vel.x); reboto = true; }
        if (p.x > maxX) { p.x = maxX; this.vel.x = -Math.abs(this.vel.x); reboto = true; }
        if (p.z < min) { p.z = min; this.vel.z = Math.abs(this.vel.z); reboto = true; }
        if (p.z > maxZ) { p.z = maxZ; this.vel.z = -Math.abs(this.vel.z); reboto = true; }

        // En cada rebote: ángulo nuevo al azar (para que no repita siempre la
        // misma trayectoria y pase por todo el mapa) y un poco más rápido.
        if (reboto) {
            const k = Math.min(1, this.t / this.attack.dur);
            this._setBounceDir(BOSS.bounceSpeed + (BOSS.bounceSpeedMax - BOSS.bounceSpeed) * k);
        }

        this.group.rotation.y = Math.atan2(this.vel.x, this.vel.z);
    }

    /** Conserva el sentido (signos) de this.vel pero sortea un ángulo diagonal. */
    _setBounceDir(speedTiles) {
        const deg = BOSS.bounceMinAngle + Math.random() * (BOSS.bounceMaxAngle - BOSS.bounceMinAngle);
        const ang = deg * Math.PI / 180;
        const sx = Math.sign(this.vel.x) || 1;
        const sz = Math.sign(this.vel.z) || 1;
        this.vel.set(sx * Math.cos(ang), 0, sz * Math.sin(ang))
            .multiplyScalar(speedTiles * this.maze.tile);
    }

    /* ---------------------------------------------------------------------
     * ----------------------------- ATAQUE 2 ------------------------------
     * --------------------------- DIVISIÓN, 20 s --------------------------
     * ---------------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * El jefe se divide: el fantasma grande DESAPARECE y en su lugar quedan 8
     * copias pequeñas repartidas en círculo a su alrededor. Durante los
     * primeros 0,9 s las copias salen disparadas hacia afuera para abrirse por
     * el mapa, y a partir de ahí persiguen a Pac-Man en línea recta. Cada una
     * lleva una velocidad algo distinta y además se empujan entre ellas, así
     * que lo rodean por lados diferentes en vez de apilarse todas encima. Al
     * acabar el ataque se vuelven a juntar y el jefe reaparece en el punto
     * medio de donde quedaron.
     *
     * QUÉ USA
     * - _spawnSplinters() se llama UNA vez, desde _nextAttack(). Reparte las
     *   copias con un for de 0 a BOSS.splinters repartiendo el círculo
     *   (i / splinters) * 2π, más un giro al azar para que no salgan siempre
     *   igual. Ahí mismo pone this.group.visible = false: eso es lo que hace
     *   que el grande desaparezca.
     * - Cada frame, _updateAttack() recorre this.splinters con un for...of y
     *   llama a Splinter.update(dt, target, this.splinters) — pasándole la
     *   lista entera para que cada copia sepa de quién apartarse.
     * - La clase Splinter está al final del archivo. Su update() decide entre
     *   dispersarse o perseguir según su contador this.scatter, y suma el
     *   empuje de _separation(), que recorre las demás copias y acumula un
     *   vector de repulsión más fuerte cuanto más cerca estén.
     * - _clearAttack() calcula el centro de las copias, mueve ahí al jefe y
     *   vuelve a ponerlo visible.
     * ------------------------------------------------------------------- */

    _spawnSplinters() {
        const giro = Math.random() * Math.PI * 2;   // que no salgan siempre igual

        for (let i = 0; i < BOSS.splinters; i++) {
            const ang = giro + (i / BOSS.splinters) * Math.PI * 2;
            const outward = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
            const pos = this.group.position.clone()
                .addScaledVector(outward, this.maze.tile * BOSS.splitRadius);

            // Velocidad distinta por copia: así se abren en abanico al perseguir
            const k = (i / (BOSS.splinters - 1)) - 0.5;          // -0.5 .. 0.5
            const speed = BOSS.splinterSpeed + k * BOSS.splinterSpeedVar;

            this.splinters.push(
                new Splinter(this.scene, this.maze, pos, this.assets, { outward, speed }));
        }

        // Se dividió: el grande desaparece mientras duran las copias
        this.group.visible = false;
    }

    /* ---------------------------------------------------------------------
     * ----------------------------- ATAQUE 3 ------------------------------
     * -------------------- LLUVIA DE ECTOPLASMA, 30 s ---------------------
     * ---------------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Cae ectoplasma del cielo mientras el jefe persigue a Pac-Man, pero más
     * lento que en los otros ataques (1,8 casillas/s) para que se pueda
     * esquivar las dos cosas a la vez. Cada 0,08 s se elige una casilla libre
     * al azar: primero se marca con un círculo que parpadea en el piso durante
     * 0,9 s, después cae la gota, y en el frame del impacto hace daño si
     * Pac-Man está dentro del radio. Luego queda un charco que se desvanece.
     * El aviso previo es lo que hace que el ataque sea justo: nunca te cae
     * algo encima sin avisar.
     *
     * QUÉ USA
     * - _updateRain(dt) se llama una vez por frame desde _updateAttack().
     *   Lleva su propio temporizador, this._rainCd, que descuenta dt y al
     *   llegar a 0 crea un Ectoplasm en maze.randomFreeTile() y se recarga.
     * - Después recorre this.drops con un for...of. Ojo con esto: cada
     *   Ectoplasm.update(dt) DEVUELVE un booleano, true solo en el frame
     *   exacto del impacto. Si es true y _nearPos() dice que Pac-Man está
     *   dentro de BOSS.rainRadius, se llama a _hurtPlayer('ectoplasma').
     * - Al final, un filter() deja fuera las gotas con alive === false, que
     *   son las que ya se disolvieron.
     * - La clase Ectoplasm está al final del archivo. Es una máquina de
     *   estados de tres fases ('warn' → 'fall' → 'puddle') que avanza con su
     *   propio this.t.
     * ------------------------------------------------------------------- */

    _updateRain(dt) {
        this._rainCd = (this._rainCd ?? 0) - dt;
        if (this._rainCd <= 0) {
            this._rainCd = BOSS.rainEvery;
            const t = this.maze.randomFreeTile();
            if (t) this.drops.push(new Ectoplasm(this.scene, this.maze, t));
        }
        for (const d of this.drops) {
            const impacto = d.update(dt);
            if (impacto && this._nearPos(d.pos, BOSS.rainRadius)) this._hurtPlayer('ectoplasma');
        }
        this.drops = this.drops.filter((d) => d.alive);
    }

    /* ---------------------------------------------------------------------
     * ----------------------------- ATAQUE 4 ------------------------------
     * --------------- PISO QUE SE CAE (estilo TNT Run), 15 s --------------
     * ---------------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * El piso se cae por donde pasa Pac-Man y esa casilla ya no se puede
     * volver a pisar. Mientras tanto el jefe lo persigue. La casilla no se cae
     * en el momento de pisarla sino 0,35 s después de SALIR de ella, para que
     * dé tiempo a cruzarla. El peligro real no es el jefe: es encerrarse uno
     * mismo dando vueltas sobre lo que ya rompió. Además el mapa se va
     * haciendo más pequeño: cada poco tiempo el anillo exterior de casillas
     * parpadea en rojo 1,2 s y se cae entero, hasta dejar solo el centro.
     * Si Pac-Man sigue encima cuando cae, pierde una vida y vuelve a la
     * casilla libre más cercana. Al terminar el ataque el piso se restaura
     * entero.
     *
     * QUÉ USA
     * - _updateFallingFloor(dt), una vez por frame desde _updateAttack().
     *   Convierte la posición de Pac-Man a casilla con maze.worldToTile() y la
     *   compara con this._lastTile: si cambió, mete la casilla ANTERIOR en la
     *   cola this._pending con su cuenta atrás.
     * - Esa cola se recorre con dos for...of (uno descuenta dt, otro hace caer
     *   las que llegaron a 0) y se limpia con un filter(). Se usan
     *   temporizadores con dt a propósito, NO setTimeout: así respetan la
     *   pausa del juego y no siguen corriendo si se cierra la etapa.
     * - ArenaFloor.drop(col, row) es lo que hace caer la casilla. Está al
     *   final del archivo. Marca la instancia como 'falling' y llama a
     *   maze.setTile(col, row, 1), que es lo que impide volver a pisarla:
     *   el movimiento de Pac-Man pregunta por maze.isWalkable().
     * - ArenaFloor.update(dt) baja cada casilla que esté cayendo moviendo su
     *   matriz dentro del InstancedMesh; se llama desde update(), no desde
     *   aquí, porque deben seguir cayendo aunque el ataque ya haya acabado.
     * - ArenaFloor.restoreAll(), desde _clearAttack(), devuelve todas a su
     *   sitio y vuelve a marcarlas como pisables.
     * - _updateShrink() lleva el encogimiento. Los tiempos se calculan en
     *   _nextAttack(): cuántos anillos caben (_ringsMax, dejando floorMinSize
     *   casillas en el centro) y cada cuánto cae uno (_ringEvery) para que el
     *   último caiga justo antes del final. ArenaFloor guarda la "profundidad"
     *   de cada casilla (distancia al borde): el anillo n son las de depth n.
     * ------------------------------------------------------------------- */

    _updateFallingFloor(dt) {
        const t = this.maze.worldToTile(
            this.player.mesh.position.x, this.player.mesh.position.z);
        const k = KEY(t.col, t.row);

        // La casilla que acaba de dejar se cae un momento después
        if (this._lastTile && this._lastTile !== k) {
            const [c, r] = this._lastTile.split(',').map(Number);
            this._pending.push({ col: c, row: r, t: BOSS.floorFallDelay });
        }
        this._lastTile = k;

        // Temporizadores con dt, no con setTimeout: así respetan la pausa
        for (const p of this._pending) p.t -= dt;
        for (const p of this._pending) if (p.t <= 0) this.floor.drop(p.col, p.row);
        this._pending = this._pending.filter((p) => p.t > 0);

        this._updateShrink(t);
    }

    /** El mapa se encoge: cada cierto tiempo cae el anillo exterior entero. */
    _updateShrink(playerTile) {
        if (this._ringNext > this._ringsMax) return;

        const ring = this._ringNext;
        const dropAt = BOSS.floorShrinkStart + (ring - 1) * this._ringEvery;
        const left = dropAt - this.t;

        // Aviso: el anillo parpadea en rojo antes de caerse
        if (left <= BOSS.floorShrinkWarn) {
            this.floor.tintRing(ring, Math.sin(this.t * 20) > 0 ? 0xff3344 : null);
        }
        if (left > 0) return;

        this.floor.dropRing(ring);
        this._ringNext++;
        this.bus.emit('boss:anillo', { n: ring, total: this._ringsMax });

        // Si Pac-Man estaba encima del anillo, pierde una vida y vuelve dentro
        if (this.floor.depth(playerTile.col, playerTile.row) <= ring) {
            this._hurtPlayer('piso');
            const safe = this._nearestWalkable(playerTile);
            if (safe) {
                this.bus.emit(PLAYER_TELEPORT, safe);
                this._lastTile = KEY(safe.col, safe.row);
            }
        }
    }

    _nearestWalkable(from) {
        let best = null, bestD = Infinity;
        for (let row = 0; row < this.maze.rows; row++) {
            for (let col = 0; col < this.maze.cols; col++) {
                if (!this.maze.isWalkable(col, row)) continue;
                const d = Math.abs(col - from.col) + Math.abs(row - from.row);
                if (d < bestD) { bestD = d; best = { col, row }; }
            }
        }
        return best;
    }

    /* ---------------------------------------------------------------------
     * --------------------------- SÚPER BOLAS -----------------------------
     * ---------------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Al terminar cada ataque aparece una súper bola en una casilla libre, a
     * 4 o más casillas de Pac-Man para que haya que ir a buscarla. Mientras
     * está en el mapa el jefe sigue persiguiendo, pero a la mitad de velocidad,
     * para que la pausa entre ataques no sea un descanso total. Al recogerla,
     * el jefe pierde una vida y arranca el ataque siguiente. Con la cuarta se
     * lo come y termina el juego.
     *
     * QUÉ USA
     * - _spawnSuperBall(), desde _updateAttack() cuando se cumple el tiempo.
     *   Pone state = 'superball', reinicia this.t y llama a _clearAttack()
     *   para borrar copias, gotas y piso roto del ataque anterior.
     * - _updateSuperBall(dt), una vez por frame mientras dure ese estado. Hace
     *   flotar la bola con un Math.sin(this.t * 4) y comprueba la recogida con
     *   _nearPos(). No hay bucle: es una sola bola.
     * - _pickSuperBall() suma BOSS.damagePerBall a this.hits, redibuja la
     *   barra y decide: si ya no queda vida, _finish(); si no, _nextAttack().
     *   Ese if es lo que encadena los cuatro ataques en orden.
     * ------------------------------------------------------------------- */

    _spawnSuperBall() {
        this.state = 'superball';
        this.t = 0;
        this._clearAttack();

        let tile = this.maze.randomFreeTile(
            (x) => this.maze.distance(x, this.player.tile ?? x) >= 4);
        tile ??= this.maze.randomFreeTile();

        const geo = new THREE.SphereGeometry(BOSS.ballRadius * this.maze.tile, 16, 12);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xffee33, emissive: 0xffaa00, emissiveIntensity: 0.9,
        });
        this.superBall = new THREE.Mesh(geo, mat);
        this.maze.tileToWorld(tile.col, tile.row, this.superBall.position);
        this.superBall.position.y = this.maze.tile * 0.5;
        this.scene.add(this.superBall);

        this.bus.emit('boss:superbola', {
            n: this.attackIndex + 1, col: tile.col, row: tile.row,
            ultima: this.attackIndex === ATTACKS.length - 1,
        });
    }

    _updateSuperBall(dt) {
        const b = this.superBall;
        if (!b) return;
        b.rotation.y += dt * 3;
        b.position.y = this.maze.tile * (0.5 + Math.sin(this.t * 4) * 0.08);

        // El jefe sigue moviéndose despacio, para que no sea un descanso total
        this._moveToward(this.player.mesh.position, dt, BOSS.chaseSpeed * 0.5);
        this._checkContact();

        if (this._nearPos(b.position, 0.8)) this._pickSuperBall();
    }

    _pickSuperBall() {
        this.scene.remove(this.superBall);
        this.superBall.geometry.dispose();
        this.superBall.material.dispose();
        this.superBall = null;

        this.hits += BOSS.damagePerBall;
        this._drawBar();
        this.bus.emit('boss:golpe', { hits: this.hits, maxHits: BOSS.maxHits });

        if (!this.alive) this._finish();
        else this._nextAttack();
    }

    /* ---------------------------------------------------------------------
     * ------------------ MOVIMIENTO, CONTACTO Y DAÑO ----------------------
     * ---------------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Lo que comparten varios ataques. En la arena no hay paredes, así que
     * perseguir es ir en línea recta: no hace falta BFS como en los niveles
     * 1 a 4. El contacto se mira igual para todos los ataques, y Pac-Man tiene
     * 1,5 s de invulnerabilidad tras cada golpe para que no pierda las tres
     * vidas seguidas si se queda pegado al jefe.
     *
     * QUÉ USA
     * - _moveToward(target, dt, speed) lo usan los ataques 3 y 4 y la pausa de
     *   la súper bola. Resta posiciones, normaliza y avanza.
     * - _checkContact() lo llama _updateAttack() y _updateSuperBall(). Mira el
     *   jefe (solo si group.visible, por el ataque 2, donde no está) y recorre
     *   this.splinters con un for...of.
     * - _nearPos(pos, casillas) compara distancias al cuadrado, sin raíz, y
     *   convierte casillas a unidades de mundo multiplicando por maze.tile.
     * - _hurtPlayer() emite EVENTS.PLAYER_HIT: quien quita la vida de verdad
     *   es el LevelManager de P1, no este archivo.
     * ------------------------------------------------------------------- */

    _moveToward(target, dt, speedTiles) {
        const d = target.clone().sub(this.group.position).setY(0);
        if (d.lengthSq() < 1e-4) return;
        d.normalize();
        this.group.position.addScaledVector(d, speedTiles * this.maze.tile * dt);
        this.group.rotation.y = Math.atan2(d.x, d.z);
    }

    _checkContact() {
        if (this.group.visible &&
            this._nearPos(this.group.position, BOSS.contactRadius)) this._hurtPlayer('jefe');
        for (const s of this.splinters) {
            if (this._nearPos(s.mesh.position, 0.7)) this._hurtPlayer('copia');
        }
    }

    _nearPos(pos, tiles) {
        const r = tiles * this.maze.tile;
        const p = this.player.mesh.position;
        const dx = p.x - pos.x, dz = p.z - pos.z;
        return dx * dx + dz * dz <= r * r;
    }

    _hurtPlayer(origen) {
        if (this.invuln > 0) return;
        this.invuln = BOSS.hurtInvuln;
        this.bus.emit(EVENTS.PLAYER_HIT, { source: origen });
        if (BOSS.restartAttackOnHit) { this.t = 0; this._clearAttack(); }
    }

    /* ---------------------------------------------------------------------
     * ------------------------ LIMPIEZA Y FINAL ---------------------------
     * ---------------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * _clearAttack() deja la arena como nueva entre ataque y ataque: borra las
     * copias, las gotas y la cola del piso, y restaura las casillas caídas. Se
     * llama SIEMPRE al cambiar de ataque, así ningún ataque arrastra restos
     * del anterior. dispose() además devuelve el laberinto original: vuelve a
     * poner maze.grid como estaba y maze.group visible, porque la arena solo
     * existe mientras dura la etapa.
     *
     * QUÉ USA
     * - _clearAttack() desde _nextAttack(), _spawnSuperBall(), _finish() y
     *   dispose(). Recorre splinters y drops con for...of llamando al
     *   dispose() de cada uno, y llama a ArenaFloor.restoreAll().
     * - _finish() emite 'boss:victoria', que es lo que P1 tiene que escuchar
     *   para pasar a STATES.WIN.
     * - dispose() lo llama ghostTest.js al salir de la etapa o cambiar de
     *   nivel; libera geometrías y materiales propios, nunca los del
     *   AssetLoader, que son compartidos.
     * ------------------------------------------------------------------- */

    _clearAttack() {
        // Las copias se vuelven a juntar: el jefe reaparece donde quedaron
        if (this.splinters.length) {
            const centro = new THREE.Vector3();
            for (const s of this.splinters) centro.add(s.mesh.position);
            centro.divideScalar(this.splinters.length);
            this.group.position.set(centro.x, this.group.position.y, centro.z);
        }
        this.group.visible = true;

        for (const s of this.splinters) s.dispose();
        this.splinters = [];
        for (const d of this.drops) d.dispose();
        this.drops = [];
        this._lastTile = null;
        this._pending = [];
        this.floor?.restoreAll();
    }

    _finish() {
        this.state = 'done';
        this._clearAttack();
        this.group.visible = false;
        this.bus.emit('boss:derrotado', {});
        this.bus.emit('boss:victoria', {});
    }

    dispose() {
        this.running = false;
        this._clearAttack();
        if (this.superBall) {
            this.scene.remove(this.superBall);
            this.superBall.geometry.dispose();
            this.superBall.material.dispose();
            this.superBall = null;
        }
        this.floor?.dispose();
        if (this.walls) {
            this.scene.remove(this.walls);
            this.walls.geometry.dispose();
            this.walls.material.dispose();
        }
        if (this.group) this.scene.remove(this.group);
        this._barTex?.dispose();
        if (this._prevGrid) this.maze.grid = this._prevGrid;
        this.maze.group.visible = true;
    }
}

/* =====================================================================
 * ======================== CLASES AUXILIARES ==========================
 * =====================================================================
 * Van al final para que la clase BossStage se pueda leer de corrido, de
 * la fusión al ataque 4. Están declaradas después de usarse y no pasa
 * nada: los métodos que las instancian se ejecutan cuando el módulo ya
 * terminó de cargar.
 * ================================================================== */

/* ---------------------------------------------------------------------
 * -------------------- Splinter — del ATAQUE 2 ------------------------
 * ---------------------------------------------------------------------
 *
 * CÓMO FUNCIONA
 * Una de las copias pequeñas en las que se divide el jefe. Vive en dos
 * fases: primero sale disparada hacia afuera (this.scatter segundos) para
 * separarse de las demás, y después persigue a Pac-Man en línea recta
 * esquivando a las copias que tenga pegadas.
 *
 * QUÉ USA
 * - update(dt, target, others) la llama BossStage._updateAttack() una vez
 *   por frame. El if sobre this.scatter es lo que decide la fase.
 * - _separation(others) recorre las demás copias con un for...of y acumula
 *   un vector de repulsión: cuanto más cerca está la otra copia, más peso
 *   tiene, con el factor (1 - dist / r). Sin esto todas acaban apiladas
 *   sobre Pac-Man.
 * - _clampToArena() recorta la posición con Math.min/Math.max para que no
 *   se salgan por el borde mientras se dispersan.
 * ------------------------------------------------------------------- */
class Splinter {
    constructor(scene, maze, pos, assets, { outward, speed }) {
        this.maze = maze;
        this.alive = true;
        this.outward = outward;
        this.speed = speed;
        this.scatter = BOSS.splinterScatter;
        this.mesh = assets.get('blinky', { size: BOSS.splinterSize * maze.tile });
        this.mesh.position.copy(pos);
        this.mesh.traverse((o) => {
            if (!o.isMesh) return;
            o.material = o.material.clone();
            o.material.color?.setHex(0x9b59ff);
        });
        scene.add(this.mesh);
        this.scene = scene;
    }

    update(dt, target, others = []) {
        let dir, speed;

        if (this.scatter > 0) {
            this.scatter -= dt;
            dir = this.outward;
            speed = BOSS.splinterScatterSpeed;
        } else {
            dir = target.clone().sub(this.mesh.position).setY(0);
            if (dir.lengthSq() < 1e-4) return;
            dir.normalize();
            // Sin esto se apilan todas sobre Pac-Man y parecen una sola
            dir.add(this._separation(others)).normalize();
            speed = this.speed;
        }

        this.mesh.position.addScaledVector(dir, speed * this.maze.tile * dt);
        this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
        this._clampToArena();
    }

    /** Empuje para alejarse de las copias que tenga pegadas */
    _separation(others) {
        const push = new THREE.Vector3();
        const r = BOSS.splinterSeparation * this.maze.tile;

        for (const o of others) {
            if (o === this || !o.alive) continue;
            const d = this.mesh.position.clone().sub(o.mesh.position).setY(0);
            const dist = d.length();
            if (dist > r || dist < 1e-4) continue;
            // Cuanto más cerca, más fuerte el empujón
            push.addScaledVector(d.normalize(), (1 - dist / r));
        }
        return push.multiplyScalar(BOSS.splinterSeparationForce);
    }

    /** Que no se salgan de la arena mientras se dispersan */
    _clampToArena() {
        const p = this.mesh.position;
        const min = this.maze.tile * 1.2;
        p.x = Math.min(Math.max(p.x, min), this.maze.tile * (this.maze.cols - 1.2));
        p.z = Math.min(Math.max(p.z, min), this.maze.tile * (this.maze.rows - 1.2));
    }

    dispose() {
        this.alive = false;
        this.scene.remove(this.mesh);
    }
}

/* ---------------------------------------------------------------------
 * ------------------- Ectoplasm — del ATAQUE 3 ------------------------
 * ---------------------------------------------------------------------
 *
 * CÓMO FUNCIONA
 * Una gota de ectoplasma. Es una máquina de estados de tres fases que
 * avanzan con su propio cronómetro this.t:
 *   'warn'   0,9 s   círculo parpadeando en el piso, aún no hace daño
 *   'fall'   0,32 s  la gota baja desde 7 casillas de altura
 *   'puddle' 1,2 s   charco que se desvanece, tampoco hace daño
 * El daño ocurre en UN solo frame: el del cambio de 'fall' a 'puddle'.
 *
 * QUÉ USA
 * - update(dt) la llama BossStage._updateRain() una vez por frame y
 *   DEVUELVE true solo en el frame del impacto. Ese valor de retorno es lo
 *   que usa el jefe para decidir si hace daño; si se ignorara, la gota no
 *   haría nada.
 * - El parpadeo del aviso es un Math.sin(this.t * 18) sobre la opacidad, y
 *   la caída una interpolación lineal con k = this.t / rainFallTime.
 * - dispose() se llama sola al acabar el charco, y también desde
 *   BossStage._clearAttack() si el ataque termina antes.
 * ------------------------------------------------------------------- */
class Ectoplasm {
    constructor(scene, maze, tile) {
        this.maze = maze;
        this.scene = scene;
        this.alive = true;
        this.phase = 'warn';
        this.t = 0;

        const p = maze.tileToWorld(tile.col, tile.row);
        this.pos = p.clone();

        // Aviso en el piso
        this.warn = new THREE.Mesh(
            new THREE.CircleGeometry(BOSS.rainRadius * maze.tile, 16),
            new THREE.MeshBasicMaterial({ color: 0x66ff66, transparent: true, opacity: 0.35 }),
        );
        this.warn.rotation.x = -Math.PI / 2;
        this.warn.position.copy(p).setY(0.03);
        scene.add(this.warn);

        // La gota
        this.blob = new THREE.Mesh(
            new THREE.SphereGeometry(BOSS.rainRadius * maze.tile * 0.6, 12, 10),
            new THREE.MeshStandardMaterial({
                color: 0x66ff66, emissive: 0x33aa33, emissiveIntensity: 0.6,
            }),
        );
        this.blob.position.copy(p).setY(maze.tile * 7);
        this.blob.visible = false;
        scene.add(this.blob);
    }

    update(dt) {
        if (!this.alive) return false;
        this.t += dt;

        if (this.phase === 'warn') {
            this.warn.material.opacity = 0.2 + 0.25 * Math.sin(this.t * 18);
            if (this.t >= BOSS.rainWarn) {
                this.phase = 'fall';
                this.t = 0;
                this.blob.visible = true;
            }
            return false;
        }

        if (this.phase === 'fall') {
            const k = Math.min(1, this.t / BOSS.rainFallTime);
            this.blob.position.y = this.maze.tile * 7 * (1 - k);
            if (k >= 1) {
                this.phase = 'puddle';
                this.t = 0;
                this.blob.scale.set(1.4, 0.25, 1.4);
                return true;   // impacto: este frame hace daño
            }
            return false;
        }

        this.warn.material.opacity = Math.max(0, 0.35 * (1 - this.t / BOSS.rainPuddle));
        if (this.t >= BOSS.rainPuddle) this.dispose();
        return false;
    }

    dispose() {
        if (!this.alive) return;
        this.alive = false;
        this.scene.remove(this.warn, this.blob);
        this.warn.geometry.dispose(); this.warn.material.dispose();
        this.blob.geometry.dispose(); this.blob.material.dispose();
    }
}

/* ---------------------------------------------------------------------
 * ------------------ ArenaFloor — del ATAQUE 4 ------------------------
 * ---------------------------------------------------------------------
 *
 * CÓMO FUNCIONA
 * El piso de la arena dibujado casilla por casilla, para poder tirar cada
 * una por separado. Todas las casillas son UNA sola geometría repetida
 * (THREE.InstancedMesh), que es lo mismo que hace Maze.js con las paredes:
 * una sola llamada de dibujo para las 300 y pico casillas en vez de una
 * por casilla.
 *
 * QUÉ USA
 * - El constructor recorre maze.freeTiles() con un forEach y guarda cada
 *   casilla en this.tiles, un Map de "col,row" al índice que ocupa dentro
 *   del InstancedMesh. Ese Map es lo que permite luego buscar una casilla
 *   concreta en tiempo constante.
 * - drop(col, row) la marca como cayendo y llama a maze.setTile(col,row,1),
 *   que es lo que de verdad impide volver a pisarla.
 * - update(dt) recorre solo this.falling (no las 300) bajando su posición y
 *   reescribiendo su matriz con setMatrixAt. Hay que poner
 *   instanceMatrix.needsUpdate = true o no se ve nada moverse.
 * - restoreAll() recorre el Map entero con for...of y devuelve a su sitio
 *   las que estén caídas.
 * ------------------------------------------------------------------- */
class ArenaFloor {
    constructor(scene, maze) {
        this.maze = maze;
        this.scene = scene;
        this.tiles = new Map();   // "col,row" -> { index, y, falling }
        this.falling = [];

        const libres = maze.freeTiles();
        const geo = new THREE.BoxGeometry(maze.tile * 0.96, maze.tile * 0.2, maze.tile * 0.96);
        // Material blanco: el color real va por instancia (setColorAt), así se
        // puede pintar de rojo un anillo concreto antes de que se caiga.
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
        this.mesh = new THREE.InstancedMesh(geo, mat, libres.length);
        this.mesh.receiveShadow = true;

        this._m = new THREE.Matrix4();
        this._c = new THREE.Color();
        this.baseColor = 0x2b2b4a;
        libres.forEach((t, i) => {
            const p = maze.tileToWorld(t.col, t.row);
            this._m.makeTranslation(p.x, -maze.tile * 0.1, p.z);
            this.mesh.setMatrixAt(i, this._m);
            this.mesh.setColorAt(i, this._c.setHex(this.baseColor));
            this.tiles.set(KEY(t.col, t.row), {
                index: i, col: t.col, row: t.row, x: p.x, z: p.z, y: -maze.tile * 0.1,
                depth: this.depth(t.col, t.row),
            });
        });
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mesh.instanceColor.needsUpdate = true;
        scene.add(this.mesh);
    }

    /** Distancia al borde de la arena: el borde es 0, el primer anillo libre 1… */
    depth(col, row) {
        return Math.min(col, row, this.maze.cols - 1 - col, this.maze.rows - 1 - row);
    }

    drop(col, row) {
        const t = this.tiles.get(KEY(col, row));
        if (!t || t.falling) return false;
        t.falling = true;
        this.falling.push(t);
        this.maze.setTile?.(col, row, 1);   // deja de ser pisable
        return true;
    }

    /** Tira todas las casillas del anillo n (las que tienen depth === n). */
    dropRing(n) {
        this.tintRing(n, null);
        for (const t of this.tiles.values()) if (t.depth === n) this.drop(t.col, t.row);
    }

    /** Pinta el anillo n de un color (null = color normal). */
    tintRing(n, hex) {
        this._c.setHex(hex ?? this.baseColor);
        for (const t of this.tiles.values()) {
            if (t.depth === n && !t.falling) this.mesh.setColorAt(t.index, this._c);
        }
        this.mesh.instanceColor.needsUpdate = true;
    }

    restoreAll() {
        this._c.setHex(this.baseColor);
        for (const t of this.tiles.values()) {
            this.mesh.setColorAt(t.index, this._c);
            if (!t.falling) continue;
            t.falling = false;
            t.y = -this.maze.tile * 0.1;
            this._m.makeTranslation(t.x, t.y, t.z);
            this.mesh.setMatrixAt(t.index, this._m);
            this.maze.setTile?.(t.col, t.row, 0);
        }
        this.falling = [];
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mesh.instanceColor.needsUpdate = true;
    }

    update(dt) {
        if (this.falling.length === 0) return;
        for (const t of this.falling) {
            t.y -= this.maze.tile * 4 * dt;
            this._m.makeTranslation(t.x, t.y, t.z);
            this.mesh.setMatrixAt(t.index, this._m);
        }
        this.falling = this.falling.filter((t) => t.y > -this.maze.tile * 6);
        this.mesh.instanceMatrix.needsUpdate = true;
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}