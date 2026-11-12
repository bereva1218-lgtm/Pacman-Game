/* P1 VALERIA — Puerta de salida.
 * Está cerrada (es pared) hasta tener las 4 llaves. Al abrirse se hunde en el piso
 * y la casilla pasa a ser libre. Pisar la casilla abierta = victoria.
 */
import * as THREE from 'three';

export class Exit {
    constructor(scene, maze, assets, tile) {
        this.maze = maze;
        this.tile = tile;
        this.isOpen = false; // cambia cuando se obtengan las 4 llaves 
        this.mesh = assets.get('door', { size: maze.tile * 1.2 });
        this.mesh.position.copy(maze.tileToWorld(tile.col, tile.row));
        scene.add(this.mesh);

        // luz que se enciende al abrir, para que el jugador vea adónde ir
        this.light = new THREE.PointLight(0x66ff66, 0, 6);
        this.light.position.copy(this.mesh.position).setY(1.5);
        scene.add(this.light);
    }

    open() {
        if (this.isOpen) return; // no abre pq inicialmente esta cerrada
        this.isOpen = true;
        this.maze.setTile(this.tile.col, this.tile.row, 0);
    }

    close() {
        this.isOpen = false;
        this.maze.setTile(this.tile.col, this.tile.row, 1);
        this.mesh.position.y = 0;
        this.light.intensity = 0;
    }

    isAt(col, row) {
        return this.isOpen && col === this.tile.col && row === this.tile.row;
    }

    update(dt) {
        if (!this.isOpen) return;
        // animación: bajar hasta desaparecer bajo el piso
        this.mesh.position.y = Math.max(-1.3, this.mesh.position.y - dt * 1.5);
        this.light.intensity = Math.min(8, this.light.intensity + dt * 8);
    }
}
