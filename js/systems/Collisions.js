/* P3 — Collisions: choques Pac-Man/fantasma, proyectil/Pac-Man y onda/fantasma.
 *
 * El poder del nivel decide quién gana el contacto:
 *   1 Blinky — con poción de velocidad, tocarlo lo golpea
 *   2 Pinky  — invisible, tocarla la golpea (los clones nunca cuentan)
 *   3 Inky   — con escudo el contacto no quita vida y además lo golpea;
 *              el escudo también bloquea los proyectiles
 *   4 Clyde  — el contacto SIEMPRE quita vida; solo lo dañan las ondas
 *
 * Cuando Pac-Man recibe daño emite EVENTS.PLAYER_HIT → LevelManager quita la vida.
 *
 * waveSource: quien tenga las ondas de energía activas (P2 EnergyWave/PowerManager).
 *   Contrato: waveSource.activeWaves() -> [{ mesh.position, radius, alive }]
 */
import { EVENTS } from '../config.js';

export const HIT = {
    contactTiles: 0.7,      // distancia de contacto, en casillas
    projectileTiles: 0.55,
    waveTiles: 0.9,
    playerInvuln: 1.5,      // segundos de gracia tras recibir daño
};

export class Collisions {
    constructor({ player, ghosts, bus, powers, waveSource = null, maze }) {
        Object.assign(this, { player, ghosts, bus, powers, waveSource, maze });
        this.invuln = 0;

        bus.on(EVENTS.PLAYER_RESPAWN, () => { this.invuln = HIT.playerInvuln; });
    }

    update(dt) {
        if (this.invuln > 0) this.invuln -= dt;
        this.checkGhostContact();
        this.checkProjectiles();
        this.checkWaves();
    }

    // --------------------------------------------------- Pac-Man ↔ fantasma

    checkGhostContact() {
        for (const ghost of this.ghosts.all) {
            if (!this.near(this.player.mesh.position, ghost.position, HIT.contactTiles)) continue;
            this.resolveContact(ghost);
        }
    }

    resolveContact(ghost) {
        // Los clones son parte de la ilusión de Pinky: mientras la
        // invisibilidad está activa no pueden detectar ni hacer daño a Pac-Man.
        if (ghost.isClone && this.powers.has('invisibility')) return;

        // Nivel 5: la súper bola correcta lo encierra en su spawn
        if (this.powers.has('superball_' + ghost.name)) {
            ghost.lockInSpawn();
            return;
        }

        if (this.canMelee(ghost)) {
            ghost.takeHit('melee');
            return;
        }

        if (this.powers.has('shield')) {       // el cristal aguanta el golpe
            this.bus.emit('shield:blocked', { ghost: ghost.name });
            return;
        }

        this.hurtPlayer(ghost.name);
    }

    /** El poder del nivel es lo que habilita el golpe cuerpo a cuerpo */
    canMelee(ghost) {
        if (ghost.isClone) return false;
        if (!ghost.vulnerableA.includes('melee')) return false;   // Clyde nunca

        switch (ghost.name) {
            case 'blinky': return this.powers.has('speed');
            case 'pinky': return this.powers.has('invisibility');
            case 'inky': return this.powers.has('shield');
            default: return false;
        }
    }

    // ------------------------------------------------- proyectiles ↔ Pac-Man

    checkProjectiles() {
        for (const p of this.ghosts.projectiles) {
            if (!this.near(this.player.mesh.position, p.mesh.position, HIT.projectileTiles)) continue;

            if (this.powers.has('shield')) { p.blocked(); continue; }
            p.dispose();
            this.hurtPlayer('projectile');
        }
    }

    // ---------------------------------------------------- ondas ↔ fantasmas

    checkWaves() {
        const waves = this.waveSource?.activeWaves?.() ?? [];
        for (const wave of waves) {
            if (!wave.alive) continue;
            wave.hitGhosts ??= new Set();

            for (const ghost of this.ghosts.all) {
                if (wave.hitGhosts.has(ghost)) continue;
                const r = wave.radius ?? HIT.waveTiles;
                if (!this.near(wave.mesh.position, ghost.position, r)) continue;

                wave.hitGhosts.add(ghost);   // una onda golpea una sola vez a cada uno
                ghost.takeHit('wave');
            }
        }
    }

    // -------------------------------------------------------- daño a Pac-Man

    hurtPlayer(source) {
        if (this.invuln > 0) return;
        this.invuln = HIT.playerInvuln;
        this.bus.emit(EVENTS.PLAYER_HIT, { source });
    }

    /** Distancia en casillas convertida a unidades de mundo */
    near(a, b, tiles) {
        const r = tiles * this.maze.tile;
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        return dx * dx + dz * dz <= r * r;
    }
}
