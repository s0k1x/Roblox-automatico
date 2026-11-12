# Balón Turbo

Fútbol con coches en 3D que se juega en el navegador. **No necesita servidor de pago**: la web es
estática (se aloja gratis) y todo se calcula en el PC de cada jugador.

## Modos

- **Contra bots**: 1v1, 2v2 o 3v3. Todo corre en tu navegador.
- **Online de PC a PC**: «Crear sala online» convierte tu navegador en el anfitrión (calcula la física)
  y te da un código de 4 letras. Tus amigos lo escriben en «Unirse» y se conectan directamente a tu PC
  (WebRTC). Los huecos libres los ocupan bots.
  - El anfitrión no debe cerrar ni minimizar la pestaña: si lo hace, la partida se para.
  - Para encontrarse se usa el servicio gratuito de PeerJS (solo para el saludo inicial; el juego va
    directo entre PCs). Se puede usar otro servidor propio con `?senal=https://host:puerto/`.
  - En algunas redes muy cerradas (redes de empresa, algunos datos móviles) la conexión directa
    puede fallar; en casa con wifi normal funciona.

## Publicarlo gratis

- **GitHub Pages** (automático): en GitHub, *Settings → Pages → Source: GitHub Actions*. Cada cambio
  que llegue a la rama `main` se publica solo (`.github/workflows/pages.yml`) en
  `https://<usuario>.github.io/<repositorio>/`.
- **itch.io / Netlify Drop**: `npm install && npm run build` y sube el contenido de `dist/`
  (en itch.io como juego HTML comprimido en ZIP; en Netlify arrastra la carpeta a app.netlify.com/drop).

## Probarlo en tu PC

```bash
npm install
npm start          # http://localhost:3000
```

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
public/            cliente 3D (Three.js), menú, HUD, controles, red PC a PC (js/net.js)
shared/            física, estadio, IA de bots
scripts/build.mjs  genera la web estática en dist/
server.js          servidor local para desarrollo (opcional)
test/              pruebas de la simulación
```
