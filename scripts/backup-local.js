require("dotenv").config();

const path = require("path");
const fs = require("fs/promises");
const sqlite3 = require("sqlite3").verbose();

const root = path.join(__dirname, "..");
const dbPath = path.join(root, "agenda.db");
const uploadsPath = path.join(root, "uploads");
const backupsPath = path.join(root, "backups");

function timestamp() {
    return new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .replace("T", "_")
        .replace("Z", "");
}

function abrirDb() {
    return new sqlite3.Database(dbPath);
}

function dbAll(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) reject(error);
            else resolve(rows);
        });
    });
}

function cerrarDb(db) {
    return new Promise((resolve, reject) => {
        db.close(error => {
            if (error) reject(error);
            else resolve();
        });
    });
}

async function copiarDirectorio(origen, destino) {
    try {
        await fs.cp(origen, destino, {
            recursive: true,
            force: true
        });
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        await fs.mkdir(destino, { recursive: true });
    }
}

async function main() {
    const nombre = `agenda-${timestamp()}`;
    const destino = path.join(backupsPath, nombre);
    const db = abrirDb();

    await fs.mkdir(destino, { recursive: true });

    try {
        const datos = {
            creado_en: new Date().toISOString(),
            eventos: await dbAll(db, "SELECT * FROM eventos ORDER BY fecha ASC, hora ASC, id ASC"),
            fotos: await dbAll(db, "SELECT * FROM fotos ORDER BY id ASC"),
            notas: await dbAll(db, "SELECT * FROM notas ORDER BY creado_en ASC, id ASC"),
            lugares: await dbAll(db, "SELECT * FROM lugares ORDER BY id ASC")
        };

        await fs.copyFile(dbPath, path.join(destino, "agenda.db"));
        await fs.writeFile(
            path.join(destino, "agenda.json"),
            JSON.stringify(datos, null, 2),
            "utf8"
        );
        await copiarDirectorio(uploadsPath, path.join(destino, "uploads"));

        console.log(`Respaldo creado: ${destino}`);
    } finally {
        await cerrarDb(db);
    }
}

main().catch(error => {
    console.error("No se pudo crear el respaldo:", error.message);
    process.exit(1);
});
