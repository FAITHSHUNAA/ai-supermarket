#!/bin/sh
set -eu
domain=${1:?请传入已解析到本机的域名}
case "$domain" in ""|*[!a-zA-Z0-9.-]*|-*) echo "域名格式无效" >&2; exit 2;; esac
site=/etc/nginx/sites-available/ai-supermarket
backup=$(mktemp -d /root/market-tls-XXXXXX)
cp "$site" "$backup/nginx.conf"
override=/etc/systemd/system/ai-supermarket.service.d/https.conf
if [ -f "$override" ]; then cp "$override" "$backup/https.conf"; fi
restore() {
  cp "$backup/nginx.conf" "$site"
  if [ -f "$backup/https.conf" ]; then cp "$backup/https.conf" "$override"; else rm -f "$override"; fi
  nginx -t && systemctl reload nginx
  systemctl daemon-reload && systemctl restart ai-supermarket
}
trap 'restore' EXIT
sed -i "s/server_name 8\.162\.15\.119;/server_name $domain;/" "$site"
nginx -t
systemctl reload nginx
certbot --nginx --redirect --non-interactive --agree-tos --register-unsafely-without-email -d "$domain"
mkdir -p "$(dirname "$override")"
printf '[Service]\nEnvironment=PUBLIC_ORIGIN=https://%s\n' "$domain" > "$override"
systemctl daemon-reload
systemctl restart ai-supermarket
curl --retry 4 --retry-connrefused --fail --silent --show-error "https://$domain/v1/health"
trap - EXIT
