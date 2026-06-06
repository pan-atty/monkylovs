require("dotenv").config();

const express = require("express");
const multer = require("multer");
const session = require("express-session");
const { createClient } = require("@supabase/supabase-js");

const app = express();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("ERROR: Falta SUPABASE_URL o SUPABASE_KEY en el archivo .env");
    process.exit(1);
}

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 20 * 1024 * 1024
    }
});

app.use(express.json());

app.use(session({
    secret: "agenda_secreta_michel",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax"
    }
}));

app.use(express.static("public"));

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

function limpiarNombreArchivo(nombre) {
    return nombre
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9.\-_]/g, "");
}

app.post("/login", (req, res) => {
    const { usuario, password } = req.body;

    const usuarioLimpio = usuario ? usuario.toLowerCase().trim() : "";

    const encontrado = usuarios.find(
        u => u.usuario === usuarioLimpio && u.password === password
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
    const { fecha, hora, lugar, actividad, otros } = req.body;

    const { error } = await supabase
        .from("eventos")
        .insert([
            {
                fecha,
                hora,
                lugar,
                actividad,
                otros
            }
        ]);

    if (error) {
        console.log("ERROR GUARDAR EVENTO:", error);

        res.status(500).json({
            mensaje: "Error al guardar evento"
        });
    } else {
        res.json({
            mensaje: "Evento guardado correctamente"
        });
    }
});

app.get("/eventos", protegerRuta, async (req, res) => {
    const { data, error } = await supabase
        .from("eventos")
        .select("*")
        .order("fecha", { ascending: true })
        .order("hora", { ascending: true });

    if (error) {
        console.log("ERROR OBTENER EVENTOS:", error);

        res.status(500).json({
            mensaje: "Error al obtener eventos"
        });
    } else {
        res.json(data);
    }
});

app.delete("/eliminar/:id", protegerRuta, async (req, res) => {
    const { error } = await supabase
        .from("eventos")
        .delete()
        .eq("id", req.params.id);

    if (error) {
        console.log("ERROR ELIMINAR EVENTO:", error);

        res.status(500).json({
            mensaje: "Error al eliminar evento"
        });
    } else {
        res.json({
            mensaje: "Evento eliminado correctamente"
        });
    }
});

app.post("/subir-foto", protegerRuta, upload.single("imagen"), async (req, res) => {
    try {
        const { fecha, lugar } = req.body;

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

        const nombreOriginal = limpiarNombreArchivo(req.file.originalname);
        const extension = nombreOriginal.split(".").pop() || "png";

        const nombreArchivo =
            `foto-${Date.now()}-${Math.floor(Math.random() * 999999)}.${extension}`;

        const { error: errorUpload } = await supabase.storage
            .from("album")
            .upload(nombreArchivo, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: false
            });

        if (errorUpload) {
            console.log("ERROR SUBIR IMAGEN A STORAGE:", errorUpload);

            return res.status(500).json({
                mensaje: "Error al subir imagen a Supabase"
            });
        }

        const { data: publicData } = supabase.storage
            .from("album")
            .getPublicUrl(nombreArchivo);

        const url = publicData.publicUrl;

        const { error } = await supabase
            .from("fotos")
            .insert([
                {
                    url,
                    fecha,
                    lugar
                }
            ]);

        if (error) {
            console.log("ERROR GUARDAR FOTO EN TABLA:", error);

            await supabase.storage
                .from("album")
                .remove([nombreArchivo]);

            return res.status(500).json({
                mensaje: "Error al guardar foto"
            });
        }

        res.json({
            mensaje: "Foto subida correctamente"
        });

    } catch (error) {
        console.log("ERROR GENERAL SUBIR FOTO:", error);

        res.status(500).json({
            mensaje: "Error inesperado al subir foto"
        });
    }
});

app.get("/fotos", protegerRuta, async (req, res) => {
    const { data, error } = await supabase
        .from("fotos")
        .select("*")
        .order("id", { ascending: false });

    if (error) {
        console.log("ERROR CARGAR FOTOS:", error);

        res.status(500).json({
            mensaje: "Error al cargar fotos"
        });
    } else {
        res.json(data);
    }
});

app.delete("/eliminar-foto/:id", protegerRuta, async (req, res) => {
    const { data: foto, error: errorFoto } = await supabase
        .from("fotos")
        .select("*")
        .eq("id", req.params.id)
        .single();

    if (errorFoto || !foto) {
        console.log("ERROR BUSCAR FOTO:", errorFoto);

        return res.status(404).json({
            mensaje: "Foto no encontrada"
        });
    }

    let nombreArchivo = foto.url.split("/").pop();
    nombreArchivo = nombreArchivo.split("?")[0];

    const { error: errorStorage } = await supabase.storage
        .from("album")
        .remove([nombreArchivo]);

    if (errorStorage) {
        console.log("ERROR ELIMINAR FOTO DE STORAGE:", errorStorage);
    }

    const { error } = await supabase
        .from("fotos")
        .delete()
        .eq("id", req.params.id);

    if (error) {
        console.log("ERROR ELIMINAR FOTO DE TABLA:", error);

        res.status(500).json({
            mensaje: "Error al eliminar foto"
        });
    } else {
        res.json({
            mensaje: "Foto eliminada correctamente"
        });
    }
});

app.post("/nota", protegerRuta, async (req, res) => {
    const usuario = req.session.usuario;
    const { mensaje } = req.body;

    const { error } = await supabase
        .from("notas")
        .insert([
            {
                usuario,
                mensaje
            }
        ]);

    if (error) {
        console.log("ERROR GUARDAR NOTA:", error);

        res.status(500).json({
            mensaje: "Error al guardar nota"
        });
    } else {
        res.json({
            mensaje: "Nota guardada ❤️"
        });
    }
});

app.get("/notas", protegerRuta, async (req, res) => {
    const { data, error } = await supabase
        .from("notas")
        .select("*")
        .order("creado_en", { ascending: false });

    if (error) {
        console.log("ERROR CARGAR NOTAS:", error);

        res.status(500).json({
            mensaje: "Error al cargar notas"
        });
    } else {
        res.json(data);
    }
});

app.post("/lugar", protegerRuta, async (req, res) => {
    const { nombre } = req.body;

    const { error } = await supabase
        .from("lugares")
        .insert([
            {
                nombre,
                visitado: false
            }
        ]);

    if (error) {
        console.log("ERROR GUARDAR LUGAR:", error);

        res.status(500).json({
            mensaje: "Error al guardar lugar"
        });
    } else {
        res.json({
            mensaje: "Lugar agregado 🍔"
        });
    }
});

app.get("/lugares", protegerRuta, async (req, res) => {
    const { data, error } = await supabase
        .from("lugares")
        .select("*")
        .order("id", { ascending: false });

    if (error) {
        console.log("ERROR CARGAR LUGARES:", error);

        res.status(500).json({
            mensaje: "Error al cargar lugares"
        });
    } else {
        res.json(data);
    }
});

app.put("/lugar/:id", protegerRuta, async (req, res) => {
    const { visitado } = req.body;

    const { error } = await supabase
        .from("lugares")
        .update({
            visitado: visitado === 1 || visitado === true
        })
        .eq("id", req.params.id);

    if (error) {
        console.log("ERROR ACTUALIZAR LUGAR:", error);

        res.status(500).json({
            mensaje: "Error al actualizar lugar"
        });
    } else {
        res.json({
            mensaje: "Lugar actualizado ✅"
        });
    }
});

app.delete("/lugar/:id", protegerRuta, async (req, res) => {
    const { error } = await supabase
        .from("lugares")
        .delete()
        .eq("id", req.params.id);

    if (error) {
        console.log("ERROR ELIMINAR LUGAR:", error);

        res.status(500).json({
            mensaje: "Error al eliminar lugar"
        });
    } else {
        res.json({
            mensaje: "Lugar eliminado 🗑️"
        });
    }
});

app.listen(3000, () => {
    console.log("Servidor iniciado con Supabase en puerto 3000");
    console.log("SUPABASE_URL cargada:", !!SUPABASE_URL);
    console.log("SUPABASE_KEY cargada:", !!SUPABASE_KEY);
});