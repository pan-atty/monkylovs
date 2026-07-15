let supabaseRealtime = null;
const MAX_IMAGE_MB = 50;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;
const COMPRESS_IMAGE_BYTES = 4 * 1024 * 1024;
const COMPRESS_MAX_SIDE = 1800;
const COMPRESS_QUALITY = 0.82;

function escaparHtml(valor) {
    const mapa = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#039;"
    };

    return String(valor ?? "").replace(/[&<>"']/g, caracter => mapa[caracter]);
}

async function obtenerJson(url, opciones = {}) {
    const respuesta = await fetch(url, opciones);
    const texto = await respuesta.text();
    let resultado = {};

    try {
        resultado = texto ? JSON.parse(texto) : {};
    } catch (error) {
        resultado = texto ? { mensaje: texto.slice(0, 300) } : {};
    }

    if (respuesta.status === 401) {
        window.location.href = "login.html";
        throw new Error("Sesión expirada. Inicia sesión de nuevo.");
    }

    if (!respuesta.ok) {
        const detalle = resultado.detalle ? `\n${resultado.detalle}` : "";
        throw new Error(`${resultado.mensaje || "Ocurrió un error"}${detalle}`);
    }

    return resultado;
}

function mostrarError(error) {
    console.error(error);
    alert(error.message || "Ocurrió un error inesperado");
}

function listaSegura(datos) {
    return Array.isArray(datos) ? datos : [];
}

function cargarImagenDesdeArchivo(archivo) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(archivo);
        const imagen = new Image();

        imagen.onload = () => {
            URL.revokeObjectURL(url);
            resolve(imagen);
        };

        imagen.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("No se pudo leer la imagen seleccionada"));
        };

        imagen.src = url;
    });
}

function canvasABlob(canvas) {
    return new Promise(resolve => {
        canvas.toBlob(resolve, "image/jpeg", COMPRESS_QUALITY);
    });
}

function nombreJpg(nombre) {
    const base = String(nombre || "foto")
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .slice(0, 80) || "foto";

    return `${base}.jpg`;
}

async function comprimirImagenSiConviene(archivo) {
    if (archivo.size <= COMPRESS_IMAGE_BYTES) return archivo;

    const imagen = await cargarImagenDesdeArchivo(archivo);
    const escala = Math.min(
        1,
        COMPRESS_MAX_SIDE / Math.max(imagen.naturalWidth, imagen.naturalHeight)
    );
    const ancho = Math.max(1, Math.round(imagen.naturalWidth * escala));
    const alto = Math.max(1, Math.round(imagen.naturalHeight * escala));
    const canvas = document.createElement("canvas");
    const contexto = canvas.getContext("2d");

    canvas.width = ancho;
    canvas.height = alto;
    contexto.drawImage(imagen, 0, 0, ancho, alto);

    const blob = await canvasABlob(canvas);

    if (!blob || blob.size >= archivo.size) return archivo;

    return new File([blob], nombreJpg(archivo.name), {
        type: "image/jpeg",
        lastModified: Date.now()
    });
}

async function verificarLogin() {
    const resultado = await obtenerJson("/verificar");

    if (!resultado.logueado) {
        window.location.href = "login.html";
        return false;
    }

    document.getElementById("usuarioConectado").textContent =
        `Conectado como: ${resultado.usuario} ❤️`;

    return true;
}

function registrarEventosFormulario() {
    document.getElementById("formAgenda").addEventListener("submit", guardarEvento);
    document.getElementById("formFoto").addEventListener("submit", subirFoto);
    document.getElementById("formNota").addEventListener("submit", guardarNota);
    document.getElementById("formLugar").addEventListener("submit", guardarLugar);
    document.getElementById("btnCerrarSesion").addEventListener("click", cerrarSesion);
    document.getElementById("btnNotificaciones").addEventListener("click", activarNotificaciones);
    document.getElementById("cerrar").addEventListener("click", cerrarVisor);

    document.addEventListener("click", function(evento) {
        if (evento.target.matches(".foto-card img")) {
            document.getElementById("visor").style.display = "flex";
            document.getElementById("imagenGrande").src = evento.target.src;
        }
    });
}

async function guardarEvento(evento) {
    evento.preventDefault();

    const datos = {
        fecha: document.getElementById("fecha").value,
        hora: document.getElementById("hora").value,
        lugar: document.getElementById("lugar").value,
        actividad: document.getElementById("actividad").value,
        otros: document.getElementById("otros").value
    };

    try {
        const resultado = await obtenerJson("/guardar", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(datos)
        });

        alert(resultado.mensaje);
        document.getElementById("formAgenda").reset();
        await cargarEventos();
    } catch (error) {
        mostrarError(error);
    }
}

async function cargarEventos() {
    const lista = document.getElementById("listaEventos");

    try {
        const eventos = listaSegura(await obtenerJson("/eventos"));
        lista.innerHTML = "";

        eventos.forEach(evento => {
            const div = document.createElement("div");
            div.classList.add("evento-card");

            div.innerHTML = `
                <h3>❤️ ${escaparHtml(evento.actividad)}</h3>
                <p>📅 <b>Fecha:</b> ${escaparHtml(evento.fecha)}</p>
                <p>🕒 <b>Hora:</b> ${escaparHtml(evento.hora)}</p>
                <p>📍 <b>Lugar:</b> ${escaparHtml(evento.lugar)}</p>
                <p>💌 <b>Otros:</b> ${escaparHtml(evento.otros || "Sin detalles")}</p>

                <button class="btn-eliminar" onclick="eliminarEvento(${Number(evento.id)})">
                    🗑️ Eliminar
                </button>
            `;

            lista.appendChild(div);
        });

        crearCalendario(eventos);
        revisarEventosProximos(false, eventos);
    } catch (error) {
        lista.innerHTML = `<p class="estado-error">${escaparHtml(error.message)}</p>`;
        console.error(error);
    }
}

async function eliminarEvento(id) {
    const confirmar = confirm("¿Seguro que quieres eliminar este evento?");

    if (!confirmar) return;

    try {
        const resultado = await obtenerJson(`/eliminar/${id}`, {
            method: "DELETE"
        });

        alert(resultado.mensaje);
        await cargarEventos();
    } catch (error) {
        mostrarError(error);
    }
}

function crearCalendario(eventos) {
    const calendario = document.getElementById("calendario");
    calendario.innerHTML = "";

    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = hoy.getMonth();

    const primerDia = new Date(anio, mes, 1);
    const ultimoDia = new Date(anio, mes + 1, 0);

    const titulo = document.createElement("h3");
    titulo.textContent = primerDia.toLocaleDateString("es-MX", {
        month: "long",
        year: "numeric"
    });

    calendario.appendChild(titulo);

    const diasSemana = document.createElement("div");
    diasSemana.classList.add("dias-semana");
    diasSemana.innerHTML = `
        <span>L</span>
        <span>M</span>
        <span>M</span>
        <span>J</span>
        <span>V</span>
        <span>S</span>
        <span>D</span>
    `;
    calendario.appendChild(diasSemana);

    const grid = document.createElement("div");
    grid.classList.add("grid-calendario");

    let espacios = primerDia.getDay() - 1;
    if (espacios < 0) espacios = 6;

    for (let i = 0; i < espacios; i++) {
        const vacio = document.createElement("div");
        vacio.classList.add("dia-vacio");
        grid.appendChild(vacio);
    }

    for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
        const celda = document.createElement("div");
        celda.classList.add("dia");

        const fechaTexto = `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
        const eventosDelDia = eventos.filter(evento => evento.fecha === fechaTexto);

        celda.innerHTML = `<strong>${dia}</strong>`;

        eventosDelDia.forEach(evento => {
            celda.innerHTML += `<p>❤️ ${escaparHtml(evento.actividad)}</p>`;
        });

        grid.appendChild(celda);
    }

    calendario.appendChild(grid);
}

async function subirFoto(evento) {
    evento.preventDefault();

    const inputImagen = document.getElementById("imagen");
    const boton = document.querySelector("#formFoto button[type='submit']");
    const textoBoton = boton ? boton.textContent : "";
    const archivoSeleccionado = inputImagen.files[0];
    const fecha = document.getElementById("fechaFoto").value;
    const lugar = document.getElementById("lugarFoto").value.trim();

    if (!archivoSeleccionado) {
        alert("Selecciona una imagen");
        return;
    }

    if (!archivoSeleccionado.type.startsWith("image/")) {
        alert("El archivo debe ser una imagen");
        return;
    }

    if (!fecha || !lugar) {
        alert("Completa la fecha y el lugar de la foto");
        return;
    }

    try {
        if (boton) {
            boton.disabled = true;
            boton.textContent = "Subiendo imagen...";
        }

        let archivo = archivoSeleccionado;

        try {
            archivo = await comprimirImagenSiConviene(archivoSeleccionado);
        } catch (error) {
            console.log("No se pudo comprimir la imagen:", error.message);
        }

        if (archivo.size > MAX_IMAGE_BYTES) {
            alert(`La imagen pesa demasiado. Sube una imagen de máximo ${MAX_IMAGE_MB} MB.`);
            return;
        }

        const formData = new FormData();

        formData.append("imagen", archivo, archivo.name);
        formData.append("fecha", fecha);
        formData.append("lugar", lugar);

        const resultado = await obtenerJson("/subir-foto", {
            method: "POST",
            body: formData
        });

        alert(resultado.mensaje);
        document.getElementById("formFoto").reset();
        await cargarFotos();
    } catch (error) {
        mostrarError(error);
    } finally {
        if (boton) {
            boton.disabled = false;
            boton.textContent = textoBoton;
        }
    }
}

async function cargarFotos() {
    const galeria = document.getElementById("galeria");

    try {
        const fotos = listaSegura(await obtenerJson("/fotos"));
        galeria.innerHTML = "";

        fotos.forEach(foto => {
            const div = document.createElement("div");
            div.classList.add("foto-card");

            div.innerHTML = `
                <img src="${escaparHtml(foto.url)}" alt="Foto del álbum">

                <p>📅 <b>Fecha:</b> ${escaparHtml(foto.fecha)}</p>
                <p>📍 <b>Lugar:</b> ${escaparHtml(foto.lugar)}</p>

                <button
                    class="btn-eliminar-foto"
                    onclick="eliminarFoto(${Number(foto.id)})"
                >
                    🗑️ Eliminar foto
                </button>
            `;

            galeria.appendChild(div);
        });
    } catch (error) {
        galeria.innerHTML = `<p class="estado-error">${escaparHtml(error.message)}</p>`;
        console.error(error);
    }
}

async function eliminarFoto(id) {
    const confirmar = confirm("¿Desean eliminar esta foto?");

    if (!confirmar) return;

    try {
        const resultado = await obtenerJson(`/eliminar-foto/${id}`, {
            method: "DELETE"
        });

        alert(resultado.mensaje);
        await cargarFotos();
    } catch (error) {
        mostrarError(error);
    }
}

function cerrarVisor() {
    document.getElementById("visor").style.display = "none";
}

async function cerrarSesion() {
    await fetch("/logout", {
        method: "POST"
    });

    window.location.href = "login.html";
}

async function guardarNota(evento) {
    evento.preventDefault();

    const mensaje = document.getElementById("mensajeNota").value;

    try {
        const resultado = await obtenerJson("/nota", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ mensaje })
        });

        alert(resultado.mensaje);
        document.getElementById("mensajeNota").value = "";
        await cargarNotas();
    } catch (error) {
        mostrarError(error);
    }
}

async function cargarNotas() {
    const lista = document.getElementById("listaNotas");

    try {
        const notas = listaSegura(await obtenerJson("/notas"));
        lista.innerHTML = "";

        notas.forEach(nota => {
            const div = document.createElement("div");
            div.classList.add("nota-card");

            div.innerHTML = `
                <h4>${escaparHtml(nota.usuario)} ❤️</h4>
                <p>${escaparHtml(nota.mensaje)}</p>
            `;

            lista.appendChild(div);
        });
    } catch (error) {
        lista.innerHTML = `<p class="estado-error">${escaparHtml(error.message)}</p>`;
        console.error(error);
    }
}

function cargarPerfilPareja() {
    const fechaInicio = new Date("2024-06-19");
    const hoy = new Date();

    const diferencia = hoy - fechaInicio;
    const diasJuntos = Math.floor(diferencia / (1000 * 60 * 60 * 24));

    document.getElementById("diasJuntos").textContent = diasJuntos;

    let proximoAniversario = new Date(hoy.getFullYear(), 5, 19);

    if (proximoAniversario < hoy) {
        proximoAniversario = new Date(hoy.getFullYear() + 1, 5, 19);
    }

    const diferenciaAniversario = proximoAniversario - hoy;
    const diasAniversario = Math.ceil(diferenciaAniversario / (1000 * 60 * 60 * 24));

    document.getElementById("diasAniversario").textContent = diasAniversario;
}

async function guardarLugar(evento) {
    evento.preventDefault();

    const nombre = document.getElementById("nombreLugar").value;

    try {
        const resultado = await obtenerJson("/lugar", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ nombre })
        });

        alert(resultado.mensaje);
        document.getElementById("formLugar").reset();
        await cargarLugares();
    } catch (error) {
        mostrarError(error);
    }
}

async function cargarLugares() {
    const lista = document.getElementById("listaLugares");

    try {
        const lugares = listaSegura(await obtenerJson("/lugares"));
        lista.innerHTML = "";

        lugares.forEach(lugar => {
            const div = document.createElement("div");
            div.classList.add("lugar-card");

            if (lugar.visitado === true || lugar.visitado === 1) {
                div.classList.add("visitado");
            }

            div.innerHTML = `
                <label>
                    <input
                        type="checkbox"
                        ${(lugar.visitado === true || lugar.visitado === 1) ? "checked" : ""}
                        onchange="cambiarEstadoLugar(${Number(lugar.id)}, this.checked)"
                    >
                    <span>${escaparHtml(lugar.nombre)}</span>
                </label>

                <button onclick="eliminarLugar(${Number(lugar.id)})">
                    🗑️
                </button>
            `;

            lista.appendChild(div);
        });
    } catch (error) {
        lista.innerHTML = `<p class="estado-error">${escaparHtml(error.message)}</p>`;
        console.error(error);
    }
}

async function cambiarEstadoLugar(id, checked) {
    try {
        await obtenerJson(`/lugar/${id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                visitado: checked
            })
        });

        await cargarLugares();
    } catch (error) {
        mostrarError(error);
    }
}

async function eliminarLugar(id) {
    const confirmar = confirm("¿Eliminar este lugar?");

    if (!confirmar) return;

    try {
        const resultado = await obtenerJson(`/lugar/${id}`, {
            method: "DELETE"
        });

        alert(resultado.mensaje);
        await cargarLugares();
    } catch (error) {
        mostrarError(error);
    }
}

async function activarNotificaciones() {
    if (!("Notification" in window)) {
        alert("Tu navegador no soporta notificaciones");
        return;
    }

    const permiso = await Notification.requestPermission();

    if (permiso === "granted") {
        alert("Notificaciones activadas 🔔");
        revisarEventosProximos(true);
    } else {
        alert("No se activaron las notificaciones");
    }
}

async function revisarEventosProximos(mostrarNotificacion = false, eventosCargados = null) {
    let eventos = eventosCargados;

    try {
        if (!eventos) {
            eventos = listaSegura(await obtenerJson("/eventos"));
        }
    } catch (error) {
        console.error(error);
        return;
    }

    const hoy = new Date();
    const manana = new Date();
    manana.setDate(hoy.getDate() + 1);

    const fechaManana = manana.toISOString().split("T")[0];
    const avisos = document.getElementById("avisosEventos");
    avisos.innerHTML = "";

    eventos.forEach(evento => {
        if (evento.fecha === fechaManana) {
            avisos.innerHTML += `
                <div class="aviso-card">
                    🔔 Mañana tienen: <b>${escaparHtml(evento.actividad)}</b><br>
                    🕒 ${escaparHtml(evento.hora)}<br>
                    📍 ${escaparHtml(evento.lugar)}
                </div>
            `;

            if (
                mostrarNotificacion &&
                Notification.permission === "granted"
            ) {
                new Notification("Agenda de Michel ❤️ Len", {
                    body: `Mañana tienen: ${evento.actividad} a las ${evento.hora}`,
                    icon: "/icon-192.png"
                });
            }
        }
    });
}

async function activarTiempoReal() {
    if (!window.supabase) {
        console.log("Realtime no disponible: librería de Supabase no cargada");
        return;
    }

    try {
        const configuracion = await obtenerJson("/configuracion-publica");

        if (!configuracion.supabaseUrl || !configuracion.supabaseKey) {
            console.log("Realtime no configurado");
            return;
        }

        supabaseRealtime = window.supabase.createClient(
            configuracion.supabaseUrl,
            configuracion.supabaseKey
        );

        supabaseRealtime
            .channel("agenda-tiempo-real")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "eventos"
                },
                cargarEventos
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "fotos"
                },
                cargarFotos
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "notas"
                },
                cargarNotas
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "lugares"
                },
                cargarLugares
            )
            .subscribe(status => {
                console.log("Realtime:", status);
            });
    } catch (error) {
        console.log("Realtime no se pudo activar:", error.message);
    }
}

function registrarServiceWorker() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js")
            .then(() => {
                console.log("Service Worker registrado");
            })
            .catch(error => {
                console.log("Error al registrar Service Worker:", error);
            });
    }
}

async function iniciarApp() {
    try {
        const logueado = await verificarLogin();
        if (!logueado) return;

        registrarEventosFormulario();
        cargarPerfilPareja();

        await Promise.all([
            cargarEventos(),
            cargarFotos(),
            cargarNotas(),
            cargarLugares()
        ]);

        await activarTiempoReal();
        registrarServiceWorker();
    } catch (error) {
        console.error("No se pudo iniciar la app:", error);
    }
}

iniciarApp();
