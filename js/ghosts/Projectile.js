/* P3 — Proyectil de Inky.
 * Viaja en línea recta por la grilla hasta chocar con pared, con Pac-Man o
 * agotar su alcance. El cristal protector lo bloquea (lo mira Collisions.js).
 *
 * Se mueve por casillas igual que los fantasmas, no en línea libre. Así nunca
 * se cuela por una esquina ni atraviesa media pared: si la casilla siguiente
 * no es pisable, el proyectil desaparece ahí.
 */
import * as THREE from 'three';

export const PROJECTILE = {
    speed: 7.0,     // casillas por segundo
    range: 12,      // casillas antes de desaparecer
    radius: 0.22,   // en casillas
    color: 0x33e6ff,
};

export class Projectile {
    /* -----------------------------------------------------------------
     * --------------------------- EL DISPARO --------------------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * Nace en la casilla de Inky con una dirección fija que ya no cambia. La
     * dirección se la da Inky.shoot(), que solo dispara si lineaDeVision()
     * dice que el pasillo está despejado.
     *
     * QUÉ USA
     * - Todas las medidas se multiplican por maze.tile para pasar de casillas
     *   a unidades del mundo 3D. Las constantes de PROJECTILE están en
     *   casillas para poder razonar sobre ellas sin saber el tamaño del
     *   laberinto.
     * - _ahead() calcula la casilla siguiente en la dirección del disparo y
     *   devuelve null si es pared. Ese null es la señal de "aquí se acaba".
     * - this._a y this._b son vectores de trabajo creados UNA vez. Se
     *   reutilizan en cada update() en vez de crear dos vectores por frame y
     *   por proyectil, que es basura que el recolector tendría que limpiar.
     * --------------------------------------------------------------- */

    constructor({ scene, maze, bus, origin, dir, owner = null }) {
        Object.assign(this, { scene, maze, bus, owner });
        this.dir = { ...dir };
        this.alive = true;
        this.travelled = 0;

        this.tile = { ...origin };
        this.nextTile = this._ahead();
        this.progress = 0;

        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(PROJECTILE.radius * maze.tile, 10, 10),
            new THREE.MeshStandardMaterial({
                color: PROJECTILE.color, emissive: PROJECTILE.color, emissiveIntensity: 0.8,
            }),
        );
        maze.tileToWorld(this.tile.col, this.tile.row, this.mesh.position);
        this.mesh.position.y = maze.tile * 0.5;
        scene.add(this.mesh);

        this._a = new THREE.Vector3();
        this._b = new THREE.Vector3();
    }

    _ahead() {
        const col = this.tile.col + this.dir.col;
        const row = this.tile.row + this.dir.row;
        return this.maze.isWalkable(col, row) ? { col, row } : null;
    }

    /* -----------------------------------------------------------------
     * -------------------------- EL MOVIMIENTO ------------------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * El mismo sistema que usan los fantasmas: this.progress va de 0 a 1
     * entre una casilla y la siguiente, y la posición real es la
     * interpolación entre las dos. Cuando progress pasa de 1, se avanza de
     * casilla. Muere por tres motivos: pared delante, agotar el alcance de 12
     * casillas, o que Collisions.js lo pare contra el escudo.
     *
     * QUÉ USA
     * - update(dt) lo llama Inky.updateProjectiles(), que a su vez se llama
     *   desde el updateSpecial() de Inky. O sea, los proyectiles no viven por
     *   su cuenta: si Inky muere, onDefeat() los borra.
     * - El bucle es un WHILE, no un if. A 7 casillas por segundo y con un dt
     *   grande (al volver de otra pestaña), el proyectil puede cruzar más de
     *   una casilla en un solo frame. Con un if se saltaría casillas y podría
     *   atravesar una pared.
     * - Los return dentro del while cortan el bucle Y el método a la vez: en
     *   cuanto se agota el alcance o aparece una pared, no hay que seguir
     *   calculando posiciones de algo que ya no existe.
     * - lerpVectors(a, b, progress) interpola entre los centros de las dos
     *   casillas. La altura se guarda antes y se restaura después, porque
     *   tileToWorld() devuelve siempre y = 0 (el piso).
     * --------------------------------------------------------------- */

    update(dt) {
        if (!this.alive) return;
        if (!this.nextTile) return this.dispose();

        this.progress += PROJECTILE.speed * dt;

        while (this.progress >= 1) {
            this.progress -= 1;
            this.tile = { ...this.nextTile };
            if (++this.travelled >= PROJECTILE.range) return this.dispose();
            this.nextTile = this._ahead();
            if (!this.nextTile) return this.dispose();
        }

        const a = this.maze.tileToWorld(this.tile.col, this.tile.row, this._a);
        const b = this.maze.tileToWorld(this.nextTile.col, this.nextTile.row, this._b);
        const y = this.mesh.position.y;
        this.mesh.position.lerpVectors(a, b, this.progress);
        this.mesh.position.y = y;
    }

    /* -----------------------------------------------------------------
     * --------------------- BLOQUEO Y DESTRUCCIÓN ---------------------
     * -----------------------------------------------------------------
     *
     * CÓMO FUNCIONA
     * blocked() es lo que pasa cuando el cristal protector lo para: igual que
     * morir, pero avisando por el bus para que el panel y el sonido puedan
     * reaccionar. Es lo que le da sentido al escudo del nivel 3.
     *
     * QUÉ USA
     * - blocked() lo llama Collisions.js, no este archivo: el proyectil no
     *   sabe dónde está Pac-Man ni qué poderes tiene.
     * - dispose() empieza comprobando this.alive para poder llamarlo dos
     *   veces sin romper nada. Pasa de verdad: el proyectil puede agotarse en
     *   el mismo frame en que choca.
     * - Aquí SÍ se liberan geometría y material porque son propios de cada
     *   proyectil, creados en el constructor. En los fantasmas no se hace,
     *   porque esos los comparte el AssetLoader entre todos.
     * --------------------------------------------------------------- */

    /** Lo llama Collisions.js cuando choca con el escudo */
    blocked() {
        this.bus.emit('projectile:blocked', {});
        this.dispose();
    }

    dispose() {
        if (!this.alive) return;
        this.alive = false;
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}