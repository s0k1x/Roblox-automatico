# Arquitectura de producción de Balón Turbo (Hetzner CX33)

Este documento es el **contrato** entre las piezas. Cualquier script, servicio o panel debe usar
exactamente estas rutas, puertos, usuarios y comandos.

## Decisión tecnológica

| Pieza | Elección | Motivo |
|---|---|---|
| Servidor de juego | Node.js 22 + `ws` (ya existente) con simulación autoritativa | El juego ya está escrito así: física compartida `shared/sim.js` a 120 Hz. Colyseus no aporta nada que no esté hecho y obligaría a reescribir el protocolo. |
| Uso de los 4 vCPU | `worker_threads`: cada sala vive en un hilo; el hilo principal solo gestiona conexiones | Un proceso Node usa un solo núcleo; la física de las salas es lo que consume CPU. |
| Base de datos | Ninguna por ahora (historial de partidas en `matches.jsonl`) | No hay cuentas ni datos que consultar. PostgreSQL gastaría ~150-300 MB de RAM sin uso. Se añadirá cuando haya cuentas/rankings. |
| Redis | No | Una sola máquina, salas en memoria; no hay nada que compartir entre procesos. |
| Contenedores | Docker + Compose para el juego | Aislamiento, límites de memoria/CPU, actualizaciones reproducibles. |
| Proxy | Nginx en el host (HTTPS, WebSockets, límites de peticiones) | |
| Certificados | Certbot (Let's Encrypt) con plugin nginx | Gratis. |
| Panel | Node.js 22 sin dependencias, servicio systemd en el host | Necesita leer `/proc` y controlar servicios; no se le da acceso al socket de Docker. |

## Rutas

| Ruta | Contenido | Dueño / permisos |
|---|---|---|
| `/opt/balon-turbo` | Clon del repositorio | root:root 755 |
| `/etc/balon-turbo/bt.env` | Configuración general (ver variables) | root:root 640 |
| `/etc/balon-turbo/panel.env` | Credenciales del panel (hash) | root:bt-panel 640 |
| `/var/lib/balon-turbo/data` | Datos del juego (`matches.jsonl`) montado en `/data` del contenedor | 1000:1000 750 (usuario `node` del contenedor) |
| `/var/backups/balon-turbo` | Copias `bt-AAAAMMDD-HHMMSS.tar.gz` + `.sha256` | root:root 700 |
| `/var/log/balon-turbo` | Informes de auditoría, instalación, pruebas de carga y copias | root:adm 750 |
| `/usr/local/sbin/bt-ctl` | Herramienta de administración (enlace a `/opt/balon-turbo/deploy/bin/bt-ctl`) | root 755 |

### `/etc/balon-turbo/bt.env`

```
DOMAIN=            # vacío hasta tener dominio; p. ej. midominio.es
EMAIL=             # correo para Let's Encrypt
GAME_PORT=3000     # solo 127.0.0.1
STATS_PORT=3001    # solo 127.0.0.1 (estadísticas internas del juego)
PANEL_PORT=8090    # solo 127.0.0.1
BACKUP_KEEP=14     # copias locales que se conservan
BACKUP_REMOTE=     # opcional: destino rclone (p. ej. storagebox:balon-turbo); vacío = solo local
PANEL_ALLOW_IPS=   # opcional: IPs/redes separadas por espacios que pueden abrir el panel
```

### `/etc/balon-turbo/panel.env`

```
PANEL_USER=admin
PANEL_PASS_HASH=scrypt$<salt_hex>$<hash_hex>   # scrypt N=16384 r=8 p=1, 64 bytes
SESSION_SECRET=<64 hex aleatorios>
```

## Puertos

| Puerto | Escucha | Público |
|---|---|---|
| 22 | sshd | Sí (UFW) |
| 80 / 443 | nginx | Sí (UFW) |
| 3000 | juego (contenedor) | No: publicado como `127.0.0.1:3000` |
| 3001 | estadísticas del juego | No: `127.0.0.1:3001` |
| 8090 | panel | No: `127.0.0.1:8090`, nginx delante |

Docker se salta UFW al publicar puertos, por eso **todos** los puertos de contenedores se publican
en `127.0.0.1`. El socket de Docker nunca se expone por TCP.

## Usuarios

- `bt-admin`: persona administradora, grupo `sudo`, acceso SSH con clave.
- `bt-panel`: usuario de sistema sin shell que ejecuta el panel. Su única capacidad privilegiada es
  `sudo -n /usr/local/sbin/bt-ctl panel <acción>` (regla en `/etc/sudoers.d/bt-panel`).
- El juego corre dentro del contenedor como usuario `node` (uid 1000), sistema de archivos de solo lectura.

## Servicios

- Contenedor `balon-turbo-game` (compose: `/opt/balon-turbo/deploy/docker-compose.prod.yml`,
  proyecto `balon-turbo`). Límites: 3 GB RAM, 3.5 CPU, 512 pids. Healthcheck `/health`.
- `bt-panel.service` (systemd, usuario `bt-panel`, `EnvironmentFile=/etc/balon-turbo/bt.env` y `panel.env`, `MemoryMax=256M`).
- `bt-backup.timer` → `bt-backup.service` (diario 04:15 con retardo aleatorio de 20 min) → `bt-ctl backup`.
- `nginx`, `docker`, `fail2ban`, `unattended-upgrades`.

## Estadísticas del juego: `GET http://127.0.0.1:3001/stats`

```json
{
  "ok": true, "uptime": 1234.5, "startedAt": "ISO",
  "connections": 12, "players": 10,
  "rooms": 3, "roomsList": [{ "code": "ABCD", "teamSize": 3, "humans": 4, "bots": 2, "phase": "play", "score": [1, 0], "clock": 211.3, "worker": 0 }],
  "workers": [{ "id": 0, "rooms": 2, "stepMsAvg": 0.21, "lagMsMax": 0.0 }],
  "tick": { "stepMsAvg": 0.21, "lagMsMax": 0, "eventLoopP99Ms": 1.2 },
  "memory": { "rss": 81234567, "heapUsed": 1234 },
  "matchesFinished": 7, "reconnections": 2, "rejected": 0
}
```

## `bt-ctl` (interfaz con el panel)

El panel solo llama a `sudo -n /usr/local/sbin/bt-ctl panel <acción> [args]`. Lista blanca:

| Acción | Salida |
|---|---|
| `panel status` | JSON: `{"services":[{"name":"game","label":"Servidor de juego","active":true,"state":"running","detail":"healthy","since":"ISO"}, …nginx, docker, panel, fail2ban, backup-timer (con "next")], "backups":[{"file":"bt-…tar.gz","size":123,"date":"ISO"}], "domain":"", "https":false}` |
| `panel start game` / `panel stop game` / `panel restart game` | texto; código 0 si va bien |
| `panel restart nginx` / `panel reload nginx` | `nginx -t` antes; texto |
| `panel restart fail2ban` | texto |
| `panel restart panel` | reinicio diferido (`systemd-run --on-active=2`) |
| `panel logs <game|nginx|nginx-error|panel|system|backup|security> [líneas≤1000]` | texto |
| `panel backup` | ejecuta una copia; imprime la ruta |

Comandos de administración (solo root, por SSH): `audit`, `status`, `start|stop|restart [game|nginx|panel]`,
`logs <servicio> [n]`, `backup`, `backup-list`, `verify-backup <archivo>`, `restore <archivo> --yes`,
`set-domain <dominio> <correo>`, `panel-password`, `update`, `loadtest [opciones]`, `harden-ssh`.

## Rutas públicas (nginx)

- Antes de tener dominio: `http://IP/` → juego (WebSocket en `/ws`). El panel **no** se publica;
  se usa con un túnel SSH: `ssh -L 8090:127.0.0.1:8090 bt-admin@IP` → `http://localhost:8090`.
- Con dominio: `https://game.DOMINIO` → juego; `https://panel.DOMINIO` → panel. HTTP redirige a HTTPS.
- Límites: zona `bt_general` 20 r/s ráfaga 40; `bt_login` 5 r/min en `POST /api/login` del panel;
  `bt_ws` máx. 8 WebSockets simultáneos por IP; tamaño de cuerpo 16 KB en el panel.
