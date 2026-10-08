(function () {
  "use strict";

  var STORAGE_KEY = "eep-install-banner";
  var DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

  function yaInstalada() {
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) {
      return true;
    }
    if (navigator.standalone === true) return true;
    return false;
  }

  function rechazadoReciente() {
    try {
      var guardado = Number(localStorage.getItem(STORAGE_KEY) || 0);
      return guardado > 0 && Date.now() - guardado < DISMISS_MS;
    } catch (e) {
      return false;
    }
  }

  function marcarRechazado() {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch (e) {}
  }

  if (yaInstalada() || rechazadoReciente()) return;

  var deferred = null;
  var banner = null;
  var ayuda = null;

  var ESTILOS =
    "#eep-banner{position:fixed;top:0;left:0;right:0;z-index:9999;" +
    "background:linear-gradient(135deg,#2563eb 0%,#1e3a8a 100%);color:#fff;" +
    "font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;" +
    "box-shadow:0 4px 14px rgba(15,23,42,.28);display:flex;" +
    "align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px;}" +
    "#eep-banner .eep-ico{width:40px;height:40px;flex:0 0 auto;object-fit:contain;" +
    "background:#fff;border-radius:10px;padding:3px;}" +
    "#eep-banner .eep-txt{flex:1 1 200px;min-width:160px;line-height:1.3;}" +
    "#eep-banner .eep-txt b{display:block;font-size:.95rem;}" +
    "#eep-banner .eep-txt span{display:block;font-size:.78rem;opacity:.88;}" +
    "#eep-banner .eep-btns{display:flex;gap:8px;align-items:center;flex:0 0 auto;}" +
    "#eep-banner button{font-family:inherit;cursor:pointer;border-radius:999px;" +
    "font-size:.85rem;white-space:nowrap;}" +
    "#eep-banner .eep-yes{background:#fff;color:#1d4ed8;border:none;" +
    "padding:9px 16px;font-weight:700;}" +
    "#eep-banner .eep-yes:hover{background:#eff6ff;}" +
    "#eep-banner .eep-no{background:transparent;color:#fff;" +
    "border:1px solid rgba(255,255,255,.6);padding:8px 14px;}" +
    "#eep-banner .eep-no:hover{background:rgba(255,255,255,.15);}" +
    "#eep-banner .eep-help{flex:1 0 100%;background:rgba(255,255,255,.14);" +
    "border-radius:8px;padding:10px 12px;font-size:.82rem;line-height:1.55;}" +
    "#eep-banner .eep-help p{margin:0 0 6px 0;}" +
    "#eep-banner .eep-help ol{margin:0;padding-left:20px;}" +
    "#eep-banner .eep-help li{margin-bottom:3px;}" +
    "#eep-banner .eep-help button{margin-top:8px;background:transparent;color:#fff;" +
    "border:1px solid rgba(255,255,255,.6);padding:6px 14px;}" +
    "html.eep-banner-on body{padding-top:calc(var(--eep-banner-h,78px) + 14px);}" +
    "@media (max-width:460px){" +
    "#eep-banner{gap:8px;padding:9px 10px;}" +
    "#eep-banner .eep-ico{width:34px;height:34px;}" +
    "#eep-banner .eep-txt b{font-size:.87rem;}" +
    "#eep-banner .eep-btns{width:100%;justify-content:flex-end;}" +
    "#eep-banner .eep-yes{padding:8px 14px;}" +
    "#eep-banner .eep-no{padding:7px 12px;}}";

  function pasosManuales() {
    var ua = navigator.userAgent;
    var esIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (esIOS) {
      return [
        "Abre esta página en <b>Safari</b>.",
        'Toca el botón <b>Compartir</b> (cuadrado con la flecha hacia arriba).',
        "Elige <b>Añadir a pantalla de inicio</b>.",
        "Ponle el nombre que quieras y toca <b>Añadir</b>.",
      ];
    }
    if (/Android/.test(ua)) {
      return [
        "Toca el menú <b>⋮</b> de Chrome.",
        "Elige <b>Instalar aplicación</b> o <b>Agregar a pantalla de inicio</b>.",
        "Confirma con <b>Instalar</b>.",
      ];
    }
    return [
      "Abre esta página en <b>Chrome</b> o <b>Edge</b>.",
      "Toca el menú <b>⋮</b> (tres puntos) o <b>Instalar</b> en la barra de direcciones.",
      "Elige <b>Instalar página</b> / <b>Instalar aplicación</b>.",
      "Confirma la instalación.",
    ];
  }

  function sincronizarAltura() {
    if (!banner) return;
    document.documentElement.style.setProperty(
      "--eep-banner-h",
      banner.offsetHeight + "px"
    );
  }

  function ocultar() {
    if (!banner) return;
    banner.parentNode.removeChild(banner);
    banner = null;
    ayuda = null;
    document.documentElement.classList.remove("eep-banner-on");
    document.documentElement.style.removeProperty("--eep-banner-h");
    window.removeEventListener("resize", sincronizarAltura);
  }

  function mostrarAyuda() {
    if (!banner || !ayuda) return;
    ayuda.innerHTML =
      "<p>Tu navegador no ofrece la instalación automática. Hazlo a mano:</p><ol>" +
      pasosManuales()
        .map(function (paso) {
          return "<li>" + paso + "</li>";
        })
        .join("") +
      "</ol>" +
      '<button type="button" class="eep-close">Cerrar</button>';
    ayuda.hidden = false;
    ayuda.querySelector(".eep-close").addEventListener("click", function () {
      ayuda.hidden = true;
    });
    sincronizarAltura();
  }

  function instalar() {
    if (!deferred) {
      mostrarAyuda();
      return;
    }
    var prompt = deferred;
    deferred = null;
    prompt.prompt();
    prompt.userChoice
      .then(function (resultado) {
        if (resultado && resultado.outcome === "accepted") {
          ocultar();
        } else {
          marcarRechazado();
          ocultar();
        }
      })
      .catch(function () {
        ocultar();
      });
  }

  function crear() {
    var estilo = document.createElement("style");
    estilo.textContent = ESTILOS;
    document.head.appendChild(estilo);

    banner = document.createElement("div");
    banner.id = "eep-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Descargar la página como aplicación");
    banner.innerHTML =
      '<img class="eep-ico" src="icons/adp.png" alt="" width="40" height="40" />' +
      '<div class="eep-txt"><b>¿Descargar esta página como aplicación?</b>' +
      "<span>Instálala en tu teléfono y ábrela sin conexión.</span></div>" +
      '<div class="eep-btns">' +
      '<button type="button" class="eep-yes">Sí, descargar</button>' +
      '<button type="button" class="eep-no">Ahora no</button>' +
      "</div>" +
      '<div class="eep-help" hidden></div>';

    document.body.appendChild(banner);
    document.documentElement.classList.add("eep-banner-on");
    ayuda = banner.querySelector(".eep-help");

    banner.querySelector(".eep-yes").addEventListener("click", instalar);
    banner.querySelector(".eep-no").addEventListener("click", function () {
      marcarRechazado();
      ocultar();
    });

    window.addEventListener("resize", sincronizarAltura);
    sincronizarAltura();
  }

  window.addEventListener("beforeinstallprompt", function (evento) {
    evento.preventDefault();
    deferred = evento;
  });

  window.addEventListener("appinstalled", function () {
    ocultar();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", crear);
  } else {
    crear();
  }

  window.addEventListener("load", sincronizarAltura);
})();
