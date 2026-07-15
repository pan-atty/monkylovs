# Agenda

App personal de agenda con base local SQLite.

## Iniciar

```bash
npm start
```

Abre:

```text
http://localhost:3000
```

## Guardado actual

Por defecto la app usa:

- `agenda.db` para eventos, notas y lugares.
- `uploads/` para fotos nuevas.
- `backups/auto/` como respaldo automatico reciente.

Esto evita que la app deje de guardar cuando Supabase se pausa.

## Crear respaldo manual

```bash
npm run backup
```

El respaldo queda en `backups/agenda-FECHA/` e incluye:

- copia de `agenda.db`
- exportacion `agenda.json`
- carpeta `uploads/`

## Recuperar datos viejos de Supabase

1. Entra al dashboard de Supabase.
2. Despausa el proyecto.
3. Ejecuta:

```bash
npm run import:supabase
```

Ese comando copia eventos, notas, lugares y fotos desde Supabase hacia la base local.

## Configuracion

Usa `.env.example` como referencia. El archivo `.env` real no debe subirse a GitHub porque contiene llaves privadas.
