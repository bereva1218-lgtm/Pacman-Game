/* P1 VALERIA — Maze: construye el laberinto 
 *
 * Funciones que usan P2 y P3:
 *   maze.isWalkable(col, row)        ¿se puede pisar?
 *   maze.tileToWorld(col, row)       → THREE.Vector3 (centro de la casilla, y = 0)
 *   maze.worldToTile(x, z)           → { col, row }
 *   maze.neighbors(col, row)         → casillas libres vecinas (para PathFinding)
 *   maze.freeTiles()                 → todas las casillas libres
 *   maze.distance(a, b)              → distancia  entre { col, row }
 */
import * as THREE from 'three';
import { CONFIG } from '../config.js';

const DIRS4 = [
    { col: 1, row: 0 }, { col: -1, row: 0 }, { col: 0, row: 1 }, { col: 0, row: -1 },
];

export class Maze {
    /**
     * @param {THREE.Scene} scene
     * @param {number[][]} matrix  0 = libre, 1 = pared (wall), 2 = pared variante (wall2), 3 = pared variante (wall3), 4 = pared variante (wall4), 5 = pared variante (wall5)
     * @param {import('../core/AssetLoader.js').AssetLoader} assets
     * @param {{col:number,row:number}[]} skipTiles  paredes que NO se dibujan (p. ej. la puerta)
     */
    constructor(scene, matrix, assets, skipTiles = []) {
        this.scene = scene;
        this.grid = matrix.map((r) => [...r]); // copia: así podemos abrir la puerta sin tocar mazeData
        this.rows = this.grid.length;
        this.cols = this.grid[0].length;
        this.tile = CONFIG.TILE_SIZE;
        this.group = new THREE.Group();
        this.group.name = 'Maze';

        this._buildFloor();
        this._buildWalls(assets, skipTiles);
        scene.add(this.group);
    }

    // ------------------------------------------------------------ construcción

    _buildFloor() {
        const w = this.cols * this.tile, d = this.rows * this.tile;
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(w, d),
            new THREE.MeshStandardMaterial({ color: CONFIG.COLORS.FLOOR, roughness: 0.9 }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.copy(this.center());
        floor.receiveShadow = true;
        this.group.add(floor);
    }

    _buildWalls(assets, skipTiles) {
        const skip = new Set(skipTiles.map((t) => `${t.col},${t.row}`));
        const tiles = { 1: [], 2: [], 3: [], 4: [], 5: [] };
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const v = this.grid[row][col];
                if (tiles[v] && !skip.has(`${col},${row}`)) tiles[v].push({ col, row });
            }
        }

        // InstancedMesh: 1 sola geometría dibujada N veces → 1 draw call por tipo de pared
        // 1 = wall (this.walls), 2 = wall2 (this.walls2), 3 = wall3 (this.walls3), 4 = wall4 (this.walls4), 5 = wall5 (this.walls5)
        this.walls = this._buildWallMesh(assets, 'wall', tiles[1]);
        this.walls2 = this._buildWallMesh(assets, 'wall2', tiles[2]);
        this.walls3 = this._buildWallMesh(assets, 'wall3', tiles[3]);
        this.walls4 = this._buildWallMesh(assets, 'wall4', tiles[4]);
        this.walls5 = this._buildWallMesh(assets, 'wall5', tiles[5]);
    }

    _buildWallMesh(assets, key, wallTiles) {
        const { geometry, material } = assets.getInstancingData(key, this.tile);
        const mesh = new THREE.InstancedMesh(geometry, material, wallTiles.length);
        mesh.castShadow = mesh.receiveShadow = true;

        const m = new THREE.Matrix4();
        const scaleY = CONFIG.WALL_HEIGHT / this.tile;
        wallTiles.forEach((t, i) => {
            const p = this.tileToWorld(t.col, t.row);
            m.makeScale(1, scaleY, 1).setPosition(p.x, 0, p.z);
            mesh.setMatrixAt(i, m);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        this.group.add(mesh);
        return mesh;
    }

    // ------------------------------------------------------------ ayudas de grilla

    inBounds(col, row) {
        return row >= 0 && row < this.rows && col >= 0 && col < this.cols;
    }

    isWall(col, row) {
        return !this.inBounds(col, row) || this.grid[row][col] >= 1; // 1 = wall, 2 = wall2, 3 = wall3, 4 = wall4, 5 = wall5 (todas bloquean)
    }

    isWalkable(col, row) {
        return !this.isWall(col, row);
    }

    /** Cambia una casilla (lo usa Exit para abrir la puerta). */
    setTile(col, row, value) {
        if (this.inBounds(col, row)) this.grid[row][col] = value;
    }

    /** Centro de la casilla en coordenadas del mundo (y = 0, el piso). */
    tileToWorld(col, row, target = new THREE.Vector3()) {
        return target.set((col + 0.5) * this.tile, 0, (row + 0.5) * this.tile);
    }

    worldToTile(x, z) {
        return { col: Math.floor(x / this.tile), row: Math.floor(z / this.tile) };
    }

    neighbors(col, row) {
        return DIRS4
            .map((d) => ({ col: col + d.col, row: row + d.row }))
            .filter((t) => this.isWalkable(t.col, t.row));
    }

    freeTiles() {
        const out = [];
        for (let row = 0; row < this.rows; row++)
            for (let col = 0; col < this.cols; col++)
                if (this.grid[row][col] === 0) out.push({ col, row });
        return out;
    }

    distance(a, b) {
        return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
    }

    /** Casilla libre al azar; `filter` opcional para descartar algunas. */
    randomFreeTile(filter = () => true) {
        const options = this.freeTiles().filter(filter);
        return options[Math.floor(Math.random() * options.length)] ?? null;
    }

    /** Centro del laberinto en el mundo (para la cámara). */
    center() {
        return new THREE.Vector3((this.cols * this.tile) / 2, 0, (this.rows * this.tile) / 2);
    }
}
