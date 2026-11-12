#!/usr/bin/env bash
# Instalador de Balón Turbo para Hetzner CX33 (Ubuntu 24.04). Idempotente.
# Uso: sudo bash deploy/install.sh [--domain midominio.es --email yo@x.es] [--repo URL] [--branch RAMA] [--skip-upgrade]
set -Eeuo pipefail

REPO="https://github.com/s0k1x/Roblox-automatico.git"
BRANCH=""
DOMAIN=""
EMAIL=""
SKIP_UPGRADE=0
INSTALL_DIR="/opt/balon-turbo"
CONF_DIR="/etc/balon-turbo"
LOG_DIR="/var/log/balon-turbo"
FECHA="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/install-$FECHA.log"
AUDIT_FILE="$LOG_DIR/auditoria-$FECHA.txt"
CRED_FILE="/root/balon-turbo-credenciales.txt"
FASE="0 (inicio)"
PANEL_PASS_NUEVA=""
AVISOS=()
RESULTADOS=()
FALLOS=0

# Carpeta del propio script (si se ejecuta desde un clon)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_REPO_DIR="$(dirname "$SCRIPT_DIR")"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:?falta el dominio}"; shift 2 ;;
    --email) EMAIL="${2:?falta el correo}"; shift 2 ;;
    --repo) REPO="${2:?falta la URL}"; shift 2 ;;
    --branch) BRANCH="${2:?falta la rama}"; shift 2 ;;
    --skip-upgrade) SKIP_UPGRADE=1; shift ;;
    -h|--help) sed -n '2,3p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$BRANCH" ]]; then
  BRANCH="$(git -C "$LOCAL_REPO_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  [[ -z "$BRANCH" || "$BRANCH" == "HEAD" ]] && BRANCH="main"
fi

mkdir -p "$LOG_DIR"
chmod 750 "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

trap 'rc=$?; echo; echo "ERROR: la instalación falló en la fase $FASE (línea $LINENO, código $rc). Revisa el log: $LOG_FILE" >&2' ERR

export DEBIAN_FRONTEND=noninteractive
APT_OPTS=(-y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

encabezado() { FASE="$1"; echo; echo "==================== Fase $1 ===================="; }
aviso() { AVISOS+=("$1"); echo "AVISO: $1"; }
prueba() { # prueba "descripción" comando...
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then RESULTADOS+=("OK     $desc"); echo "OK     $desc"
  else RESULTADOS+=("FALLO  $desc"); echo "FALLO  $desc"; FALLOS=$((FALLOS+1)); fi
}
instalar_si_distinto() { # origen destino modo
  if [[ -f "$2" ]] && cmp -s "$1" "$2"; then return 1; fi
  install -D -m "$3" "$1" "$2"
}
repo_file() { echo "$INSTALL_DIR/deploy/$1"; }

# ---------------------------------------------------------------------------
fase1() {
  encabezado "1. Comprobaciones previas"
  [[ $EUID -eq 0 ]] || { echo "Ejecuta como root (sudo)." >&2; exit 1; }
  # shellcheck disable=SC1091
  . /etc/os-release
  [[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] || { echo "Se requiere Ubuntu 24.04 (detectado: ${PRETTY_NAME:-?})." >&2; exit 1; }
  [[ "$(uname -m)" == "x86_64" ]] || { echo "Se requiere arquitectura x86_64." >&2; exit 1; }
  if ! command -v curl >/dev/null 2>&1; then apt-get update -qq; apt-get install "${APT_OPTS[@]}" curl ca-certificates; fi
  curl -fsS --max-time 15 -o /dev/null https://github.com || { echo "Sin conexión a github.com." >&2; exit 1; }
  echo "Todo correcto. Repo: $REPO  Rama: $BRANCH  Dominio: ${DOMAIN:-(ninguno)}"
}

# ---------------------------------------------------------------------------
fase2() {
  encabezado "2. Auditoría del servidor"
  local vendor product cpu vcpu ram_kb ram_gib disk_gb ip4 ip6 diffs=()
  vendor="$(cat /sys/class/dmi/id/sys_vendor 2>/dev/null || echo desconocido)"
  product="$(cat /sys/class/dmi/id/product_name 2>/dev/null || echo desconocido)"
  cpu="$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2- | xargs || true)"
  vcpu="$(nproc)"
  ram_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
  ram_gib="$(awk -v k="$ram_kb" 'BEGIN{printf "%.2f", k/1048576}')"
  disk_gb="$(df -BG --output=size / | tail -1 | tr -dc '0-9')"
  ip4="$(curl -4 -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  ip6="$(curl -6 -fsS --max-time 5 https://api64.ipify.org 2>/dev/null || true)"
  [[ "$ip6" == *:* ]] || ip6="(sin IPv6 pública detectada)"
  {
    echo "Auditoría de servidor - $(date -Is)"
    echo "Fabricante: $vendor"
    echo "Producto: $product"
    echo "--- Metadatos Hetzner ---"
    curl -s --max-time 2 http://169.254.169.254/hetzner/v1/metadata || echo "(no disponibles)"
    echo
    echo "CPU: $cpu"
    echo "vCPU: $vcpu"
    echo "RAM: ${ram_gib} GiB"
    echo "--- Discos ---"
    lsblk
    df -h /
    echo "Kernel: $(uname -r)"
    echo "IPv4 pública: ${ip4:-(no detectada)}"
    echo "IPv6 pública: $ip6"
    echo "--- Puertos en escucha ---"
    ss -tulpn || true
    echo "--- Usuarios con shell ---"
    grep -Ev '(nologin|false)$' /etc/passwd | cut -d: -f1,7 || true
    echo "--- SSH ---"
    sshd -T 2>/dev/null | grep -Ei 'permitrootlogin|passwordauthentication|pubkeyauthentication|port ' || echo "(sshd -T no disponible)"
    echo "--- Swap ---"
    swapon --show || true
    free -h
    echo "--- Paquetes con actualización pendiente ---"
    apt-get update -qq >/dev/null 2>&1 || true
    apt list --upgradable 2>/dev/null | tail -n +2 || true
  } > "$AUDIT_FILE" 2>&1

  [[ "$vcpu" == "4" ]] || diffs+=("vCPU: $vcpu (se esperaban 4)")
  awk -v g="$ram_gib" 'BEGIN{exit !(g>=7.3 && g<=8.3)}' || diffs+=("RAM: ${ram_gib} GiB (se esperaban 7.3-8.3)")
  [[ "${disk_gb:-0}" -ge 70 ]] || diffs+=("Disco raíz: ${disk_gb} GB (se esperaban >= 70)")
  [[ "$vendor" == *Hetzner* ]] || diffs+=("Fabricante: $vendor (se esperaba Hetzner)")
  {
    echo "--- Veredicto CX33 ---"
    if [[ ${#diffs[@]} -eq 0 ]]; then echo "Coincide con CX33"; else printf 'Diferencia: %s\n' "${diffs[@]}"; fi
  } | tee -a "$AUDIT_FILE"
  [[ ${#diffs[@]} -eq 0 ]] || aviso "El servidor no coincide del todo con un CX33 (ver $AUDIT_FILE)."
  PUBLIC_IP="${ip4:-}"
}

# ---------------------------------------------------------------------------
fase3() {
  encabezado "3. Actualización del sistema"
  if [[ $SKIP_UPGRADE -eq 1 ]]; then
    echo "Omitida (--skip-upgrade)."
  else
    apt-get update
    apt-get full-upgrade "${APT_OPTS[@]}"
  fi
  if [[ -f /var/run/reboot-required ]]; then
    aviso "Hace falta reiniciar el servidor (no se ha reiniciado). Hazlo cuando puedas: sudo reboot"
  else
    echo "No hace falta reiniciar."
  fi
}

# ---------------------------------------------------------------------------
fase4() {
  encabezado "4. Dependencias mínimas"
  apt-get update
  apt-get install "${APT_OPTS[@]}" ca-certificates curl git gnupg jq ufw fail2ban nginx certbot \
    python3-certbot-nginx unattended-upgrades apt-listchanges htop sysstat rclone openssl
  if [[ "$(node -v 2>/dev/null || true)" != v22.* ]]; then
    echo "Instalando Node.js 22 (NodeSource)..."
    install -d -m 755 /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update
    apt-get install "${APT_OPTS[@]}" nodejs
  fi
  echo "Node: $(node -v)"
}

# ---------------------------------------------------------------------------
fase5() {
  encabezado "5. Docker"
  if [[ ! -f /etc/apt/sources.list.d/docker.list ]]; then
    install -d -m 755 /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    # shellcheck disable=SC1091
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
    apt-get update
  fi
  apt-get install "${APT_OPTS[@]}" docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  # La configuración de Docker viene del repo (se clona antes si hace falta)
  asegurar_repo
  local cambio=0
  install -d -m 755 /etc/docker
  if instalar_si_distinto "$(repo_file system/docker-daemon.json)" /etc/docker/daemon.json 644; then cambio=1; fi
  systemctl enable docker
  if [[ $cambio -eq 1 ]]; then systemctl restart docker; else systemctl start docker; fi
  if [[ -n "$(ss -tlnp | grep dockerd || true)" ]]; then
    echo "ERROR: dockerd escucha en TCP." >&2; exit 1
  fi
  echo "dockerd no escucha en TCP: correcto."
}

# ---------------------------------------------------------------------------
fase6() {
  encabezado "6. Usuarios"
  # bt-admin NO pertenece al grupo docker: ese grupo equivale a root sin contraseña.
  if ! id bt-admin >/dev/null 2>&1; then
    adduser --disabled-password --gecos "Administrador Balón Turbo" bt-admin
    usermod -aG sudo bt-admin
  fi
  if [[ -f /root/.ssh/authorized_keys ]]; then
    install -d -m 700 -o bt-admin -g bt-admin /home/bt-admin/.ssh
    if ! cmp -s /root/.ssh/authorized_keys /home/bt-admin/.ssh/authorized_keys 2>/dev/null; then
      install -m 600 -o bt-admin -g bt-admin /root/.ssh/authorized_keys /home/bt-admin/.ssh/authorized_keys
    fi
    chmod 700 /home/bt-admin/.ssh; chmod 600 /home/bt-admin/.ssh/authorized_keys
  else
    aviso "No hay /root/.ssh/authorized_keys: añade tu clave SSH a /home/bt-admin/.ssh/authorized_keys."
  fi
  if [[ "$(passwd -S bt-admin | awk '{print $2}')" != "P" ]]; then
    aviso "bt-admin no tiene contraseña: ponla con «passwd bt-admin» para poder usar sudo."
  fi
  id bt-panel >/dev/null 2>&1 || adduser --system --no-create-home --group --shell /usr/sbin/nologin bt-panel
  local tmp; tmp="$(mktemp)"
  cp "$(repo_file system/sudoers-bt-panel)" "$tmp"
  visudo -cf "$tmp"
  install -m 440 -o root -g root "$tmp" /etc/sudoers.d/bt-panel
  rm -f "$tmp"
}

# ---------------------------------------------------------------------------
fase7() {
  encabezado "7. Seguridad"
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  sed -i 's/^IPV6=.*/IPV6=yes/' /etc/default/ufw
  ufw --force enable
  instalar_si_distinto "$(repo_file system/jail.local)" /etc/fail2ban/jail.local 644 || true
  systemctl enable fail2ban
  systemctl restart fail2ban
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOT
  # Solo seguridad y sin reinicio automático (valores por defecto de Ubuntu; se fija el reinicio)
  cat > /etc/apt/apt.conf.d/52balon-turbo-unattended <<'EOT'
Unattended-Upgrade::Automatic-Reboot "false";
EOT
  systemctl enable --now unattended-upgrades
  echo "--- Estado SSH (no se modifica aquí) ---"
  sshd -T 2>/dev/null | grep -Ei 'permitrootlogin|passwordauthentication|pubkeyauthentication' || true
  aviso "SSH sin endurecer: cuando confirmes que entras con bt-admin y tu clave, ejecuta «bt-ctl harden-ssh»."
}

# ---------------------------------------------------------------------------
fase8() {
  encabezado "8. Optimización"
  install -m 644 "$(repo_file system/99-balon-turbo.conf)" /etc/sysctl.d/99-balon-turbo.conf
  sysctl --system >/dev/null
  if [[ -z "$(swapon --show --noheadings)" ]]; then
    if [[ ! -f /swapfile ]]; then
      fallocate -l 2G /swapfile
      chmod 600 /swapfile
      mkswap /swapfile
    fi
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  else
    echo "Ya hay swap activa."
  fi
  install -d -m 755 /etc/systemd/journald.conf.d
  printf '[Journal]\nSystemMaxUse=500M\n' > /etc/systemd/journald.conf.d/bt.conf
  systemctl restart systemd-journald
  install -d -m 755 /etc/systemd/system/nginx.service.d
  printf '[Service]\nLimitNOFILE=65535\n' > /etc/systemd/system/nginx.service.d/bt-limits.conf
  systemctl daemon-reload
  if ! grep -q '^worker_rlimit_nofile' /etc/nginx/nginx.conf; then
    sed -i '0,/^pid /s//worker_rlimit_nofile 65535;\npid /' /etc/nginx/nginx.conf
  fi
  sed -i -E 's/^(\s*)worker_connections\s+[0-9]+;/\1worker_connections 4096;/' /etc/nginx/nginx.conf
  grep -E 'worker_connections|worker_rlimit_nofile' /etc/nginx/nginx.conf
}

# ---------------------------------------------------------------------------
asegurar_repo() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    if [[ -n "$(git -C "$INSTALL_DIR" status --porcelain --untracked-files=no)" ]]; then
      aviso "Hay cambios locales en $INSTALL_DIR: no se actualiza el código."
      return 0
    fi
    git -C "$INSTALL_DIR" fetch --prune origin
    git -C "$INSTALL_DIR" checkout -B "$BRANCH" "origin/$BRANCH"
    git -C "$INSTALL_DIR" reset --hard "origin/$BRANCH"
  else
    [[ -e "$INSTALL_DIR" && -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]] && { echo "$INSTALL_DIR existe y no es un repositorio." >&2; exit 1; }
    git clone --branch "$BRANCH" "$REPO" "$INSTALL_DIR"
  fi
  chown root:root "$INSTALL_DIR"; chmod 755 "$INSTALL_DIR"
}

actualizar_env() { # clave valor (solo si valor no vacío)
  local k="$1" v="$2"
  [[ -n "$v" ]] || return 0
  if grep -q "^$k=" "$CONF_DIR/bt.env"; then
    sed -i "s|^$k=.*|$k=$v|" "$CONF_DIR/bt.env"
  else
    echo "$k=$v" >> "$CONF_DIR/bt.env"
  fi
}

fase9() {
  encabezado "9. Juego (código, datos y contenedor)"
  asegurar_repo
  ln -sf "$INSTALL_DIR/deploy/bin/bt-ctl" /usr/local/sbin/bt-ctl
  chmod 755 "$INSTALL_DIR/deploy/bin/bt-ctl"
  install -d -m 750 -o root -g root "$CONF_DIR"
  chgrp bt-panel "$CONF_DIR"   # el panel necesita entrar para leer sus .env
  if [[ ! -f "$CONF_DIR/bt.env" ]]; then
    cat > "$CONF_DIR/bt.env" <<EOT
DOMAIN=$DOMAIN
EMAIL=$EMAIL
GAME_PORT=3000
STATS_PORT=3001
PANEL_PORT=8090
BACKUP_KEEP=14
BACKUP_REMOTE=
PANEL_ALLOW_IPS=
EOT
  else
    actualizar_env DOMAIN "$DOMAIN"
    actualizar_env EMAIL "$EMAIL"
  fi
  chown root:bt-panel "$CONF_DIR/bt.env"; chmod 640 "$CONF_DIR/bt.env"
  install -d -m 750 -o 1000 -g 1000 /var/lib/balon-turbo/data
  chmod 755 /var/lib/balon-turbo
  install -d -m 700 /var/backups/balon-turbo
  install -d -m 750 -o root -g adm "$LOG_DIR"

  docker compose -f "$INSTALL_DIR/deploy/docker-compose.prod.yml" -p balon-turbo up -d --build
  local i st
  for ((i=0; i<45; i++)); do
    st="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}sin-healthcheck{{end}}' balon-turbo-game 2>/dev/null || echo ausente)"
    [[ "$st" == "healthy" ]] && { echo "Contenedor sano."; return 0; }
    sleep 2
  done
  echo "El contenedor no llegó a estar sano en 90 s (estado: $st)." >&2
  docker logs --tail 40 balon-turbo-game || true
  exit 1
}

# ---------------------------------------------------------------------------
fase10() {
  encabezado "10. Panel"
  if [[ ! -f "$CONF_DIR/panel.env" ]]; then
    local pass secret hash
    pass="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-20)"
    while [[ ${#pass} -lt 20 ]]; do pass="${pass}$(openssl rand -base64 12 | tr -dc 'A-Za-z0-9')"; pass="${pass:0:20}"; done
    secret="$(openssl rand -hex 32)"
    hash="$(PASS="$pass" node -e '
      const c=require("crypto");const s=c.randomBytes(16);
      const h=c.scryptSync(process.env.PASS,s,64,{N:16384,r:8,p:1});
      process.stdout.write("scrypt$"+s.toString("hex")+"$"+h.toString("hex"));')"
    umask 077
    printf 'PANEL_USER=admin\nPANEL_PASS_HASH=%s\nSESSION_SECRET=%s\n' "$hash" "$secret" > "$CONF_DIR/panel.env"
    chown root:bt-panel "$CONF_DIR/panel.env"; chmod 640 "$CONF_DIR/panel.env"
    printf 'Panel de Balón Turbo\nUsuario: admin\nContraseña: %s\n' "$pass" > "$CRED_FILE"
    chmod 600 "$CRED_FILE"
    umask 022
    PANEL_PASS_NUEVA="$pass"
    echo "Credenciales del panel creadas (guardadas en $CRED_FILE)."
  else
    echo "panel.env ya existe: no se toca."
  fi
  local u cambio=0
  for u in bt-panel.service bt-backup.service bt-backup.timer; do
    if instalar_si_distinto "$(repo_file system/$u)" "/etc/systemd/system/$u" 644; then cambio=1; fi
  done
  systemctl daemon-reload
  systemctl enable --now bt-panel.service bt-backup.timer
  [[ $cambio -eq 1 ]] && systemctl restart bt-panel.service
  local i
  for ((i=0; i<15; i++)); do
    curl -fsS --max-time 3 http://127.0.0.1:8090/api/health >/dev/null 2>&1 && { echo "Panel responde."; return 0; }
    sleep 1
  done
  echo "El panel no responde en 127.0.0.1:8090." >&2
  journalctl -u bt-panel -n 30 --no-pager || true
  exit 1
}

# ---------------------------------------------------------------------------
fase11() {
  encabezado "11. Nginx"
  install -m 644 "$(repo_file nginx/bt-common.conf)" /etc/nginx/conf.d/bt-common.conf
  install -m 644 "$(repo_file nginx/balon-turbo-ip.conf)" /etc/nginx/sites-available/balon-turbo-ip.conf
  rm -f /etc/nginx/sites-enabled/default
  ln -sf /etc/nginx/sites-available/balon-turbo-ip.conf /etc/nginx/sites-enabled/balon-turbo-ip.conf
  nginx -t
  systemctl enable nginx
  systemctl restart nginx
  if [[ -n "$DOMAIN" && -n "$EMAIL" ]]; then
    if bt-ctl set-domain "$DOMAIN" "$EMAIL"; then
      echo "Dominio configurado."
    else
      aviso "No se pudo configurar $DOMAIN (normalmente el DNS aún no apunta a ${PUBLIC_IP:-esta IP}). Crea los registros A de game.$DOMAIN y panel.$DOMAIN y repite: bt-ctl set-domain $DOMAIN $EMAIL"
    fi
  fi
}

# ---------------------------------------------------------------------------
fase12() {
  encabezado "12. Copias de seguridad"
  bt-ctl backup
  local ultima
  ultima="$(ls -1t /var/backups/balon-turbo/bt-*.tar.gz 2>/dev/null | head -1 || true)"
  [[ -n "$ultima" ]] || { echo "No se creó ninguna copia." >&2; exit 1; }
  bt-ctl verify-backup "$ultima"
}

# ---------------------------------------------------------------------------
puerto_local() { # puerto: debe escuchar y solo en 127.0.0.1
  local lineas
  lineas="$(ss -tlnH "sport = :$1")"
  [[ -n "$lineas" ]] && ! awk '{print $4}' <<<"$lineas" | grep -qvE '^127\.0\.0\.1:'
}
ws_handshake() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 --http1.1 \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
    -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' http://127.0.0.1/ws || true)"
  [[ "$code" == "101" ]]
}
stats_ok() { curl -fsS --max-time 5 http://127.0.0.1:3001/stats | jq -e . >/dev/null; }
stats_oculto() { [[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1/stats)" == "404" ]]; }
docker_sin_tcp() { ! docker info 2>/dev/null | grep -q 'tcp://'; }
ufw_activo() { ufw status | grep -q 'Status: active'; }

fase13() {
  encabezado "13. Pruebas"
  prueba "Salud del juego a través de nginx (/health)" curl -fsS --max-time 5 http://127.0.0.1/health
  prueba "WebSocket por nginx (101)" ws_handshake
  prueba "Estadísticas internas en JSON (127.0.0.1:3001)" stats_ok
  prueba "Puerto 3000 solo en 127.0.0.1" puerto_local 3000
  prueba "Puerto 3001 solo en 127.0.0.1" puerto_local 3001
  prueba "Puerto 8090 solo en 127.0.0.1" puerto_local 8090
  prueba "Cortafuegos activo" ufw_activo
  prueba "Docker sin escuchar en TCP" docker_sin_tcp
  prueba "/stats no se sirve desde fuera (404)" stats_oculto
  echo
  echo "Resumen de pruebas:"
  printf '  %s\n' "${RESULTADOS[@]}"
  if [[ $FALLOS -gt 0 ]]; then aviso "$FALLOS prueba(s) fallaron: revisa $LOG_FILE"; fi
}

# ---------------------------------------------------------------------------
fase14() {
  encabezado "14. Resumen final"
  local ip="${PUBLIC_IP:-<IP-del-servidor>}"
  echo "IP pública:      $ip"
  if [[ -n "$DOMAIN" ]]; then
    echo "Juego:           https://game.$DOMAIN  (si el dominio no se configuró: http://$ip/)"
    echo "Panel:           https://panel.$DOMAIN"
  else
    echo "Juego:           http://$ip/"
    echo "Panel (túnel):   ssh -L 8090:127.0.0.1:8090 bt-admin@$ip   y abre http://localhost:8090"
  fi
  if [[ -n "$PANEL_PASS_NUEVA" ]]; then
    echo "Panel usuario:   admin"
    echo "Panel contraseña: $PANEL_PASS_NUEVA   (también en $CRED_FILE; anótala y borra el archivo)"
  else
    echo "Panel: credenciales existentes sin cambios (para cambiarlas: bt-ctl panel-password)."
  fi
  if [[ ${#AVISOS[@]} -gt 0 ]]; then
    echo
    echo "Avisos pendientes:"
    printf '  - %s\n' "${AVISOS[@]}"
  fi
  echo
  echo "Informes:"
  echo "  Log de instalación: $LOG_FILE"
  echo "  Auditoría:          $AUDIT_FILE"
  [[ $FALLOS -eq 0 ]] && echo "Instalación completada." || echo "Instalación completada con $FALLOS prueba(s) fallida(s)."
}

PUBLIC_IP=""
fase1
fase2
fase3
fase4
fase5
fase6
fase7
fase8
fase9
fase10
fase11
fase12
fase13
fase14
