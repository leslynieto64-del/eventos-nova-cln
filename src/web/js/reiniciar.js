/* Página de limpieza (reiniciar.html): vuelve a pedir al servidor, sin usar la caché del navegador, todos los archivos de la interfaz y regresa a la aplicación.
   No cierra la sesión ni borra datos. Depende de arranque.js, que define window.eventosNovaActualizar. */
(function () {
  'use strict';
  window.__eventosNovaListo = true;                    // esta página no es la aplicación: arranque.js no debe mostrar su aviso de rescate
  function iniciar() {
    if (typeof window.eventosNovaActualizar === 'function') window.eventosNovaActualizar(null, './');
    else window.location.replace('./');
  }
  document.addEventListener('DOMContentLoaded', function () { setTimeout(iniciar, 400); });
})();
