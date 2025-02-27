docker run -d \
  --name t3vo-relay \
  --restart unless-stopped \
  -p 57303:57303 \
  ghcr.io/t3volabs/relay:main
