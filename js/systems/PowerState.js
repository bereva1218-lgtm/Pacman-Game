/* P3 — PowerState: qué poder tiene Pac-Man activo en este momento.
 *
 * Escucha el bus en vez de preguntarle a P2, así los fantasmas funcionan igual
 * con el Pacman real que con el DebugPlayer.
 *
 *   powers.has('speed' | 'invisibility' | 'shield' | 'energy')
 */
import { EVENTS } from '../config.js';

export class PowerState {
    constructor(bus) {
        this.bus = bus;
        this.current = null;     // id del poder activo
        this.timeLeft = 0;

        bus.on(EVENTS.POWER_PICKED, ({ power, duration }) => {
            this.current = power;
            this.timeLeft = duration ?? 0;
            this.bus.emit('power:changed', { power });
        });
        bus.on(EVENTS.POWER_EXPIRED, () => this.clear());
        bus.on(EVENTS.LEVEL_START, () => this.clear());
        bus.on(EVENTS.PLAYER_RESPAWN, () => { /* el poder se mantiene al reaparecer */ });
    }

    has(power) { return this.current === power; }

    clear() {
        this.current = null;
        this.timeLeft = 0;
        this.bus.emit('power:changed', { power: null });
    }

    /** Solo para mostrar el tiempo restante; quien lo expira de verdad es P2 */
    update(dt) {
        if (this.current && this.timeLeft > 0) this.timeLeft = Math.max(0, this.timeLeft - dt);
    }
}
