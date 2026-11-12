/* P1 VALERIA — Objetos que se recogen en el laberinto.
 *   power → objeto real del nivel (da el poder)
 *   fake  → se ve como el real pero no hace nada
 *   hint  → muestra una pista
 *   key   → aparece al vencer al fantasma
 */

export const ITEM = Object.freeze({
    POWER: 'power',
    FAKE: 'fake',
    HINT: 'hint',
    KEY: 'key',
});

const SIZE = { power: 0.6, fake: 0.6, hint: 0.45, key: 0.7 };

export class Item {
    /**
     * @param {{type:string, col:number, row:number, modelKey:string, data?:object}} opts
     */
    constructor({ type, col, row, modelKey, data = {} }, scene, maze, assets) {
        this.type = type;
        this.col = col;
        this.row = row;
        this.data = data;
        this.scene = scene;

        this.mesh = assets.get(modelKey, { size: SIZE[type] * maze.tile });
        this.mesh.position.copy(maze.tileToWorld(col, row));
        this.baseY = 0.15;
        this.phase = Math.random() * Math.PI * 2; // para que no floten todos sincronizados
        scene.add(this.mesh);
    }

    isAt(col, row) {
        return this.col === col && this.row === row;
    }

    update(dt, time) {
        this.mesh.rotation.y += dt * (this.type === ITEM.KEY ? 2.5 : 1.5);
        this.mesh.position.y = this.baseY + Math.sin(time * 3 + this.phase) * 0.1;
    }

    dispose() {
        // No hacemos geometry.dispose(): las copias comparten geometría con el AssetLoader
        this.scene.remove(this.mesh);
    }
}
