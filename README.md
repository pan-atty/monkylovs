# Agenda

App personal de agenda conectada a Supabase y publicada en Render:

```text
https://monkylovs.onrender.com/index.html
```

## Iniciar local

```bash
npm start
```

Abre:

```text
http://localhost:3000
```

## Guardado actual

En Render la app usa Supabase como base compartida, para que funcione desde ciudades diferentes.

En local puede usar SQLite como respaldo si `DATA_SOURCE=auto` y Supabase falla:

- `agenda.db` para eventos, notas y lugares locales.
- `uploads/` para fotos locales.
- `backups/auto/` como respaldo local reciente.

## Heartbeat gratis

GitHub Actions ejecuta `.github/workflows/keepalive.yml` los lunes, miercoles y viernes.

Ese workflow llama:

```text
https://monkylovs.onrender.com/mantenimiento/keepalive
```

El endpoint consulta las tablas de Supabase sin exponer los datos. Esto ayuda a evitar que Supabase pause el proyecto gratis por inactividad.

Si quieres proteger el endpoint con token:

1. Configura `MAINTENANCE_TOKEN` en Render.
2. Configura el mismo valor como secret `MAINTENANCE_TOKEN` en GitHub.

## Backups gratis

GitHub Actions ejecuta `.github/workflows/backup-supabase.yml` todos los dias.

El backup crea un artifact descargable por 90 dias con:

- `agenda-supabase.json`, todo en un solo archivo.
- `eventos.json`, `fotos.json`, `notas.json`, `lugares.json`.
- carpeta `fotos/` con las imagenes que se pudieron descargar.
- `schema.sql` para reconstruir tablas basicas.
- `manifest.json` con conteos y fecha.

Para que el backup funcione, agrega estos secrets en GitHub:

```text
SUPABASE_URL
SUPABASE_KEY
```

El valor recomendado para `SUPABASE_KEY` es una llave con permiso de lectura sobre las tablas y las fotos.

## Crear backup manual local

Para respaldar la base SQLite local:

```bash
npm run backup
```

Para respaldar Supabase desde tu computadora:

```bash
npm run backup:supabase
```

## Recuperar datos viejos de Supabase hacia SQLite

1. Entra al dashboard de Supabase.
2. Despausa el proyecto.
3. Ejecuta:

```bash
npm run import:supabase
```

## Configuracion

Usa `.env.example` como referencia. El archivo `.env` real no debe subirse a GitHub porque contiene llaves privadas.
