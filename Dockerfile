FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8080
ENV NODE_ENV=production
CMD ["node", "server.js"]
```

#### **File 21: `backend/.gcloudignore`**
```
.git
.gitignore
node_modules/
npm-debug.log
.env
.env.*
*.md
.vscode/
test/
