# Lotes Antioquia — Inventario web

Página única que muestra y busca el inventario de inmuebles de **Lotes Antioquia**, alimentado en vivo desde el API externo de CRM RED.

## Cómo funciona (arquitectura)

```
Navegador (index.html)  ──►  /api/inmuebles  (servidor)  ──►  crmred.co
   busca y filtra              guarda las                     API externa
   en el cliente               credenciales                   v1/properties
```

- **`index.html`** — la página pública. Buscador, filtros, tarjetas y ficha de detalle. Solo llama a `/api/inmuebles`, nunca al CRM directamente.
- **`api/inmuebles.js`** — función serverless. Es la única que conoce las credenciales (vía variables de entorno), consulta el CRM, junta todas las páginas, normaliza los datos y los entrega ya limpios. Cachea 5 minutos para no gastar el límite de 60 peticiones/minuto.

> **Por qué no es "todo en una sola página":** si el `X-Api-Secret` viviera en el HTML, cualquiera vería tus credenciales con "ver código fuente". La función serverless las mantiene en el servidor. La experiencia para el visitante **sí** es una sola página.

## Despliegue en Vercel

1. Sube esta carpeta a un repositorio de GitHub (puedes usar arrastrar-y-soltar en github.com).
2. En [vercel.com](https://vercel.com) → **Add New → Project** → importa el repo.
3. Antes de hacer deploy, ve a **Settings → Environment Variables** y agrega:

   | Name             | Value                                    |
   |------------------|------------------------------------------|
   | `CRM_API_KEY`    | `b1638d2e-63c0-4830-b3cc-2e8b3a532c3f`   |
   | `CRM_API_SECRET` | tu secret de CRM RED                     |

4. **Deploy.** Vercel sirve `index.html` en la raíz y `api/inmuebles.js` como función automáticamente. No hay paso de build.

## Antes de publicar — edita 1 dato

En `index.html`, dentro del bloque `CONFIG` (arriba del `<script>`), cambia el número de WhatsApp comercial:

```js
whatsapp: '573000000000',   // ← pon aquí el WhatsApp de Lotes Antioquia
```

## Probar en local (opcional)

```bash
npm i -g vercel
cp .env.example .env        # y pon tu secret real
vercel dev                  # abre http://localhost:3000
```

## Seguridad

- El secret solo vive en variables de entorno del servidor; nunca llega al navegador.
- `.gitignore` evita subir `.env` por accidente.
- **Recomendación:** rota/regenera el `X-Api-Secret` en CRM RED, ya que quedó expuesto en el chat donde se pidió esta página.

## Notas técnicas

- El endpoint `GET /properties` solo pagina (`per_page`, `page`); **no filtra por servidor**. Por eso la función trae todo el inventario y el buscador/filtros se aplican en el navegador, lo que da resultados instantáneos.
- Si el CRM no responde, la página muestra un aviso y unos **lotes de demostración** para que la interfaz no quede vacía.
- Forzar recarga del caché del servidor: `GET /api/inmuebles?refresh=1`.
