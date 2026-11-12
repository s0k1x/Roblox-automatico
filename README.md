# Balón Turbo

Fútbol con coches en 3D que se juega en el navegador. Un servidor Node sirve el juego y
gestiona partidas online; también se puede jugar solo contra bots.

## Arrancar

```bash
npm install
npm start          # http://localhost:3000
```

Con Docker:

```bash
docker compose up -d --build
```

Variables: `PORT` (por defecto 3000).

## Modos

- **Contra bots**: 1v1, 2v2 o 3v3. La física corre en tu navegador.
- **Online**: «Crear sala» da un código de 4 letras; tus amigos entran con «Unirse».
  El servidor ejecuta la física (autoritativo) y los huecos libres los ocupan bots.

## Controles

| Acción | Teclado / ratón | Mando |
|---|---|---|
| Acelerar / frenar | W / S | RT / LT |
| Girar / yaw | A / D | Stick izquierdo |
| Cabeceo en el aire | W / S | Stick izquierdo |
| Roll | Q / E | LB / RB |
| Saltar (doble salto, flip) | Espacio o clic derecho | A |
| Turbo | Shift o clic izquierdo | B |
| Derrape / giro libre en aire | Ctrl o C | X |
| Cámara balón | R | Y |
| Ver hitbox | H | — |
| Pausa / menú | Esc | — |

## Física

Toda la simulación está en `shared/` y es la misma en el navegador y en el servidor:

- 120 ticks por segundo, gravedad −650 uu/s² (1 uu = 1 cm).
- Balón: radio 91.25, masa 30, rebote 0.6, rozamiento con efecto, velocidad máx. 6000.
- Coche: masa 180, velocidad máx. 2300 (supersónico desde 2200), acelerador hasta 1410 con la
  curva 1600→160→0 uu/s², turbo +991.67 uu/s² gastando 33.3/s, frenada 3500, inercia 525.
- Giro por curvatura según velocidad (0.0069 a 0 uu/s … 0.00088 a 2500 uu/s), derrape con
  menos agarre lateral.
- Salto 291.67 + 1458.33 uu/s² mientras se mantiene (0.2 s), doble salto o flip durante 1.25 s,
  flip de 500 uu/s (533 hacia atrás, laterales escalados con la velocidad), cancelación de flip,
  reinicio de flip al tocar el balón con los bajos.
- Control aéreo con los pares y amortiguaciones medidos (roll 36.08, pitch 12.15, yaw 8.92 rad/s²),
  velocidad angular máx. 5.5 rad/s.
- Golpe al balón: impulso físico + impulso extra del juego (dirección desde el centro del coche con
  Z ×0.35, escala 0.65→0.55→0.30 según la velocidad relativa).
- Fuerza que pega el coche a suelo, rampas y paredes (325 uu/s²); el techo no sujeta.
- Seis tipos de hitbox con sus medidas reales (Estándar 118×84×36, Plano, Tabla, Largo, Híbrido, Alto).
- Estadio de 8192×10240×2044 con curvas suelo-pared, porterías de 1786×643×880,
  6 turbos grandes (100, 10 s) y 28 pequeños (12, 4 s), demoliciones y choques.

Pruebas de la física: `npm test`.

## Estructura

```
server.js          servidor HTTP + WebSocket (salas online)
shared/            física, estadio, IA de bots (navegador y servidor)
public/            cliente 3D (Three.js), menú, HUD, controles
test/              pruebas de la simulación
```
