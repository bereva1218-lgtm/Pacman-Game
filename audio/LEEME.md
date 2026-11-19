# Audios del juego

Pon aquí los archivos con **exactamente** estos nombres (en minúscula, sin espacios).
Formatos aceptados: `.mp3` (recomendado), `.ogg` o `.wav`. Ejemplo: `audio/pickup_key.mp3`.

- Los que falten simplemente no suenan: puedes ir añadiéndolos poco a poco.
- Los de **música** se repiten en bucle: que el final enlace con el principio sin silencio.
- Efectos: cortos (0.1–2 s). Jingles: 2–5 s. Normalízalos a un volumen parecido; el juego los ajusta con el catálogo de `js/systems/AudioManager.js`.
- En el juego, **M** silencia / activa el sonido.

## Música (bucle)

| Archivo | Cuándo suena |
|---|---|
| `music_menu` | Pantalla de inicio (suena al pulsar la primera tecla) |
| `music_level1` | Nivel 1 — Blinky |
| `music_level2` | Nivel 2 — Pinky |
| `music_level3` | Nivel 3 — Inky |
| `music_level4` | Nivel 4 — Clyde |
| `music_boss` | Nivel 5 — jefe final (cuando los fantasmas se fusionan) |

## Pantallas y jingles

| Archivo | Cuándo suena |
|---|---|
| `ui_click` | Al empezar la partida, pausar y reanudar |
| `jingle_level_complete` | Nivel superado |
| `jingle_game_over` | Se acabaron las vidas |
| `jingle_win` | Victoria final |

## Jugador

| Archivo | Cuándo suena |
|---|---|
| `player_step` | Cada casilla que avanza (muy corto y suave; se repite mucho) |
| `player_hit` | Un fantasma o ataque lo golpea |
| `player_respawn` | Reaparece en su punto de inicio |
| `player_fire` | Dispara la onda de energía (poder del nivel 4) |

## Objetos y poderes

| Archivo | Cuándo suena |
|---|---|
| `pickup_power` | Recoge un objeto real (el mismo sonido para los 4 poderes) |
| `pickup_superball` | Recoge una súper bola (nivel 5) |
| `pickup_fake` | Recoge un objeto falso (tono de "trampa") |
| `pickup_hint` | Recoge una pista |
| `pickup_key` | Recoge la llave |
| `key_spawn` | Aparece la llave al vencer al fantasma |
| `item_respawn` | Reaparece un objeto |
| `power_expire` | Se acaba el poder |
| `shield_block` | El escudo bloquea un golpe |
| `exit_open` | Se abre la puerta de salida |

## Tiempo

| Archivo | Cuándo suena |
|---|---|
| `timer_tick` | Cada segundo en los últimos 10 |
| `timer_timeout` | Se acaba el tiempo |

## Fantasmas

| Archivo | Cuándo suena |
|---|---|
| `ghost_spawn` | Aparecen los fantasmas al empezar el nivel |
| `ghost_warn` | Aviso justo antes de un ataque especial (Blinky, Inky, Clyde, Pinky) |
| `ghost_hit` | Le pegas a un fantasma |
| `ghost_immune` | El golpe no le hace daño |
| `ghost_defeated` | Fantasma derrotado |
| `ghost_locked` | Fantasma encerrado con su súper bola (nivel 5) |
| `blinky_dash` | Embestida de Blinky |
| `pinky_clone` | Pinky crea un clon |
| `inky_teleport` | Inky se teletransporta |
| `inky_shoot` | Inky dispara |
| `clyde_swap` | Clyde cambia de lugar contigo |
| `projectile_blocked` | Un proyectil choca con una pared o el escudo |

## Jefe final

| Archivo | Cuándo suena |
|---|---|
| `boss_fusion` | Los cuatro fantasmas se fusionan |
| `boss_phase2` | Empieza la etapa 2 |
| `boss_attack` | Empieza un ataque nuevo |
| `boss_ring` | El suelo de la arena se encoge |
| `boss_superball` | Lanza una súper bola |
| `boss_ball_spawn` | Aparece una súper bola para recoger |
| `boss_hit` | Golpeas al jefe |
| `boss_defeated` | Jefe derrotado |

**Total: 46 archivos** (6 de música + 40 efectos y jingles).

Para añadir uno nuevo: ponlo en `SOUNDS` y enlázalo a un evento en `EVENT_SOUNDS`
dentro de `js/systems/AudioManager.js` (o llama a `audio.play('nombre')`).
