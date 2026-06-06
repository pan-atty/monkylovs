document.getElementById("formLogin").addEventListener("submit", async function(e) {
    e.preventDefault();

    const datos = {
        usuario: document.getElementById("usuario").value,
        password: document.getElementById("password").value
    };

    const respuesta = await fetch("/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(datos)
    });

    const resultado = await respuesta.json();

    alert(resultado.mensaje);

    if (resultado.acceso) {
        window.location.href = "index.html";
    }
});

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js")
        .then(() => {
            console.log("Service Worker registrado");
        })
        .catch(error => {
            console.log("Error al registrar Service Worker:", error);
        });
}