# Landing estático de SmartSupply (smartsupply.mx) — servido por nginx.
FROM nginx:1.27-alpine

# Página
COPY index.html /usr/share/nginx/html/index.html

# Config mínima: gzip + cache de estáticos + fallback a index.
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
