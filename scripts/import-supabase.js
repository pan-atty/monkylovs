require("dotenv").config();

const path = require("path");
const fs = require("fs/promises");
const sqlite3 = require("sqlite3").verbose();
const { createClient } = require("@supabase/supabase-js");

const root = path.join(__dirname, "..");
const dbPath = path.join(root, "agenda.db");
const uploadsPath = path.join(root, "uploads");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Falta SUPABASE_URL o SUPABASE_KEY en .env");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false
    }
});

const db = new sqlite3.Database(dbPath);

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(error) {
            if (error) reject(error);
            else resolve(this);
        });
    });
}

function cerrarDb() {
    return new Promise((resolve, reject) => {
        db.close(error => {
            if (error) reject(error);
            else resolve();
        });
    });
}

async function inicializarBaseLocal() {
    await dbRun(`
        CREATE TABLE IF NOT EXISTS eventos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha TEXT,
            hora TEXT,
            lugar TEXT,
            actividad TEXT,
            otros TEXT
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS fotos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            imagen TEXT,
            fecha TEXT,
            lugar TEXT
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS notas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario TEXT,
            mensaje TEXT,
            creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS lugares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT,
            visitado INTEGER DEFAULT 0
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS flores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cantidad INTEGER DEFAULT 1,
            fecha TEXT,
            nota TEXT,
            creado_por TEXT,
            creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS retos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titulo TEXT,
            recompensa TEXT,
            creado_por TEXT,
            reclamado INTEGER DEFAULT 0,
            reclamado_por TEXT,
            reclamado_en TIMESTAMP,
            creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await dbRun(`
        CREATE TABLE IF NOT EXISTS reto_objetivos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reto_id INTEGER,
            descripcion TEXT,
            completado INTEGER DEFAULT 0,
            completado_en TIMESTAMP,
            FOREIGN KEY (reto_id) REFERENCES retos(id) ON DELETE CASCADE
        )
    `);
}

async function consultarTabla(tabla) {
    const { data, error } = await supabase
        .from(tabla)
        .select("*");

    if (error) throw error;
    return data || [];
}

function extensionDesdeUrl(url) {
    try {
        const pathname = new URL(url).pathname;
        const extension = path.extname(pathname);
        return extension || ".jpg";
    } catch (error) {
        return ".jpg";
    }
}

async function descargarFotoSiSePuede(foto) {
    const url = foto.url || foto.imagen || "";

    if (!url || !url.startsWith("http")) {
        return url;
    }

    try {
        await fs.mkdir(uploadsPath, { recursive: true });

        const respuesta = await fetch(url);
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

        const extension = extensionDesdeUrl(url);
        const nombre = `importada-${foto.id || Date.now()}${extension}`;
        const destino = path.join(uploadsPath, nombre);
        const buffer = Buffer.from(await respuesta.arrayBuffer());

        await fs.writeFile(destino, buffer);
        return `/uploads/${nombre}`;
    } catch (error) {
        console.log(`No se pudo descargar foto ${foto.id || ""}: ${error.message}`);
        return url;
    }
}

async function importarEventos() {
    const eventos = await consultarTabla("eventos");

    for (const evento of eventos) {
        await dbRun(
            `INSERT OR REPLACE INTO eventos (id, fecha, hora, lugar, actividad, otros)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                evento.id,
                evento.fecha || "",
                evento.hora || "",
                evento.lugar || "",
                evento.actividad || "",
                evento.otros || ""
            ]
        );
    }

    console.log(`Eventos importados: ${eventos.length}`);
}

async function importarNotas() {
    const notas = await consultarTabla("notas");

    for (const nota of notas) {
        await dbRun(
            `INSERT OR REPLACE INTO notas (id, usuario, mensaje, creado_en)
             VALUES (?, ?, ?, ?)`,
            [
                nota.id,
                nota.usuario || "",
                nota.mensaje || "",
                nota.creado_en || new Date().toISOString()
            ]
        );
    }

    console.log(`Notas importadas: ${notas.length}`);
}

async function importarLugares() {
    const lugares = await consultarTabla("lugares");

    for (const lugar of lugares) {
        await dbRun(
            `INSERT OR REPLACE INTO lugares (id, nombre, visitado)
             VALUES (?, ?, ?)`,
            [
                lugar.id,
                lugar.nombre || "",
                lugar.visitado === true || lugar.visitado === 1 ? 1 : 0
            ]
        );
    }

    console.log(`Lugares importados: ${lugares.length}`);
}

async function importarFotos() {
    const fotos = await consultarTabla("fotos");

    for (const foto of fotos) {
        const imagen = await descargarFotoSiSePuede(foto);

        await dbRun(
            `INSERT OR REPLACE INTO fotos (id, imagen, fecha, lugar)
             VALUES (?, ?, ?, ?)`,
            [
                foto.id,
                imagen || "",
                foto.fecha || "",
                foto.lugar || ""
            ]
        );
    }

    console.log(`Fotos importadas: ${fotos.length}`);
}

async function importarFlores() {
    const flores = await consultarTabla("flores");

    for (const flor of flores) {
        await dbRun(
            `INSERT OR REPLACE INTO flores
             (id, cantidad, fecha, nota, creado_por, creado_en)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                flor.id,
                Number(flor.cantidad) || 1,
                flor.fecha || "",
                flor.nota || "",
                flor.creado_por || "",
                flor.creado_en || new Date().toISOString()
            ]
        );
    }

    console.log(`Flores importadas: ${flores.length}`);
}

async function importarRetos() {
    const retos = await consultarTabla("retos");

    for (const reto of retos) {
        await dbRun(
            `INSERT OR REPLACE INTO retos
             (id, titulo, recompensa, creado_por, reclamado, reclamado_por, reclamado_en, creado_en)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                reto.id,
                reto.titulo || "",
                reto.recompensa || "",
                reto.creado_por || "",
                reto.reclamado === true || reto.reclamado === 1 ? 1 : 0,
                reto.reclamado_por || "",
                reto.reclamado_en || null,
                reto.creado_en || new Date().toISOString()
            ]
        );
    }

    console.log(`Retos importados: ${retos.length}`);
}

async function importarObjetivosRetos() {
    const objetivos = await consultarTabla("reto_objetivos");

    for (const objetivo of objetivos) {
        await dbRun(
            `INSERT OR REPLACE INTO reto_objetivos
             (id, reto_id, descripcion, completado, completado_en)
             VALUES (?, ?, ?, ?, ?)`,
            [
                objetivo.id,
                objetivo.reto_id,
                objetivo.descripcion || "",
                objetivo.completado === true || objetivo.completado === 1 ? 1 : 0,
                objetivo.completado_en || null
            ]
        );
    }

    console.log(`Objetivos de retos importados: ${objetivos.length}`);
}

async function main() {
    await inicializarBaseLocal();
    await importarEventos();
    await importarNotas();
    await importarLugares();
    await importarFotos();
    await importarFlores();
    await importarRetos();
    await importarObjetivosRetos();
    console.log("Importacion desde Supabase terminada.");
}

main()
    .catch(error => {
        console.error("No se pudo importar desde Supabase:", error.message);
        process.exitCode = 1;
    })
    .finally(cerrarDb);
