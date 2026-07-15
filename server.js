require("dotenv").config();

const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const express = require("express");
const multer = require("multer");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();
const { createClient } = require("@supabase/supabase-js");

const app = express();

const PORT = process.env.PORT || 3000;
const DATA_SOURCE = (process.env.DATA_SOURCE || "auto").toLowerCase();
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const SUPABASE_PUBLIC_KEY =
    process.env.SUPABASE_PUBLIC_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    "";
const SUPABASE_RETRY_MS = Number(process.env.SUPABASE_RETRY_MS || 60000);

const uploadsDir = path.join(__dirname, "uploads");
const autoBackupDir = path.join(__dirname, "backups", "auto");
fs.mkdirSync(uploadsDir, { recursive: true });

let supabase = null;
let supabaseDisabledUntil = 0;

if (SUPABASE_URL && SUPABASE_KEY && DATA_SOURCE !== "sqlite") {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });
} else if (DATA_SOURCE === "supabase") {
    console.error("ERROR: DATA_SOURCE=supabase requiere SUPABASE_URL y SUPABASE_KEY en .env");
    process.exit(1);
}

const db = new sqlite3.Database(path.join(__dirname, "agenda.db"));

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(error) {
            if (error) {
                reject(error);
            } else {
                resolve({
                    id: this.lastID,
                    changes: this.changes
                });
            }
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) {
                reject(error);
            } else {
                resolve(rows);
            }
        });
    });
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) {
                reject(error);
            } else {
                resolve(row);
            }
        });
    });
}

let backupTimer = null;

function programarRespaldoAutomatico() {
    clearTimeout(backupTimer);

    backupTimer = setTimeout(async () => {
        try {
            await fsp.mkdir(autoBackupDir, { recursive: true });
            await fsp.copyFile(
                path.join(__dirname, "agenda.db"),
                path.join(autoBackupDir, "agenda.db")
            );
            await fsp.cp(
                uploadsDir,
                path.join(autoBackupDir, "uploads"),
                {
                    recursive: true,
                    force: true
                }
            );
            await fsp.writeFile(
                path.join(autoBackupDir, "manifest.json"),
                JSON.stringify({ creado_en: new Date().toISOString() }, null, 2),
                "utf8"
            );
        } catch (error) {
            console.log("No se pudo crear el respaldo automatico:", error.message);
        }
    }, 2000);
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
}

function describirError(error) {
    if (!error) return "Error desconocido";

    return [
        error.message,
        error.details,
        error.hint,
        error.code,
        error.status ? `status ${error.status}` : "",
        error.name
    ]
        .filter(Boolean)
        .join(" | ") || String(error);
}

function detalleAmigable(error) {
    const texto = describirError(error).toLowerCase();

    if (texto.includes("paused") || texto.includes("suspended")) {
        return "El proyecto de Supabase está pausado. La app intentará usar la base local.";
    }

    if (
        texto.includes("fetch failed") ||
        texto.includes("failed to fetch") ||
        texto.includes("network")
    ) {
        return "No se pudo conectar con Supabase. La app intentará usar la base local.";
    }

    return "Revisa la consola del servidor para ver el detalle técnico.";
}

function deberiaUsarSupabase() {
    if (!supabase || DATA_SOURCE === "sqlite") return false;
    if (DATA_SOURCE !== "auto") return true;

    return Date.now() >= supabaseDisabledUntil;
}

function registrarFalloSupabase(operacion, error) {
    console.log(
        `Supabase no disponible en "${operacion}". Usando SQLite local.`,
        describirError(error)
    );

    if (DATA_SOURCE === "auto") {
        supabaseDisabledUntil = Date.now() + SUPABASE_RETRY_MS;
    }
}

async function datosConFallback(operacion, supabaseFn, sqliteFn) {
    if (deberiaUsarSupabase()) {
        try {
            const resultado = await supabaseFn();
            if (resultado && resultado.error) throw resultado.error;
            return resultado && "data" in resultado ? resultado.data : resultado;
        } catch (error) {
            if (DATA_SOURCE === "supabase") throw error;
            registrarFalloSupabase(operacion, error);
        }
    }

    return sqliteFn();
}

async function ejecutarConFallback(operacion, supabaseFn, sqliteFn) {
    if (deberiaUsarSupabase()) {
        try {
            const resultado = await supabaseFn();
            if (resultado && resultado.error) throw resultado.error;
            return resultado && "data" in resultado ? resultado.data : resultado;
        } catch (error) {
            if (DATA_SOURCE === "supabase") throw error;
            registrarFalloSupabase(operacion, error);
        }
    }

    return sqliteFn();
}

function limpiarTexto(valor) {
    return typeof valor === "string" ? valor.trim() : "";
}

function validarId(id) {
    const numero = Number(id);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function validarCampos(res, campos) {
    const faltantes = Object.entries(campos)
        .filter(([, valor]) => !limpiarTexto(valor))
        .map(([nombre]) => nombre);

    if (faltantes.length > 0) {
        res.status(400).json({
            mensaje: `Falta llenar: ${faltantes.join(", ")}`
        });
        return false;
    }

    return true;
}

function responderError(res, operacion, mensaje, error) {
    console.log(`ERROR ${operacion}:`, describirError(error));

    res.status(500).json({
        mensaje,
        detalle: detalleAmigable(error)
    });
}

function limpiarNombreArchivo(nombre) {
    return nombre
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9.\-_]/g, "");
}

async function eliminarArchivoLocal(url) {
    if (!url || !url.startsWith("/uploads/")) return;

    const nombreArchivo = path.basename(url);
    await fsp.rm(path.join(uploadsDir, nombreArchivo), {
        force: true
    });
}

app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || "agenda_secreta_michel",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production"
    }
}));

app.use("/uploads", express.static(uploadsDir));
app.use((req, res, next) => {
    if (
        req.path === "/" ||
        req.path.endsWith(".html") ||
        req.path.endsWith(".js") ||
        req.path === "/sw.js"
    ) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
    }

    next();
});
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 20 * 1024 * 1024
    }
});

const usuarios = [
    { usuario: "michel", password: "2006" },
    { usuario: "len", password: "9393" }
];

function protegerRuta(req, res, next) {
    if (req.session.usuario) {
        next();
    } else {
        res.status(401).json({
            mensaje: "No autorizado"
        });
    }
}

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        version: "agenda-auto-2026-07-15",
        dataSource: DATA_SOURCE,
        supabaseConfigurado: Boolean(supabase),
        supabaseEnPausaLocal: DATA_SOURCE === "auto" && Date.now() < supabaseDisabledUntil
    });
});

app.get("/configuracion-publica", protegerRuta, (req, res) => {
    res.json({
        supabaseUrl: SUPABASE_PUBLIC_KEY && SUPABASE_URL ? SUPABASE_URL : "",
        supabaseKey: SUPABASE_PUBLIC_KEY
    });
});

app.post("/login", (req, res) => {
    const { usuario, password } = req.body;
    const usuarioLimpio = limpiarTexto(usuario).toLowerCase();

    const encontrado = usuarios.find(
        user => user.usuario === usuarioLimpio && user.password === password
    );

    if (encontrado) {
        req.session.usuario = encontrado.usuario;

        res.json({
            acceso: true,
            mensaje: "Bienvenido ❤️"
        });
    } else {
        res.json({
            acceso: false,
            mensaje: "Usuario o contraseña incorrectos"
        });
    }
});

app.get("/verificar", (req, res) => {
    if (req.session.usuario) {
        res.json({
            logueado: true,
            usuario: req.session.usuario
        });
    } else {
        res.json({
            logueado: false
        });
    }
});

app.post("/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({
            mensaje: "Sesión cerrada"
        });
    });
});

app.post("/guardar", protegerRuta, async (req, res) => {
    const evento = {
        fecha: limpiarTexto(req.body.fecha),
        hora: limpiarTexto(req.body.hora),
        lugar: limpiarTexto(req.body.lugar),
        actividad: limpiarTexto(req.body.actividad),
        otros: limpiarTexto(req.body.otros)
    };

    if (!validarCampos(res, {
        fecha: evento.fecha,
        hora: evento.hora,
        lugar: evento.lugar,
        actividad: evento.actividad
    })) return;

    try {
        await ejecutarConFallback(
            "guardar evento",
            () => supabase.from("eventos").insert([evento]),
            () => dbRun(
                `INSERT INTO eventos (fecha, hora, lugar, actividad, otros)
                 VALUES (?, ?, ?, ?, ?)`,
                [evento.fecha, evento.hora, evento.lugar, evento.actividad, evento.otros]
            )
        );

        programarRespaldoAutomatico();

        res.json({
            mensaje: "Evento guardado correctamente"
        });
    } catch (error) {
        responderError(res, "GUARDAR EVENTO", "Error al guardar evento", error);
    }
});

app.get("/eventos", protegerRuta, async (req, res) => {
    try {
        const eventos = await datosConFallback(
            "cargar eventos",
            () => supabase
                .from("eventos")
                .select("*")
                .order("fecha", { ascending: true })
                .order("hora", { ascending: true }),
            () => dbAll(
                `SELECT id, fecha, hora, lugar, actividad, otros
                 FROM eventos
                 ORDER BY fecha ASC, hora ASC`
            )
        );

        res.json(eventos || []);
    } catch (error) {
        responderError(res, "OBTENER EVENTOS", "Error al obtener eventos", error);
    }
});

app.delete("/eliminar/:id", protegerRuta, async (req, res) => {
    const id = validarId(req.params.id);

    if (!id) {
        return res.status(400).json({
            mensaje: "Id de evento inválido"
        });
    }

    try {
        await ejecutarConFallback(
            "eliminar evento",
            () => supabase.from("eventos").delete().eq("id", id),
            () => dbRun("DELETE FROM eventos WHERE id = ?", [id])
        );

        programarRespaldoAutomatico();

        res.json({
            mensaje: "Evento eliminado correctamente"
        });
    } catch (error) {
        responderError(res, "ELIMINAR EVENTO", "Error al eliminar evento", error);
    }
});

app.post("/subir-foto", protegerRuta, upload.single("imagen"), async (req, res) => {
    const fecha = limpiarTexto(req.body.fecha);
    const lugar = limpiarTexto(req.body.lugar);

    if (!req.file) {
        return res.status(400).json({
            mensaje: "No se seleccionó ninguna imagen"
        });
    }

    if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({
            mensaje: "El archivo debe ser una imagen"
        });
    }

    if (!validarCampos(res, { fecha, lugar })) return;

    const nombreOriginal = limpiarNombreArchivo(req.file.originalname);
    const extension = nombreOriginal.split(".").pop() || "png";
    const nombreArchivo =
        `foto-${Date.now()}-${Math.floor(Math.random() * 999999)}.${extension}`;

    try {
        await ejecutarConFallback(
            "subir foto",
            async () => {
                const { error: errorUpload } = await supabase.storage
                    .from("album")
                    .upload(nombreArchivo, req.file.buffer, {
                        contentType: req.file.mimetype,
                        upsert: false
                    });

                if (errorUpload) throw errorUpload;

                const { data: publicData } = supabase.storage
                    .from("album")
                    .getPublicUrl(nombreArchivo);

                const url = publicData.publicUrl;
                const { error } = await supabase
                    .from("fotos")
                    .insert([{ url, fecha, lugar }]);

                if (error) {
                    await supabase.storage
                        .from("album")
                        .remove([nombreArchivo]);
                    throw error;
                }

                return { url };
            },
            async () => {
                const url = `/uploads/${nombreArchivo}`;
                await fsp.writeFile(path.join(uploadsDir, nombreArchivo), req.file.buffer);
                await dbRun(
                    "INSERT INTO fotos (imagen, fecha, lugar) VALUES (?, ?, ?)",
                    [url, fecha, lugar]
                );
                return { url };
            }
        );

        programarRespaldoAutomatico();

        res.json({
            mensaje: "Foto subida correctamente"
        });
    } catch (error) {
        responderError(res, "SUBIR FOTO", "Error al subir imagen", error);
    }
});

app.get("/fotos", protegerRuta, async (req, res) => {
    try {
        const fotos = await datosConFallback(
            "cargar fotos",
            () => supabase
                .from("fotos")
                .select("*")
                .order("id", { ascending: false }),
            () => dbAll(
                `SELECT id, imagen AS url, fecha, lugar
                 FROM fotos
                 ORDER BY id DESC`
            )
        );

        res.json((fotos || []).map(foto => ({
            ...foto,
            url: foto.url || foto.imagen
        })));
    } catch (error) {
        responderError(res, "CARGAR FOTOS", "Error al cargar fotos", error);
    }
});

app.delete("/eliminar-foto/:id", protegerRuta, async (req, res) => {
    const id = validarId(req.params.id);

    if (!id) {
        return res.status(400).json({
            mensaje: "Id de foto inválido"
        });
    }

    try {
        await ejecutarConFallback(
            "eliminar foto",
            async () => {
                const { data: foto, error: errorFoto } = await supabase
                    .from("fotos")
                    .select("*")
                    .eq("id", id)
                    .single();

                if (errorFoto) throw errorFoto;
                if (!foto) throw new Error("Foto no encontrada");

                const url = foto.url || foto.imagen || "";
                let nombreArchivo = url.split("/").pop();
                nombreArchivo = nombreArchivo.split("?")[0];

                if (nombreArchivo) {
                    const { error: errorStorage } = await supabase.storage
                        .from("album")
                        .remove([nombreArchivo]);

                    if (errorStorage) {
                        console.log("ERROR ELIMINAR FOTO DE STORAGE:", errorStorage);
                    }
                }

                return supabase
                    .from("fotos")
                    .delete()
                    .eq("id", id);
            },
            async () => {
                const foto = await dbGet(
                    "SELECT id, imagen AS url FROM fotos WHERE id = ?",
                    [id]
                );

                if (foto) {
                    await eliminarArchivoLocal(foto.url);
                }

                await dbRun("DELETE FROM fotos WHERE id = ?", [id]);
            }
        );

        programarRespaldoAutomatico();

        res.json({
            mensaje: "Foto eliminada correctamente"
        });
    } catch (error) {
        responderError(res, "ELIMINAR FOTO", "Error al eliminar foto", error);
    }
});

app.post("/nota", protegerRuta, async (req, res) => {
    const usuario = req.session.usuario;
    const mensaje = limpiarTexto(req.body.mensaje);

    if (!validarCampos(res, { mensaje })) return;

    try {
        await ejecutarConFallback(
            "guardar nota",
            () => supabase
                .from("notas")
                .insert([{ usuario, mensaje }]),
            () => dbRun(
                "INSERT INTO notas (usuario, mensaje) VALUES (?, ?)",
                [usuario, mensaje]
            )
        );

        programarRespaldoAutomatico();

        res.json({
            mensaje: "Nota guardada ❤️"
        });
    } catch (error) {
        responderError(res, "GUARDAR NOTA", "Error al guardar nota", error);
    }
});

app.get("/notas", protegerRuta, async (req, res) => {
    try {
        const notas = await datosConFallback(
            "cargar notas",
            () => supabase
                .from("notas")
                .select("*")
                .order("creado_en", { ascending: false }),
            () => dbAll(
                `SELECT id, usuario, mensaje, creado_en
                 FROM notas
                 ORDER BY creado_en DESC, id DESC`
            )
        );

        res.json(notas || []);
    } catch (error) {
        responderError(res, "CARGAR NOTAS", "Error al cargar notas", error);
    }
});

app.post("/lugar", protegerRuta, async (req, res) => {
    const nombre = limpiarTexto(req.body.nombre);

    if (!validarCampos(res, { nombre })) return;

    try {
        await ejecutarConFallback(
            "guardar lugar",
            () => supabase
                .from("lugares")
                .insert([{ nombre, visitado: false }]),
            () => dbRun(
                "INSERT INTO lugares (nombre, visitado) VALUES (?, ?)",
                [nombre, 0]
            )
        );

        programarRespaldoAutomatico();

        res.json({
            mensaje: "Lugar agregado 🍔"
        });
    } catch (error) {
        responderError(res, "GUARDAR LUGAR", "Error al guardar lugar", error);
    }
});

app.get("/lugares", protegerRuta, async (req, res) => {
    try {
        const lugares = await datosConFallback(
            "cargar lugares",
            () => supabase
                .from("lugares")
                .select("*")
                .order("id", { ascending: false }),
            () => dbAll(
                `SELECT id, nombre, visitado
                 FROM lugares
                 ORDER BY id DESC`
            )
        );

        res.json((lugares || []).map(lugar => ({
            ...lugar,
            visitado: lugar.visitado === true || lugar.visitado === 1
        })));
    } catch (error) {
        responderError(res, "CARGAR LUGARES", "Error al cargar lugares", error);
    }
});

app.put("/lugar/:id", protegerRuta, async (req, res) => {
    const id = validarId(req.params.id);
    const visitado = req.body.visitado === true || req.body.visitado === 1;

    if (!id) {
        return res.status(400).json({
            mensaje: "Id de lugar inválido"
        });
    }

    try {
        await ejecutarConFallback(
            "actualizar lugar",
            () => supabase
                .from("lugares")
                .update({ visitado })
                .eq("id", id),
            () => dbRun(
                "UPDATE lugares SET visitado = ? WHERE id = ?",
                [visitado ? 1 : 0, id]
            )
        );

        programarRespaldoAutomatico();

        res.json({
            mensaje: "Lugar actualizado ✅"
        });
    } catch (error) {
        responderError(res, "ACTUALIZAR LUGAR", "Error al actualizar lugar", error);
    }
});

app.delete("/lugar/:id", protegerRuta, async (req, res) => {
    const id = validarId(req.params.id);

    if (!id) {
        return res.status(400).json({
            mensaje: "Id de lugar inválido"
        });
    }

    try {
        await ejecutarConFallback(
            "eliminar lugar",
            () => supabase
                .from("lugares")
                .delete()
                .eq("id", id),
            () => dbRun("DELETE FROM lugares WHERE id = ?", [id])
        );

        programarRespaldoAutomatico();

        res.json({
            mensaje: "Lugar eliminado 🗑️"
        });
    } catch (error) {
        responderError(res, "ELIMINAR LUGAR", "Error al eliminar lugar", error);
    }
});

async function iniciarServidor() {
    await inicializarBaseLocal();

    app.listen(PORT, () => {
        console.log(`Servidor iniciado en puerto ${PORT}`);
        console.log("Modo de datos:", DATA_SOURCE);
        console.log("Supabase configurado:", Boolean(supabase));
        console.log("SQLite local listo:", path.join(__dirname, "agenda.db"));
    });
}

iniciarServidor().catch(error => {
    console.error("No se pudo iniciar el servidor:", error);
    process.exit(1);
});

process.on("SIGINT", () => {
    db.close(() => process.exit(0));
});
