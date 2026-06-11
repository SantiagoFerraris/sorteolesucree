# Sorteo Instagram — Deploy en Vercel

## Estructura del proyecto

```
sorteo-ig/
├── api/
│   └── comments.js      ← Serverless function (scraping)
├── public/
│   └── index.html       ← Frontend de la app
└── vercel.json          ← Configuración de rutas
```

## Deploy en Vercel

### Opción A — Vercel CLI (recomendado)

```bash
# Instalar Vercel CLI si no lo tenés
npm i -g vercel

# Desde la carpeta del proyecto
cd sorteo-ig
vercel

# Seguí los pasos del wizard:
# - Set up and deploy? Y
# - Which scope? (tu cuenta)
# - Link to existing project? N
# - Project name: sorteo-ig (o el que quieras)
# - In which directory is your code? ./
# - Want to override settings? N
```

### Opción B — GitHub + Vercel Dashboard

1. Subí la carpeta `sorteo-ig` a un repositorio de GitHub
2. Entrá a vercel.com → New Project → importá el repo
3. Vercel detecta la configuración automáticamente
4. Click en Deploy

---

## Cómo funciona

- El frontend (`public/index.html`) llama a `/api/comments?url=<link>`
- La serverless function (`api/comments.js`) hace el scraping del lado del servidor, evitando CORS
- Instagram devuelve los comentarios y se muestran automáticamente

## ⚠️ Limitaciones

- Solo funciona con publicaciones **públicas**
- Instagram puede bloquear requests temporalmente (rate limiting)
- Si Instagram cambia su API interna, puede dejar de funcionar
- No usa la API oficial de Meta (no requiere tokens ni aprobación)
