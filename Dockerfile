FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

# Copy the rest of your app
COPY . .

# Set DATABASE_URL build arg for Prisma
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# Generate Prisma client inside Docker
RUN npx prisma generate

EXPOSE 5000

CMD ["node", "app.js"]
