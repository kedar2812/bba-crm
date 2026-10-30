#!/usr/bin/env bash
# Deploy BBA to the 20i StackCP host over FTP (see FTP-DEPLOY-GUIDE-FOR-CLAUDE.txt).
#   npm run build                  # builds dist/main and dist/dashboard
#   bash deploy.sh check           # list the FTP root, confirm both domain folders exist
#   bash deploy.sh secrets         # FIRST DEPLOY ONLY: upload the production config
#   bash deploy.sh dashboard       # upload dist/dashboard → /dashboard.bbanetworking.com
#   bash deploy.sh main            # upload dist/main      → /bbanetworking.com
#   bash deploy.sh all             # dashboard then main
# Uploads assets first and HTML last. Never touches other domains' folders, the
# database, sessions, logs, uploads or the live config (they are not in dist/).
set -uo pipefail
FTP_HOST="ftps8.uk.cloudlogin.co"
NETRC="hosting-details/.netrc-deploy"
MAIN_ROOT="${MAIN_ROOT:-/bbanetworking.com}"
DASH_ROOT="${DASH_ROOT:-/dashboard.bbanetworking.com}"
CURL=(curl -s -k --connect-timeout 30 --max-time 120 --ftp-create-dirs --netrc-file "$NETRC")
ok=0; fail=0; failed_list=()

put_file() {
  local lf="$1" rf="$2" a
  rf="${rf// /%20}"
  for a in 1 2 3 4; do
    if "${CURL[@]}" -T "$lf" "ftp://${FTP_HOST}${rf}"; then
      ok=$((ok+1)); printf "  up   %s\n" "$rf"; return 0
    fi
    sleep "$a"
  done
  fail=$((fail+1)); failed_list+=("$rf"); printf "  FAIL %s\n" "$rf"
}

folder_exists() {
  curl -s -k --max-time 60 --netrc-file "$NETRC" -l "ftp://${FTP_HOST}/" | tr -d '\r' | grep -qx "${1#/}"
}

upload_tree() {
  local src="$1" root="$2"
  [ -d "$src" ] || { echo "Missing $src — run npm run build first"; exit 1; }
  folder_exists "$root" || { echo "Remote folder $root does not exist. Add the domain in StackCP first."; exit 1; }
  echo "Uploading $src → $root"
  while IFS= read -r -d '' f; do put_file "$f" "${root}/${f#$src/}"; sleep 0.25; done < <(find "$src" -type f ! -name '*.html' -print0)
  while IFS= read -r -d '' f; do put_file "$f" "${root}/${f#$src/}"; sleep 0.25; done < <(find "$src" -type f -name '*.html' -print0)
}

# Frontend-only redeploy: upload hashed assets the server doesn't have yet, then index.html.
upload_quick() {
  local src="$1" root="$2" remote f
  [ -d "$src" ] || { echo "Missing $src — run npm run build first"; exit 1; }
  remote=$(curl -s -k --max-time 60 --netrc-file "$NETRC" -l "ftp://${FTP_HOST}${root}/assets/" | tr -d '\r')
  echo "Quick upload $src → $root"
  for f in "$src"/assets/*; do
    echo "$remote" | grep -qx "$(basename "$f")" || { put_file "$f" "${root}/assets/$(basename "$f")"; sleep 0.25; }
  done
  put_file "$src/index.html" "${root}/index.html"
}

case "${1:-}" in
  dashboard-quick) upload_quick dist/dashboard "$DASH_ROOT" ;;
  main-quick) upload_quick dist/main "$MAIN_ROOT" ;;
  check)
    echo "FTP root:"; curl -s -k --max-time 60 --netrc-file "$NETRC" -l "ftp://${FTP_HOST}/" | tr -d '\r' | sed 's/^/  /'
    for d in "$MAIN_ROOT" "$DASH_ROOT"; do
      if folder_exists "$d"; then echo "OK      $d exists"; else echo "MISSING $d"; fi
    done ;;
  secrets)
    folder_exists "$DASH_ROOT" || { echo "Remote folder $DASH_ROOT does not exist."; exit 1; }
    put_file hosting-details/config.secrets.production.php "${DASH_ROOT}/api/_private/config.secrets.php" ;;
  dashboard) upload_tree dist/dashboard "$DASH_ROOT" ;;
  main) upload_tree dist/main "$MAIN_ROOT" ;;
  all) upload_tree dist/dashboard "$DASH_ROOT"; upload_tree dist/main "$MAIN_ROOT" ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac

if [ "${1:-}" != "check" ]; then
  echo "uploaded: $ok   failed: $fail"
  if [ "$fail" -gt 0 ]; then printf '  failed: %s\n' "${failed_list[@]}"; exit 1; fi
fi
