# 👻 Pac-Man Scape Room

Juego 3D tipo *escape room* inspirado en Pac-Man, hecho con **Three.js**. En cada nivel hay que encontrar el objeto de poder real entre objetos falsos, vencer al fantasma del nivel y recoger su llave. Con las 4 llaves se abre la salida y empieza el nivel final contra el fantasma gigante.

## 👥 Integrantes

 Integrante | Responsabilidad |
------------|-----------------|
 Valeria Becerra  | Laberintos, niveles, objetos, estados del juego, input, cámara y carga de modelos |
 Laura Gutierrez | Pac-Man, poderes, onda de energía, HUD y pantallas |
 Santiago Zuluaga | Fantasmas, IA (BFS), jefe final, colisiones y audio |

## 🎯 Opción elegida

**[completar: nombre de la opción del enunciado]**: Pac-Man Escape Room 3D. Son 4 niveles con un fantasma distinto cada uno y un nivel final con jefe.

| Nivel | Fantasma | Poder | Golpes para vencerlo | Tiempo |
|-------|----------|-------|----------------------|--------|
| 1 | Nicky (verde) | Poción de velocidad | 1 | 90 s |
| 2 | Ricky (morado) | Estrella de invisibilidad | 2 | 100 s |
| 3 | Dicky (amarillo) | Cristal protector (escudo) | 3 | 110 s |
| 4 | Dawn (azul claro) | Esfera de energía | 4 | 120 s |
| 5 | Fantasma gigante | Súper bolas | 4 ataques | — |

## 🎮 Controles

| Tecla | Acción |
|-------|--------|
| `W A S D` / flechas | Mover a Pac-Man (avanza mientras mantienes la tecla) |
| `Espacio` | Disparar onda de energía (nivel 4) |
| `P` / `Esc` | Pausa |
| `Enter` | Empezar / reintentar |
| `M` | Silenciar / activar sonido |

## 🗺️ Leyenda del tilemap

Los laberintos están escritos como texto en `js/world/mazeData.js`. Cada mapa mide 21 × 21 casillas.

| Carácter | Valor en la matriz | Significado |
|----------|--------------------|-------------|
| `.` | 0 | Pasillo libre |
| `#` | 1 | Pared (modelo `Wall`) |
| `2` | 2 | Pared variante (modelo `wall2`) |
| `3` | 3 | Pared variante (modelo `wall3`) |
| `4` | 4 | Pared variante (modelo `wall4`) |

Zonas fijas, iguales en los 4 mapas:
- **Casa de los fantasmas:** interior en columnas 8–12 y filas 9–11. Su única puerta está en (10, 8).
- **Inicio del jugador:** debajo de la casa, sobre el eje central.
- **Puerta de salida:** en (10, 20), en la pared de abajo. Se abre con las 4 llaves.

Los objetos no van en el tilemap. Se colocan al iniciar el nivel en casillas libres elegidas al azar.

## 🧠 Decisiones de diseño

**1. Un laberinto diseñado para cada fantasma.**
Cada mapa está pensado para la habilidad de su fantasma. El nivel 1 tiene pasillos rectos de hasta 19 casillas para la embestida de Nicky. El nivel 2 tiene muchos bucles para los clones de Ricky. El nivel 3 tiene líneas de visión largas para los proyectiles de Dicky. El nivel 4 es retorcido y sin rectas largas. Todos son simétricos y no tienen callejones sin salida, así el jugador nunca queda atrapado sin opción.

**2. Comunicación entre módulos con un bus de eventos.**
Los tres programadores trabajamos en paralelo. Para no depender del código de los demás, los módulos no se llaman directamente. Se comunican con eventos definidos en `js/config.js`, por ejemplo `PLAYER_TILE`, `POWER_PICKED` o `GHOST_DEFEATED`. Cada evento documenta quién lo emite y quién lo escucha. Eso nos permitió probar los niveles con un jugador provisional antes de tener a Pac-Man terminado.

**3. Objetos falsos y reaparición del objeto real.**
El objeto de poder aparece en una casilla al azar de una lista. Además hay objetos falsos iguales al real, y su cantidad sube con el nivel, de 1 a 4. Si el poder se acaba sin vencer al fantasma, el objeto reaparece en otra casilla distinta. Así el jugador tiene que explorar y no puede memorizar posiciones. Las pistas ayudan a saber cómo vencer a cada fantasma.

## 📦 Créditos de recursos externos

- **[Three.js](https://threejs.org/) r186:** motor 3D, cargado desde jsDelivr.
- **[MagicaVoxel](https://ephtracy.github.io/):** programa con el que hicimos los modelos voxel de Pac-Man, los fantasmas, las paredes y las pistas. Los modelos son nuestros.
- **Efectos de sonido y música** de la carpeta `audio/`: [completar origen y licencia, por ejemplo Pixabay, Freesound o Mixkit].
- Inspirado en **Pac-Man** de Namco (1980). Es un proyecto educativo sin fines comerciales.

## 🤖 Declaración de uso de IA

Usamos herramientas de inteligencia artificial en aproximadamente un **20 %** del proyecto. La IA sirvió de apoyo para:
- resolver errores puntuales y dudas sobre la API de Three.js;
- revisar y mejorar comentarios y documentación;
- ajustes menores de interfaz, como ocultar el panel de depuración.

El diseño del juego, los niveles, los laberintos, los modelos voxel, la lógica de los fantasmas y la integración entre módulos son trabajo del equipo. Revisamos y entendemos todo el código generado con ayuda de IA antes de incluirlo.
