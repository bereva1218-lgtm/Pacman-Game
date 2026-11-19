/*p2 LAURA*/
// js/ui/HUD.js
// HUD de "Pac-Man – The Four Keys" (temática: mansión embrujada).
// Capa HTML encima del canvas de Three.js. Se actualiza solo escuchando el bus.
// Las vidas son velas: al perder una, la llama se apaga.
//
// En main.js (recibe el mismo ctx):
//   const hud = new HUD(ctx);
//   systems.push(hud);   // así la barra de poder y las pistas solo corren en PLAYING

// js/ui/HUD.js
// HUD de "Pac-Man – The Four Keys" (temática: mansión embrujada).
// Capa HTML encima del canvas de Three.js. Se actualiza solo escuchando el bus.
// Los estilos están en style.css (sección 4, clases .hud-*).
// Las vidas son velas: al perder una, la llama se apaga.
//
// En main.js (recibe el mismo ctx):
//   const hud = new HUD(ctx);
//   systems.push(hud);   // así la barra de poder y las pistas solo corren en PLAYING

import { EVENTS } from '../config.js';
import { STATES } from '../core/GameState.js';
import { LEVELS } from '../levels/levels.js';

/** Un color por llave / nivel (también lo usa Screens.js). */
export const KEY_COLORS = ['#ff4d5e', '#ff9be6', '#5ee0ff', '#ffb347']; // blinky, pinky, inky, clyde

export const KEY_SVG = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <circle cx="7" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="3"/>
  <path d="M11 10.5H22V13.5H20V17H17.5V13.5H16V16H13.5V13.5H11Z" fill="currentColor"/>
</svg>`;

const HINT_DURATION = 5; // segundos que se ve una pista

export class HUD {
  /**
   * @param {Object} o
   * @param {Object} o.bus        bus de eventos del juego
   * @param {Object} [o.gameState] para pausar la barra de poder fuera de PLAYING
   * @param {HTMLElement} [o.container=document.body]
   */
  constructor({ bus, gameState = null, container = document.body } = {}) {
    this.bus = bus;
    this.gameState = gameState;
    this.totalKeys = LEVELS.length;

    this.lives = 0;
    this.keys = 0;
    this.level = null;
    this.phase = 'search'; // 'search' → 'fight' → 'key' → 'escape'
    this.power = { active: false, remaining: 0, total: 0 };
    this.hintTimer = 0;

    this._build(container);
    this._listen();
  }

  // ───────────────────────── API pública ─────────────────────────

  /** Llamar en cada frame (dt en segundos). */
  update(dt) {
    if (this.gameState && !this.gameState.is(STATES.PLAYING)) return;

    if (this.power.active) {
      this.power.remaining -= dt;
      if (this.power.remaining <= 0) this.stopPower();
      else this._renderPower();
    }

    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.el.hint.classList.remove('hud-hint--show');
    }
  }

  show() { this.root.classList.remove('hud--hidden'); }
  hide() { this.root.classList.add('hud--hidden'); }

  /** Texto pequeño que sube y se desvanece. */
  notify(text, color = '#4dffb8') {
    const n = document.createElement('div');
    n.className = 'hud-notify';
    n.textContent = text;
    n.style.color = color;
    this.root.appendChild(n);
    n.addEventListener('animationend', () => n.remove());
  }

  /** Destello en los bordes de la pantalla. */
  flash(color = 'rgba(255, 40, 40, 0.55)') {
    this.el.flash.style.setProperty('--flash-color', color);
    restartAnim(this.el.flash, 'hud-flash--on');
  }

  showHint(text) {
    this.el.hintText.textContent = text;
    this.el.hint.classList.add('hud-hint--show');
    restartAnim(this.el.hint, 'hud-pop-in');
    this.hintTimer = HINT_DURATION;
  }

  stopPower() {
    this.power.active = false;
    this.el.power.classList.remove('hud-power--active', 'hud-power--ending');
  }

  destroy() { this.root.remove(); }

  // ───────────────────────── Eventos del juego ─────────────────────────

  _listen() {
    const on = (ev, fn) => this.bus.on(ev, fn);

    on(EVENTS.LEVEL_START, ({ index, level }) => this._onLevelStart(index, level));

    on(EVENTS.LEVEL_TIME, ({ remaining }) => this._setTime(remaining));

    on(EVENTS.LIVES_CHANGED, ({ lives }) => {
      const lost = lives < this.lives;
      this._setLives(lives);
      if (lost) this.flash();
    });

    on(EVENTS.KEY_COLLECTED, ({ keys }) => {
      const gained = keys > this.keys;
      this._setKeys(keys);
      if (gained) {
        const slot = this.el.keys.children[keys - 1];
        if (slot) restartAnim(slot, 'hud-pop');
      }
    });

    on(EVENTS.POWER_PICKED, ({ duration }) => {
      this._startPower(duration);
      if (this.phase === 'search') this._setPhase('fight');
      this.notify(this.level ? this.level.powerLabel.toUpperCase() + '!' : '¡PODER!', '#8fa8ff');
    });

    on(EVENTS.POWER_EXPIRED, () => {
      this.stopPower();
      if (this.phase === 'fight') this._setPhase('search');
    });

    on(EVENTS.FAKE_PICKED, () => {
      this.notify('¡ERA UNA TRAMPA!', '#ff4d5e');
      this.flash('rgba(140, 60, 255, 0.5)');
    });

    on(EVENTS.HINT_PICKED, ({ text }) => this.showHint(text));

    on(EVENTS.ITEM_RESPAWNED, () => this.notify('EL OBJETO REAPARECIÓ', '#ffb84d'));

    on(EVENTS.KEY_SPAWNED, () => {
      this._setPhase('key');
      this.el.ghost.classList.add('hud-ghost--defeated');
      this.el.ghost.textContent = 'VENCIDO';
      this.notify('¡APARECIÓ LA LLAVE!', this._levelColor());
    });

    on(EVENTS.EXIT_OPENED, () => this._setPhase('escape'));

    on('boss:etapa2', () => {
      this.el.level.textContent = 'JEFE FINAL';
      this.el.ghost.textContent = 'JEFE';
      this.el.ghost.classList.remove('hud-ghost--defeated');
      this.el.ghost.style.color = '#c28cff';
      this.bossBallTarget = null;
      this.level = {
        ...this.level, name: 'Jefe final', ghost: 'jefe', powerLabel: 'Súper bola', ghosts: null,
      };
      this._setPhase('fight');
      this.notify('¡JEFE FINAL!', '#c28cff');
    });

    on('boss:ballSpawned', ({ ghost }) => {
      const colors = { blinky: 'ROJA', pinky: 'ROSA', inky: 'AZUL', clyde: 'NARANJA' };
      this.bossBallTarget = ghost;
      this._setPhase('fight');
      this.notify(`BOLA ${colors[ghost] ?? ''}: TOCA A ${ghost.toUpperCase()}`, '#ffe47a');
    });
  }

  _onLevelStart(index, level) {
    this.level = level;
    this.bossBallTarget = null;
    this.stopPower();
    this.hintTimer = 0;
    this.el.hint.classList.remove('hud-hint--show');

    this.el.level.textContent = level.name.toUpperCase();
    this.el.ghost.textContent = level.ghosts ? 'LOS CUATRO' : level.ghost.toUpperCase();
    this.el.ghost.classList.remove('hud-ghost--defeated');
    this.el.ghost.style.color = KEY_COLORS[index % KEY_COLORS.length];
    if (level.ghosts) {
      this.el.time.textContent = '--:--';
      this.el.time.classList.remove('hud-time--warn');
      this.root.classList.remove('hud--danger');
    } else {
      this._setTime(level.timeLimit);
    }
    this._setPhase('search');
    restartAnim(this.el.level, 'hud-pop');
  }

  // ───────────────────────── Render ─────────────────────────

  _setPhase(phase) {
    this.phase = phase;
    const l = this.level;
    const texts = {
      search: l?.ghosts ? 'BUSCA UNA BOLA DE COLOR' : l ? `BUSCA: ${l.powerLabel}` : 'BUSCA EL OBJETO',
      fight: l?.ghosts
        ? `TOCA A ${(this.bossBallTarget ?? 'FANTASMA INDICADO').toUpperCase()}`
        : l ? `¡VENCE A ${l.ghost}!` : '¡VENCE AL FANTASMA!',
      key: 'RECOGE LA LLAVE',
      escape: '¡CORRE A LA SALIDA!',
    };
    this.el.goal.textContent = texts[phase].toUpperCase();
    this.el.goal.dataset.phase = phase;
  }

  _setTime(sec) {
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, '0');
    this.el.time.textContent = `${m}:${s}`;
    const danger = sec <= 10;
    this.el.time.classList.toggle('hud-time--warn', danger);
    this.root.classList.toggle('hud--danger', danger); // la viñeta late en rojo
  }

  _setLives(n) {
    this.lives = Math.max(0, n);
    while (this.el.lives.children.length < this.lives) {
      const life = document.createElement('div');
      life.className = 'hud-life';
      this.el.lives.appendChild(life);
    }
    [...this.el.lives.children].forEach((icon, i) => {
      icon.classList.toggle('hud-life--lost', i >= this.lives);
    });
  }

  _setKeys(n) {
    this.keys = Math.max(0, Math.min(this.totalKeys, n));
    [...this.el.keys.children].forEach((slot, i) => {
      slot.classList.toggle('hud-key--got', i < this.keys);
    });
  }

  _startPower(duration) {
    this.power = { active: true, remaining: duration, total: duration };
    this.el.powerLabel.textContent = this.level ? this.level.powerLabel.toUpperCase() : 'PODER';
    this.el.power.classList.add('hud-power--active');
    this._renderPower();
  }

  _renderPower() {
    const pct = Math.max(0, this.power.remaining / this.power.total);
    this.el.powerFill.style.width = `${pct * 100}%`;
    this.el.power.classList.toggle('hud-power--ending', pct < 0.25);
  }

  _levelColor() {
    const i = LEVELS.indexOf(this.level);
    return KEY_COLORS[(i < 0 ? 0 : i) % KEY_COLORS.length];
  }

  _build(container) {
    this.root = document.createElement('div');
    this.root.className = 'hud hud--hidden';
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-block">
          <span class="hud-label">TIEMPO</span>
          <span class="hud-value hud-time" data-el="time">0:00</span>
        </div>
        <div class="hud-block hud-block--center">
          <span class="hud-level" data-el="level"></span>
          <span class="hud-goal" data-el="goal"></span>
        </div>
        <div class="hud-block hud-block--right">
          <span class="hud-label">FANTASMA</span>
          <span class="hud-value hud-ghost" data-el="ghost"></span>
        </div>
      </div>

      <div class="hud-power" data-el="power">
        <span class="hud-power-label" data-el="powerLabel">PODER</span>
        <div class="hud-power-track"><div class="hud-power-fill" data-el="powerFill"></div></div>
      </div>

      <div class="hud-hint" data-el="hint">
        <span class="hud-hint-title">~ NOTA ENCONTRADA ~</span>
        <p class="hud-hint-text" data-el="hintText"></p>
      </div>

      <div class="hud-bottom">
        <div class="hud-lives" data-el="lives"></div>
        <div class="hud-keys" data-el="keys"></div>
      </div>

      <div class="hud-vignette"></div>
      <div class="hud-flash" data-el="flash"></div>
    `;

    this.el = {};
    this.root.querySelectorAll('[data-el]').forEach((n) => { this.el[n.dataset.el] = n; });

    for (let i = 0; i < this.totalKeys; i++) {
      const slot = document.createElement('div');
      slot.className = 'hud-key';
      slot.style.setProperty('--key-color', KEY_COLORS[i % KEY_COLORS.length]);
      slot.innerHTML = KEY_SVG;
      this.el.keys.appendChild(slot);
    }

    container.appendChild(this.root);
  }
}

// ───────────────────────── Utilidades compartidas ─────────────────────────

export function restartAnim(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth; // fuerza reflow para reiniciar la animación
  node.classList.add(cls);
}