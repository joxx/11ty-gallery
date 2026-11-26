#!/usr/bin/env bash
# Lädt den gebauten Ordner per lftp auf den Webspace.
# Konfiguration: deploy.env im Projektordner (Vorlage: deploy.env.example)
# oder Umgebungsvariablen. Die Umgebung hat Vorrang.
set -u

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
PROGRAMM=${LFTP_BIN:-lftp}
TROCKENLAUF=0
NUR_CONFIG=0

usage() {
  cat <<'EOF'
Aufruf: scripts/deploy.sh [--dry-run] [--print-config]

  --dry-run       zeigen, was übertragen würde; nichts ändern
  --print-config  aufgelöste Konfiguration und geplantes lftp-Kommando zeigen,
                  ohne zu übertragen (Passwort bleibt maskiert)
  --help, -h      diese Hilfe

Konfiguration aus deploy.env im Projektordner oder aus der Umgebung;
Variablen, die schon gesetzt sind, werden von der Datei nicht überschrieben.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) TROCKENLAUF=1 ;;
    --print-config) NUR_CONFIG=1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "deploy.sh: unbekannte Option: $1" >&2; usage >&2; exit 1 ;;
  esac
  shift
done

ENV_DATEI=${DEPLOY_ENV_FILE:-$REPO_ROOT/deploy.env}
if [ -f "$ENV_DATEI" ]; then
  while IFS='=' read -r schluessel wert; do
    case "$schluessel" in ''|\#*) continue ;; esac
    if ! printenv "$schluessel" >/dev/null 2>&1; then
      export "$schluessel=$wert"
    fi
  done < "$ENV_DATEI"
fi

fehlt() {
  echo "deploy.sh: $1 fehlt (deploy.env oder Umgebung)." >&2
  exit 1
}

[ -n "${DEPLOY_HOST:-}" ] || fehlt DEPLOY_HOST
[ -n "${DEPLOY_USER:-}" ] || fehlt DEPLOY_USER
[ -n "${DEPLOY_PATH:-}" ] || fehlt DEPLOY_PATH
if [ -z "${DEPLOY_PASSWORD:-}" ] && [ -z "${DEPLOY_SSH_KEY:-}" ]; then
  fehlt DEPLOY_PASSWORD
fi

PROTOKOLL=${DEPLOY_PROTOCOL:-sftp}
case "$PROTOKOLL" in
  sftp|ftp|ftps) ;;
  *)
    echo "deploy.sh: unbekanntes Protokoll: $PROTOKOLL (erlaubt: sftp, ftp, ftps)" >&2
    exit 1
    ;;
esac

QUELLE=${DEPLOY_SOURCE:-_site}
case "$QUELLE" in
  /*) ;;
  *) QUELLE="$REPO_ROOT/$QUELLE" ;;
esac
if [ ! -d "$QUELLE" ]; then
  echo "deploy.sh: Quelle $QUELLE fehlt. Erst bauen: npm run build" >&2
  exit 1
fi

if [ -n "${DEPLOY_PORT:-}" ]; then
  PORT=$DEPLOY_PORT
elif [ "$PROTOKOLL" = "sftp" ]; then
  PORT=22
else
  PORT=21
fi

URL="$PROTOKOLL://$DEPLOY_HOST:$PORT$DEPLOY_PATH"

OPTIONEN=(--reverse --parallel=4 --verbose=1 --no-perms --exclude-glob=.DS_Store)
[ "${DEPLOY_DELETE:-0}" = "1" ] && OPTIONEN+=(--delete)
[ "$TROCKENLAUF" = "1" ] && OPTIONEN+=(--dry-run)

BEFEHLE="set cmd:fail-exit yes; set net:max-retries 1;"
if [ -n "${DEPLOY_SSH_KEY:-}" ]; then
  BEFEHLE+=" set sftp:connect-program \"ssh -a -x -i $DEPLOY_SSH_KEY\";"
fi
BEFEHLE+=" mirror ${OPTIONEN[*]} \"$QUELLE\" .; bye"

if [ "$NUR_CONFIG" = "1" ]; then
  echo "DEPLOY_PROTOCOL=\"$PROTOKOLL\""
  echo "DEPLOY_HOST=\"$DEPLOY_HOST\""
  echo "DEPLOY_PORT=\"$PORT\""
  echo "DEPLOY_USER=\"$DEPLOY_USER\""
  echo "DEPLOY_PASSWORD=***"
  echo "DEPLOY_PATH=\"$DEPLOY_PATH\""
  echo "DEPLOY_SOURCE=\"$QUELLE\""
  echo "DEPLOY_DELETE=\"${DEPLOY_DELETE:-0}\""
  if [ -n "${DEPLOY_SSH_KEY:-}" ]; then
    echo "DEPLOY_SSH_KEY=\"***\""
  else
    echo "DEPLOY_SSH_KEY=\"\""
  fi
  echo "DEPLOY_ENV_FILE=\"$ENV_DATEI\""
  if [ "$TROCKENLAUF" = "1" ]; then
    echo "Trockenlauf: ja"
  else
    echo "Trockenlauf: nein"
  fi
  echo "Kommando: $PROGRAMM -u $DEPLOY_USER $URL -e \"$BEFEHLE\""
  exit 0
fi

if ! command -v "$PROGRAMM" >/dev/null 2>&1; then
  echo "deploy.sh: lftp fehlt. macOS: brew install lftp, Debian/Ubuntu: apt-get install lftp" >&2
  exit 1
fi

HINWEIS=""
[ "$TROCKENLAUF" = "1" ] && HINWEIS=" (Trockenlauf)"
echo "deploy.sh: lädt $QUELLE nach $URL$HINWEIS"

if [ -n "${DEPLOY_PASSWORD:-}" ]; then
  LFTP_PASSWORD="$DEPLOY_PASSWORD" "$PROGRAMM" --env-password -u "$DEPLOY_USER" "$URL" -e "$BEFEHLE"
else
  "$PROGRAMM" -u "$DEPLOY_USER" "$URL" -e "$BEFEHLE"
fi
