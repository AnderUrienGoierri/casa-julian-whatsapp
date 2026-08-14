# =========================================================
# DOCKERFILE - CASA JULIÁN TOLOSA WHATSAPP BOT & ADMIN CMS
# =========================================================
FROM node:20-alpine

# Definir directorio de trabajo
WORKDIR /app

# Instalar dependencias primero para aprovechar el cache de Docker
COPY package*.json ./
RUN npm install --omit=dev

# Copiar el código fuente completo
COPY . .

# Exponer el puerto del servidor (3000)
EXPOSE 3000

# Variables de entorno por defecto
ENV PORT=3000
ENV NODE_ENV=production

# Comando de arranque del servidor
CMD ["node", "server.js"]
