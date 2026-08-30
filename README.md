# Aprende aperturas

Sitio estático (GitHub Pages) para estudiar **30 aperturas** de ajedrez: línea principal, variantes, notación, concepto estratégico y **examen de reconocer la apertura**.

URL pública: https://elpadreroberto.github.io/chess/

## Cómo está armado

- Un `index.html` con el curso (tablero, familias Abiertas / Cerradas / Semiabiertas / Semicerradas, las 30 teorías, examen, paseo Auto / Una jugada / variantes).
- `js/coach.js` + `js/fsrs.js` + `css/coach.css` añaden sparring, rival visible, repertorio, import PGN y repetición espaciada **sin borrar** lo anterior.
- Stockfish se carga en un Web Worker desde CDN (`stockfish.js` 10). El reglamento lo lleva `chess.js`.
- No hay backend. Todo lo personal (repertorio, FSRS, token de Lichess) vive en `localStorage` de tu navegador.

## Probar en local

```bash
cd chess
python3 -m http.server 8765
```

Abre http://127.0.0.1:8765/  
(Sirve el directorio del repo; GitHub Pages hace lo mismo.)

### Sparring

1. En la portada: **Sparring** (o, en la ficha de una apertura, «Sparring con esta apertura»).
2. Elige apertura o **Sorpresa**, color, personalidad del libro y reloj.
   - *Libro fiel*: siempre la línea principal.
   - *Club* (por defecto): ~50 % principal, ~50 % laterales.
   - *Trampas*: prioriza desviaciones del catálogo.
3. Partes de la posición inicial. **Solo mueves tu bando**.
4. Mientras la posición esté en el árbol (principal + variantes) el rival **no** usa Stockfish.
5. Al salirte o al acabarse el libro entra el motor del nivel elegido y la partida sigue (mate, 25 jugadas o **Nueva ronda**).
6. El debrief dice: «Te saliste en la jugada N …xxx; en la teoría iba …yyy».

### Rival (ya no es «SF · Torpe»)

Selector **Torpe | Básico | Medio | Avanzado**. Persiste al cambiar de apertura.

- Torpe: muchos errores de club.
- Básico: responde y no te aplasta (Skill bajo + ELO limitado + jugadas no siempre óptimas).
- Medio: ~1600–1900.
- Avanzado: Stockfish casi lleno.

Chip siempre visible: `En libro` | `Fuera de libro · [nivel]`.

### Importar PGN y desviaciones

1. Portada → **Importar**.
2. Pega un PGN (una o varias partidas) o sube un `.pgn`.
3. Opcional: usuario de Lichess (token solo en `localStorage`, nunca se sube al repo).
4. Chess.com: usuario público; si CORS lo bloquea, exporta PGN y pégalo.
5. Cada partida: se detecta la apertura del catálogo/repertorio y se guarda la **primera jugada fuera del árbol**.

### Repertorio personal

**Repertorio** en la portada: «con blancas juego X; con negras Y». Puedes clonar una de las 30 y editar líneas (SAN). Exporta/importa JSON. Si no hay repertorio, sparring y desviaciones usan la ficha del catálogo.

### FSRS (repaso)

Las cartas son **posiciones** (repertorio + desviaciones). Tienes que **jugar la jugada**, no elegir en un test. La portada indica «Hoy toca N cartas».

### Bloque «Hoy» (~12 min)

1. Repaso FSRS (prioridad a desviaciones).
2. Una ronda de sparring de esa apertura.
3. 3–4 ítems del **examen original** de reconocer la apertura.

### PWA

Instalable en Linux/Android (navegador → Instalar app). El repertorio y la cola FSRS siguen en `localStorage` y el service worker guarda el cascarón estático.

### Qwen local (opcional)

Si en esta máquina corre Ollama (`localhost:11434`) con un modelo Qwen, aparece **Explicar esta posición**. En el sitio HTTPS público el botón se oculta (el navegador bloquea HTTP a localhost). No rompe el build.

## GitHub Pages

- Repo: `elpadreroberto/chess`
- El sitio se publica desde **una rama, carpeta `/`** (ahora: `feat/sparring-repertoire-fsrs` para esta entrega; el origen previo era `elpadreroberto-patch-2`).
- Cambiar fuente: GitHub → Settings → Pages → Branch.
- Tras un push, espera 1–2 minutos y recarga sin caché.

## Qué no se ha tocado

- Estética oscura, título naranja, cards, familias.
- Las 30 teorías + variantes + notación + concepto estratégico.
- El examen de reconocer la apertura.
- Modos de paseo (línea principal, una jugada, auto, variantes) y color Blancas/Negras.
