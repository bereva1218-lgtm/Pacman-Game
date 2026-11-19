// js/ui/Screens.js
// Pantallas de "Pac-Man – The Four Keys" (temática: mansión embrujada).
//   · Pantallas completas: título, pausa, game over, victoria
//   · Tarjetas centrales (no bloquean el juego): inicio de nivel, llave conseguida,
//     tiempo agotado, salida abierta. Se muestran en cola, una tras otra.
//
// En main.js:
//   new Screens({ ...ctx, hud });
//
// Screens NO lee el teclado: main.js ya maneja INPUT_START (startGame) e INPUT_PAUSE
// (togglePause). Screens solo reacciona a STATE_CHANGED y a los eventos de LevelManager.
// Los botones en pantalla emiten INPUT_START, igual que la tecla.
// Lleva su propio reloj (requestAnimationFrame) para las tarjetas: no hace falta
// agregarlo a `systems`, porque esas solo se actualizan en PLAYING y las tarjetas
// también deben correr durante LEVEL_COMPLETE.


import { EVENTS, CONFIG } from '../config.js';
import { STATES } from '../core/GameState.js';
import { LEVELS, ESCAPE_TIME } from '../levels/levels.js';
import { KEY_COLORS, KEY_SVG, restartAnim } from './HUD.js';

const DEFAULT_CONTROLS = [
  ['FLECHAS / WASD', 'Moverse'],
  ['ESPACIO', 'Disparar (nivel 4)'],
  ['P / ESC', 'Pausa'],
];

// ───────────── Ilustraciones (SVG) ─────────────

const GHOST_SVG = `
<svg viewBox="0 0 24 28" aria-hidden="true">
  <path d="M2 13a10 10 0 0 1 20 0v13l-3.3-2.6-3.4 2.6-3.3-2.6-3.3 2.6-3.4-2.6L2 26z" fill="currentColor"/>
  <circle cx="8.5" cy="13" r="2.2" fill="#0b0614"/><circle cx="15.5" cy="13" r="2.2" fill="#0b0614"/>
</svg>`;

const MANSION_SVG = `
<svg class="scr-mansion" viewBox="0 0 320 170" aria-hidden="true">
  <circle class="scr-moon" cx="258" cy="38" r="22"/>
  <g fill="#06020d">
    <rect x="72" y="70" width="9" height="22"/>
    <polygon points="48,170 48,104 86,76 124,104 124,170"/>
    <polygon points="196,170 196,104 234,76 272,104 272,170"/>
    <rect x="116" y="62" width="88" height="108"/>
    <polygon points="108,64 160,24 212,64"/>
    <rect x="152" y="14" width="16" height="22"/>
    <polygon points="148,16 160,0 172,16"/>
    <rect x="0" y="164" width="320" height="6"/>
  </g>
  <g class="scr-windows">
    <rect x="62" y="114" width="10" height="14"/><rect x="98" y="114" width="10" height="14" class="off"/>
    <rect x="62" y="140" width="10" height="14" class="off"/><rect x="98" y="140" width="10" height="14"/>
    <rect x="132" y="80" width="12" height="16"/><rect x="176" y="80" width="12" height="16" class="off"/>
    <rect x="132" y="110" width="12" height="16" class="off"/><rect x="176" y="110" width="12" height="16"/>
    <rect x="212" y="114" width="10" height="14" class="off"/><rect x="248" y="114" width="10" height="14"/>
    <rect x="212" y="140" width="10" height="14"/><rect x="248" y="140" width="10" height="14" class="off"/>
    <circle cx="160" cy="46" r="5"/>
  </g>
  <path d="M150 170v-26a10 10 0 0 1 20 0v26z" fill="#1a0f2e"/>
</svg>`;

export class Screens {
  /**
   * Recibe el mismo `ctx` de main.js (usa bus y gameState) más el hud.
   * @param {Object} o
   * @param {Object} o.bus
   * @param {Object} o.gameState
   * @param {Object} [o.hud]          se oculta en menús y se muestra al jugar
   * @param {Array}  [o.controls]     lista [tecla, acción] para la pantalla de título
   * @param {HTMLElement} [o.container=document.body]
   */
  constructor({ bus, gameState, hud = null, controls = DEFAULT_CONTROLS, container = document.body }) {
    Object.assign(this, { bus, gameState, hud, controls });

    this.elapsed = 0;         // tiempo total de la partida (para la pantalla de victoria)
    this.escape = false;      // ¿ya se abrió la salida?
    this.cards = [];          // cola de tarjetas
    this.card = null;         // tarjeta visible { timer }

    this._build(container);
    this._listen();

    this._onStateChange(gameState.current, null);

    this._last = performance.now();
    this._loop = this._loop.bind(this);
    this._raf = requestAnimationFrame(this._loop);
  }

  // ───────────────────────── Reloj propio ─────────────────────────

  _loop(now) {
    const dt = Math.min((now - this._last) / 1000, 0.05);
    this._last = now;

    const s = this.gameState.current;
    const running = s === STATES.PLAYING || s === STATES.LEVEL_COMPLETE;
    if (running) {
      this.elapsed += dt;
      // Las tarjetas avanzan solo mientras se juega (se congelan en pausa)
      if (this.card) {
        this.card.timer -= dt;
        if (this.card.timer <= 0) this._nextCard();
      }
    }

    this._raf = requestAnimationFrame(this._loop);
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this.root.remove();
  }

  // ───────────────────────── Estados ─────────────────────────

  _onStateChange(state, from) {
    switch (state) {
      case STATES.PLAYING:
      case STATES.LEVEL_COMPLETE:
        // Partida nueva (no al volver de la pausa ni entre niveles)
        if ([STATES.MENU, STATES.GAME_OVER, STATES.WIN].includes(from)) {
          this.elapsed = 0;
        }
        this._showOverlay(null);
        this.hud?.show();
        break;

      case STATES.PAUSED:
        this._showOverlay('pause');
        break;

      case STATES.GAME_OVER:
        this._clearCards();
        this._fillGameOver();
        this._showOverlay('gameover');
        this.hud?.hide();
        break;

      case STATES.WIN:
        this._clearCards();
        this._fillWin();
        this._showOverlay('win');
        this.hud?.hide();
        break;

      default: // menú / cualquier otro estado
        this._clearCards();
        this._showOverlay('title');
        this.hud?.hide();
    }
  }

  // ───────────────────────── Eventos del juego ─────────────────────────

  _listen() {
    this.bus.on(EVENTS.STATE_CHANGED, ({ from, to }) => this._onStateChange(to, from));

    this.bus.on(EVENTS.LEVEL_START, ({ index, level }) => {
      this.escape = false;
      const [, theme = level.name] = level.name.split('—').map((t) => t.trim());
      this._queueCard({
        kicker: `NIVEL ${index + 1} / ${LEVELS.length}`,
        title: theme,
        sub: `Busca: ${level.powerLabel}\nEnfrenta a ${level.ghost.toUpperCase()}`,
        color: KEY_COLORS[index % KEY_COLORS.length],
        icon: GHOST_SVG,
        duration: 2.8,
      });
    });

    this.bus.on(EVENTS.LEVEL_COMPLETE, ({ index }) => {
      const keys = this.gameState.keys ?? index + 1;
      this._queueCard({
        kicker: '¡FANTASMA VENCIDO!',
        title: `Llave ${keys} de ${LEVELS.length}`,
        sub: 'Una puerta más se abre en la mansión...',
        color: KEY_COLORS[index % KEY_COLORS.length],
        icon: KEY_SVG,
        duration: CONFIG.LEVEL_COMPLETE_DELAY ?? 2.5,
      });
    });

    this.bus.on(EVENTS.LEVEL_TIMEOUT, () => {
      this._queueCard({
        kicker: 'PIERDES UNA VELA',
        title: 'Se acabó el tiempo',
        sub: this.escape ? 'Conservas las llaves. ¡Corre otra vez!' : 'La mansión te devuelve al inicio',
        color: '#ff4d5e',
        duration: 2.2,
      });
    });

    this.bus.on(EVENTS.EXIT_OPENED, () => {
      this.escape = true;
      this._queueCard({
        kicker: '¡TIENES LAS 4 LLAVES!',
        title: 'La puerta se abrió',
        sub: `Tienes ${ESCAPE_TIME} segundos para escapar`,
        color: '#7dff9a',
        duration: 2.8,
      });
    });
  }

  // ───────────────────────── Tarjetas ─────────────────────────

  _queueCard(card) {
    this.cards.push(card);
    if (!this.card) this._nextCard();
  }

  _nextCard() {
    const card = this.cards.shift();
    if (!card) {
      this.card = null;
      this.el.card.classList.remove('scr-card--show');
      return;
    }
    this.card = { timer: card.duration };
    this.el.cardKicker.textContent = card.kicker ?? '';
    this.el.cardTitle.textContent = card.title;
    this.el.cardSub.textContent = card.sub ?? '';
    this.el.cardIcon.innerHTML = card.icon ?? '';
    this.el.card.style.setProperty('--card-color', card.color ?? '#7dff9a');
    this.el.card.classList.add('scr-card--show');
    restartAnim(this.el.card, 'scr-card--in');
  }

  _clearCards() {
    this.cards = [];
    this.card = null;
    this.el.card.classList.remove('scr-card--show');
  }

  // ───────────────────────── Pantallas completas ─────────────────────────

  _showOverlay(name) {
    this.overlay = name;
    for (const key of ['title', 'pause', 'gameover', 'win']) {
      this.el[key].classList.toggle('scr-overlay--show', key === name);
    }
  }

  _fillGameOver() {
    const lvl = (this.gameState.levelIndex ?? 0) + 1;
    const keys = this.gameState.keys ?? 0;
    this.el.gameoverStats.innerHTML = `
      ${statRow('NIVEL ALCANZADO', `${lvl} / ${LEVELS.length}`)}
      ${statRow('LLAVES', `${keys} / ${LEVELS.length}`)}
      ${statRow('TIEMPO', formatTime(this.elapsed))}
    `;
  }

  _fillWin() {
    this.el.winStats.innerHTML = `
      ${statRow('TIEMPO TOTAL', formatTime(this.elapsed))}
      ${statRow('VELAS ENCENDIDAS', String(this.gameState.lives ?? '-'))}
    `;
  }

  /** Los botones hacen lo mismo que la tecla de inicio: main.js decide qué pasa. */
  _start() {
    this.bus.emit(EVENTS.INPUT_START, {});
  }

  // ───────────────────────── DOM ─────────────────────────

  _build(container) {
    const keysRow = KEY_COLORS.slice(0, LEVELS.length)
      .map((c) => `<span class="scr-key" style="color:${c}">${KEY_SVG}</span>`).join('');

    const ghostsRow = LEVELS
      .map((l, i) => `<span class="scr-ghost" style="color:${KEY_COLORS[i % KEY_COLORS.length]}">${GHOST_SVG}</span>`).join('');

    const controls = this.controls
      .map(([key, action]) => `<li><span class="scr-kbd">${key}</span><span>${action}</span></li>`).join('');

    this.root = document.createElement('div');
    this.root.className = 'scr';
    this.root.innerHTML = `
      <section class="scr-overlay scr-title" data-el="title">
        <div class="scr-fog"></div>
        <div class="scr-scene">
          ${MANSION_SVG}
          <span class="scr-float-ghost">${GHOST_SVG}</span>
        </div>
        <span class="scr-kicker">PAC-MAN</span>
        <h1 class="scr-h1">The Four Keys</h1>
        <h2 class="scr-h2">— ESCAPA DE LA MANSIÓN —</h2>
        <p class="scr-story">Cuatro fantasmas guardan las llaves de la salida.<br>Encuentra lo que los debilita, enfréntalos y escapa.</p>
        <button class="scr-btn" data-el="startBtn">PRESIONA ENTER</button>
        <ul class="scr-controls">${controls}</ul>
      </section>

      <section class="scr-overlay scr-pause" data-el="pause">
        <h1 class="scr-h1 scr-h1--small">Pausa</h1>
        <p class="scr-prompt">P PARA CONTINUAR</p>
      </section>

      <section class="scr-overlay scr-gameover" data-el="gameover">
        <div class="scr-fog scr-fog--red"></div>
        <div class="scr-ghosts scr-ghosts--close">${ghostsRow}</div>
        <h1 class="scr-h1 scr-h1--blood">Te atraparon</h1>
        <p class="scr-story">La mansión no te dejará ir tan fácil...</p>
        <div class="scr-stats" data-el="gameoverStats"></div>
        <button class="scr-btn" data-el="retryBtn">ENTER PARA REINTENTAR</button>
      </section>

      <section class="scr-overlay scr-win" data-el="win">
        <div class="scr-dawn"></div>
        <div class="scr-keys">${keysRow}</div>
        <h1 class="scr-h1 scr-h1--dawn">¡Escapaste!</h1>
        <p class="scr-story">Amanece. Saliste de la mansión con las cuatro llaves.</p>
        <div class="scr-stats" data-el="winStats"></div>
        <button class="scr-btn" data-el="againBtn">ENTER PARA JUGAR OTRA VEZ</button>
      </section>

      <div class="scr-card" data-el="card">
        <div class="scr-card-icon" data-el="cardIcon"></div>
        <span class="scr-card-kicker" data-el="cardKicker"></span>
        <span class="scr-card-title" data-el="cardTitle"></span>
        <span class="scr-card-sub" data-el="cardSub"></span>
      </div>
    `;

    this.el = {};
    this.root.querySelectorAll('[data-el]').forEach((n) => { this.el[n.dataset.el] = n; });
    ['startBtn', 'retryBtn', 'againBtn'].forEach((b) =>
      this.el[b].addEventListener('click', () => this._start()));

    container.appendChild(this.root);
  }
}

function statRow(label, value) {
  return `<div class="scr-stat"><span>${label}</span><span>${value}</span></div>`;
}

function formatTime(sec) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
