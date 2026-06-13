# GEAR dashboard - immagine minima, nessuna dipendenza npm
FROM node:20-alpine
WORKDIR /app

# Solo i file dell'app entrano nell'immagine.
# Prima le dipendenze (layer cacheabile), poi il codice
COPY package.json ./
RUN npm install --omit=dev

# I DATI (richieste.json, smtp-config.json) restano sul volume montato da C:\gear-data -> /data
COPY server.js index.html ./

EXPOSE 80
CMD ["node", "server.js"]
