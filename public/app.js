const SUPABASE_URL =
    "https://zxsnfryvwzwvmlcwdfzg.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_lb9rExXwTs14WIhuSDEfjg_PIC0-3-E";

const supabaseRealtime =
    supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY
    );

async function verificarLogin() {
    const respuesta = await fetch("/verificar");
    const resultado = await respuesta.json();

    if (!resultado.logueado) {
        window.location.href = "login.html";
        return;
    }

    document.getElementById("usuarioConectado").textContent =
        `Conectado como: ${resultado.usuario} ❤️`;
}

verificarLogin();

document.getElementById("formAgenda").addEventListener("submit", async function(event) {
    event.preventDefault();

    const datos = {
        fecha: document.getElementById("fecha").value,
        hora: document.getElementById("hora").value,
        lugar: document.getElementById("lugar").value,
        actividad: document.getElementById("actividad").value,
        otros: document.getElementById("otros").value
    };

    const respuesta = await fetch("/guardar", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(datos)
    });

    const resultado = await respuesta.json();

    alert(resultado.mensaje);

    document.getElementById("formAgenda").reset();

    cargarEventos();
});

async function cargarEventos() {
    const respuesta = await fetch("/eventos");
    const eventos = await respuesta.json();

    const lista = document.getElementById("listaEventos");
    lista.innerHTML = "";

    eventos.forEach(evento => {
        const div = document.createElement("div");
        div.classList.add("evento-card");

        div.innerHTML = `
            <h3>❤️ ${evento.actividad}</h3>
            <p>📅 <b>Fecha:</b> ${evento.fecha}</p>
            <p>🕒 <b>Hora:</b> ${evento.hora}</p>
            <p>📍 <b>Lugar:</b> ${evento.lugar}</p>
            <p>💌 <b>Otros:</b> ${evento.otros || "Sin detalles"}</p>

            <button class="btn-eliminar" onclick="eliminarEvento(${evento.id})">
                🗑️ Eliminar
            </button>
        `;

        lista.appendChild(div);
    });

    crearCalendario(eventos);
    revisarEventosProximos();
}

async function eliminarEvento(id) {
    const confirmar = confirm("¿Seguro que quieres eliminar este evento?");

    if (!confirmar) return;

    const respuesta = await fetch(`/eliminar/${id}`, {
        method: "DELETE"
    });

    const resultado = await respuesta.json();

    alert(resultado.mensaje);

    cargarEventos();
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
            celda.innerHTML += `<p>❤️ ${evento.actividad}</p>`;
        });

        grid.appendChild(celda);
    }

    calendario.appendChild(grid);
}

cargarEventos();

document.getElementById("formFoto").addEventListener("submit", async function(event) {
    event.preventDefault();

    const archivo = document.getElementById("imagen").files[0];

    if (!archivo) {
        alert("Selecciona una imagen");
        return;
    }

    const formData = new FormData();

    formData.append("imagen", archivo);
    formData.append("fecha", document.getElementById("fechaFoto").value);
    formData.append("lugar", document.getElementById("lugarFoto").value);

    const respuesta = await fetch("/subir-foto", {
        method: "POST",
        body: formData
    });

    const resultado = await respuesta.json();

    alert(resultado.mensaje);

    document.getElementById("formFoto").reset();

    cargarFotos();
});

async function cargarFotos() {
    const respuesta = await fetch("/fotos");
    const fotos = await respuesta.json();

    const galeria = document.getElementById("galeria");
    galeria.innerHTML = "";

    fotos.forEach(foto => {
        const div = document.createElement("div");
        div.classList.add("foto-card");

        div.innerHTML = `
            <img src="${foto.url}" alt="Foto del álbum">

            <p>📅 <b>Fecha:</b> ${foto.fecha}</p>
            <p>📍 <b>Lugar:</b> ${foto.lugar}</p>

            <button
                class="btn-eliminar-foto"
                onclick="eliminarFoto(${foto.id})"
            >
                🗑️ Eliminar foto
            </button>
        `;

        galeria.appendChild(div);
    });
}

cargarFotos();

async function eliminarFoto(id) {
    const confirmar = confirm("¿Desean eliminar esta foto?");

    if (!confirmar) return;

    const respuesta = await fetch(`/eliminar-foto/${id}`, {
        method: "DELETE"
    });

    const resultado = await respuesta.json();

    alert(resultado.mensaje);

    cargarFotos();
}

document.addEventListener("click", function(e) {
    if (e.target.matches(".foto-card img")) {
        document.getElementById("visor").style.display = "flex";
        document.getElementById("imagenGrande").src = e.target.src;
    }
});

document.getElementById("cerrar").addEventListener("click", function() {
    document.getElementById("visor").style.display = "none";
});

document.getElementById("btnCerrarSesion").addEventListener("click", async function() {
    await fetch("/logout", {
        method: "POST"
    });

    window.location.href = "login.html";
});

document.getElementById("formNota").addEventListener("submit", async function(e) {
    e.preventDefault();

    const mensaje = document.getElementById("mensajeNota").value;

    const respuesta = await fetch("/nota", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ mensaje })
    });

    const resultado = await respuesta.json();

    alert(resultado.mensaje);

    document.getElementById("mensajeNota").value = "";

    cargarNotas();
});

async function cargarNotas() {
    const respuesta = await fetch("/notas");
    const notas = await respuesta.json();

    const lista = document.getElementById("listaNotas");
    lista.innerHTML = "";

    notas.forEach(nota => {
        const div = document.createElement("div");
        div.classList.add("nota-card");

        div.innerHTML = `
            <h4>${nota.usuario} ❤️</h4>
            <p>${nota.mensaje}</p>
        `;

        lista.appendChild(div);
    });
}

cargarNotas();

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

cargarPerfilPareja();

document.getElementById("formLugar").addEventListener("submit", async function(e) {
    e.preventDefault();

    const nombre = document.getElementById("nombreLugar").value;

    const respuesta = await fetch("/lugar", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ nombre })
    });

    const resultado = await respuesta.json();

    alert(resultado.mensaje);

    document.getElementById("formLugar").reset();

    cargarLugares();
});

async function cargarLugares() {
    const respuesta = await fetch("/lugares");
    const lugares = await respuesta.json();

    const lista = document.getElementById("listaLugares");
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
                    onchange="cambiarEstadoLugar(${lugar.id}, this.checked)"
                >
                <span>${lugar.nombre}</span>
            </label>

            <button onclick="eliminarLugar(${lugar.id})">
                🗑️
            </button>
        `;

        lista.appendChild(div);
    });
}

async function cambiarEstadoLugar(id, checked) {
    await fetch(`/lugar/${id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            visitado: checked
        })
    });

    cargarLugares();
}

async function eliminarLugar(id) {
    const confirmar = confirm("¿Eliminar este lugar?");

    if (!confirmar) return;

    const respuesta = await fetch(`/lugar/${id}`, {
        method: "DELETE"
    });

    const resultado = await respuesta.json();

    alert(resultado.mensaje);

    cargarLugares();
}

cargarLugares();

document.getElementById("btnNotificaciones").addEventListener("click", async function() {
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
});

async function revisarEventosProximos(mostrarNotificacion = false) {
    const respuesta = await fetch("/eventos");
    const eventos = await respuesta.json();

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
                    🔔 Mañana tienen: <b>${evento.actividad}</b><br>
                    🕒 ${evento.hora}<br>
                    📍 ${evento.lugar}
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

revisarEventosProximos();

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js")
        .then(() => {
            console.log("Service Worker registrado");
        })
        .catch(error => {
            console.log("Error al registrar Service Worker:", error);
        });
}

function activarTiempoReal() {

    supabaseRealtime
        .channel("agenda-tiempo-real")

        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "eventos"
            },
            () => {
                console.log("Evento actualizado");
                cargarEventos();
            }
        )

        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "fotos"
            },
            () => {
                console.log("Foto actualizada");
                cargarFotos();
            }
        )

        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "notas"
            },
            () => {
                console.log("Nota actualizada");
                cargarNotas();
            }
        )

        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "lugares"
            },
            () => {
                console.log("Lugar actualizado");
                cargarLugares();
            }
        )

        .subscribe((status) => {
            console.log("Realtime:", status);
        });

}

activarTiempoReal();