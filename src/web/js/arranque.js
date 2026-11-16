/* Red de seguridad del arranque (script clásico, se carga ANTES que la aplicación). Si los módulos no se pueden enlazar —por ejemplo, porque el navegador conserva
   archivos JavaScript de una versión anterior mezclados con los nuevos— main.js nunca se ejecuta y la pantalla quedaría en blanco. Aquí se detecta ese caso, se
   explica qué ocurrió y se ofrece actualizar la aplicación sin tocar la sesión ni los datos. main.js marca `window.__eventosNovaListo = true` al arrancar. */
(function () {
  'use strict';
  var MOSTRADO = false;
  var ESPERA_MS = 8000;

  function listo() { return window.__eventosNovaListo === true; }

  /** Vuelve a pedir al servidor (sin usar la caché) main.js y, recursivamente, todos los módulos que importa; después recarga. */
  function actualizar(boton, destino) {
    if (boton) { boton.disabled = true; boton.textContent = 'Actualizando…'; }
    var terminar = function () { if (destino) window.location.replace(destino); else window.location.reload(); };
    var base = new URL('js/', document.baseURI).href;
    var vistos = {};
    function traer(url) {
      if (vistos[url]) return Promise.resolve();
      vistos[url] = true;
      return fetch(url, { cache: 'reload', credentials: 'same-origin' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (texto) {
        var hijos = [];
        var re = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+\.js)['"]/g, m;
        while ((m = re.exec(texto)) !== null) hijos.push(new URL(m[1], url).href);
        return Promise.all(hijos.map(traer));
      }).catch(function () { /* se sigue con el resto: la recarga final decide */ });
    }
    Promise.all([traer(base + 'main.js'), fetch(new URL('css/app.css', document.baseURI).href, { cache: 'reload' }).catch(function () {}),
      fetch(new URL('./', document.baseURI).href, { cache: 'reload' }).catch(function () {}), fetch(document.location.pathname, { cache: 'reload' }).catch(function () {})]).then(terminar, terminar);
  }
  window.eventosNovaActualizar = actualizar;

  function mostrar(detalle) {
    if (listo() || MOSTRADO) return;
    var zona = document.getElementById('contenido');
    if (!zona) return;
    MOSTRADO = true;
    document.body.classList.add('sin-sesion');                       // sin menú completo ni páginas a medias mientras no arranque
    var caja = document.createElement('div'); caja.className = 'caja-error'; caja.setAttribute('role', 'alert');
    var cuerpo = document.createElement('div');
    var t = document.createElement('strong'); t.textContent = 'No se pudo cargar la aplicación';
    var p1 = document.createElement('p'); p1.textContent = 'Es probable que el navegador conserve archivos de una versión anterior de Eventos Nova. No se perdió ningún dato ni se cerró tu sesión.';
    var p2 = document.createElement('p'); p2.textContent = 'Pulsa «Actualizar la aplicación». Si el problema continúa, abre la dirección de limpieza o prueba en una ventana de incógnito.';
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-primario'; b.textContent = 'Actualizar la aplicación';
    b.addEventListener('click', function () { actualizar(b); });
    var a = document.createElement('a'); a.className = 'btn'; a.href = 'reiniciar.html'; a.textContent = 'Limpiar archivos guardados';
    a.style.marginLeft = '.5rem';
    var d = document.createElement('details'); var s = document.createElement('summary'); s.textContent = 'Detalles técnicos';
    var pre = document.createElement('pre'); pre.textContent = String(detalle || 'La aplicación no arrancó.').slice(0, 600);
    d.appendChild(s); d.appendChild(pre);
    cuerpo.appendChild(t); cuerpo.appendChild(p1); cuerpo.appendChild(p2); cuerpo.appendChild(b); cuerpo.appendChild(a); cuerpo.appendChild(d);
    caja.appendChild(cuerpo);
    zona.textContent = '';
    zona.appendChild(caja);
  }

  // Un módulo que no se puede enlazar o cargar produce un error de ventana (o un evento «error» del script de entrada).
  window.addEventListener('error', function (e) {
    var archivo = (e && e.filename) || '';
    var msg = (e && e.message) || '';
    if (!listo() && (archivo.indexOf('/app/') !== -1 || /module|import|export|Unexpected token|Failed to fetch/i.test(msg))) setTimeout(function () { mostrar(msg || archivo); }, 300);
  });
  document.addEventListener('DOMContentLoaded', function () {
    var entrada = document.querySelector('script[type="module"]');
    if (entrada) entrada.addEventListener('error', function () { mostrar('No se pudo cargar js/main.js'); });
  });
  setTimeout(function () { if (!listo()) mostrar('La aplicación no arrancó en ' + (ESPERA_MS / 1000) + ' segundos.'); }, ESPERA_MS);
})();
