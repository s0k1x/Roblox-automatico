# AdoptMe Bot V1 — Prototype

Primera versión del sistema WEB → BACKEND → BOT.

Esta versión incluye:
- Panel web responsive.
- Backend Flask.
- WebSocket con Socket.IO.
- Registro de bots.
- Estado online/offline.
- Inventario de ejemplo.
- Sincronización simulada del inventario.
- Creación/cancelación de órdenes.
- Confirmación manual de órdenes.
- Logs en tiempo real.

IMPORTANTE: esta V1 NO inicia sesión en Roblox, NO lee la pantalla de Roblox y NO ejecuta trades reales. Es una base segura para probar toda la arquitectura antes de conectar el bot a Roblox.

## Instalación

Python 3.10+ recomendado.

```bash
pip install -r requirements.txt
python app.py
```

Abrir:
http://127.0.0.1:5000

En otra terminal:

```bash
python bot.py --name BOT-001
```

El bot se conectará al backend y aparecerá online en el panel.

## Subir a GitHub y desplegar

Sube todo el contenido de esta carpeta a un repositorio de GitHub.

No subas `.env`, contraseñas ni tokens.

### Docker

En un VPS con Docker:

```bash
docker compose up -d --build
```

El backend escucha en el puerto 5000.

### Importante

GitHub guarda el código y puede ejecutar las comprobaciones de CI, pero no mantiene un bot de Roblox ejecutándose 24/7. Para ello necesitas un servidor/VPS compatible.

Esta versión sigue siendo un prototipo: el inventario es de demostración y las órdenes de trade NO ejecutan intercambios reales.
