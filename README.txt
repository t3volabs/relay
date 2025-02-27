docker run -d \
  --name t3vo-relay \
  --restart unless-stopped \
  -p 7303:7303 \
  ghcr.io/t3volabs/relay:main
