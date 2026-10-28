# Mercados CR

App web instalable (PWA) para el celular:

- **Tipo de Cambio CR:** compra y venta de ventanilla de Banco Nacional, Banco Popular, BAC Credomatic y Ari Casa de Cambio, tomadas del cuadro 1015 del BCCR. Incluye un convertidor de dólares a colones.
- **S&P 500 (.INX):** valor actual, cambio del día y gráfico de 1D, 5D, 1M, 6M, 1Y y 5Y en hora de Costa Rica. Abajo: cierre anterior, apertura, mínimo y máximo.

Solo consulta cuando tocas **«Actualizar / Consultar datos»**, y una vez al abrir. Cada consulta trae las dos vistas al mismo tiempo. No hace nada en segundo plano.

## Archivos
- `index.html`: la app.
- `api/fx.js`: lee el tipo de cambio del BCCR.
- `api/spx.js`: lee el S&P 500 de Yahoo Finance.
- `manifest.webmanifest`, `sw.js`, `icon-*.png`: hacen que Chrome la pueda instalar.
- `vercel.json`: configuración de Vercel.

## Publicar en Vercel (desde el celular)
1. Sube esta carpeta a un repositorio de GitHub.
2. Entra en vercel.com con tu cuenta de GitHub, toca **Add New → Project**, elige el repositorio y toca **Deploy**. No hace falta cambiar nada.
3. Abre en Chrome el link que te da Vercel (algo como `mercados-cr.vercel.app`). Toca el menú ⋮ y luego **Instalar app** (o **Agregar a pantalla principal**).
