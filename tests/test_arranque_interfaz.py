"""Arranque de la interfaz: caché del navegador, pantalla de rescate y recuperación de la sesión.

Causa que se corrige (15/11/2026): la interfaz se servía con «ETag» y «Last-Modified» pero SIN «Cache-Control». El navegador aplicaba caché heurística y, tras reconstruir la
aplicación, mezclaba módulos JavaScript de versiones distintas: el enlace de módulos fallaba («does not provide an export named …»), main.js nunca se ejecutaba y quedaba el
menú del HTML visible con el contenido en blanco. En incógnito (sin caché) funcionaba. El comportamiento en Chrome real se comprobó con un proxy que imita al servidor anterior.
Ejecutar desde la raíz:  python -m unittest tests.test_arranque_interfaz -v"""
import os, re, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
from fastapi.testclient import TestClient                                                    # noqa: E402
from api.main import crear_app                                                               # noqa: E402

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
WEB = os.path.join(RAIZ, 'src', 'web')


def leer(*partes):
    with open(os.path.join(WEB, *partes), encoding='utf-8') as f:
        return f.read()


class CabecerasDeLaInterfaz(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cliente = TestClient(crear_app())

    def test_toda_la_interfaz_se_revalida_siempre_y_acepta_peticiones_condicionales(self):
        for ruta in ('/app/', '/app/index.html', '/app/js/main.js', '/app/js/ui.js', '/app/js/arranque.js', '/app/css/app.css'):
            with self.subTest(ruta):
                r = self.cliente.get(ruta)
                self.assertEqual(r.status_code, 200)
                self.assertEqual(r.headers.get('cache-control'), 'no-cache')                     # revalidar con ETag en cada carga: nunca versiones mezcladas
                self.assertTrue(r.headers.get('etag'))
                condicional = self.cliente.get(ruta, headers={'If-None-Match': r.headers['etag']})
                self.assertEqual(condicional.status_code, 304)                                   # sin descargar de nuevo si no cambió
                self.assertEqual(condicional.headers.get('cache-control'), 'no-cache')

    def test_la_pagina_de_limpieza_no_se_guarda_y_pide_vaciar_solo_la_cache(self):
        r = self.cliente.get('/app/reiniciar.html')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers.get('cache-control'), 'no-store')
        self.assertEqual(r.headers.get('clear-site-data'), '"cache"')                            # ni cookies ni almacenamiento: la sesión se conserva
        self.assertIn('js/reiniciar.js', r.text)

    def test_la_politica_de_seguridad_de_contenido_se_mantiene(self):
        csp = self.cliente.get('/app/').headers.get('content-security-policy', '')
        self.assertIn("script-src 'self'", csp)
        self.assertNotIn('unsafe-inline', csp)

    def test_las_respuestas_de_la_api_siguen_sin_guardarse_en_cache(self):
        self.assertEqual(self.cliente.get('/health').headers.get('cache-control'), 'no-store')


class ArranqueSinPantallaEnBlanco(unittest.TestCase):
    def test_index_muestra_estado_de_carga_oculta_el_menu_y_carga_primero_la_red_de_seguridad(self):
        html = leer('index.html')
        self.assertIn('<body class="sin-sesion">', html)                                        # sin menú completo mientras no arranque la aplicación
        self.assertRegex(html, r'<main id="contenido"[^>]*><div class="cargando"[^>]*>.*Cargando Eventos Nova')   # nunca queda vacío mientras carga
        self.assertLess(html.index('js/arranque.js'), html.index('type="module" src="js/main.js"'))
        self.assertNotRegex(html, r'<script(?![^>]*\bsrc=)[^>]*>')                                 # sin scripts en línea (CSP)
        self.assertNotRegex(html, r'\sstyle=')                                                    # sin estilos en línea (CSP)

    def test_arranque_detecta_un_fallo_de_enlace_explica_y_ofrece_actualizar_sin_tocar_la_sesion(self):
        js = leer('js', 'arranque.js')
        for fragmento in ('No se pudo cargar la aplicación', 'Actualizar la aplicación', "addEventListener('error'", '__eventosNovaListo', "cache: 'reload'", 'reiniciar.html'):
            self.assertIn(fragmento, js)
        self.assertNotIn('localStorage', js)                                                      # no borra almacenamiento ni cookies
        self.assertNotIn('document.cookie', js)

    def test_main_avisa_que_arranco_y_nunca_trata_un_error_de_conexion_como_sesion_vencida(self):
        main = leer('js', 'main.js')
        self.assertIn('window.__eventosNovaListo = true', main)
        self.assertIn('Comprobando tu sesión', main)
        self.assertIn('No se pudo comprobar tu sesión', main)
        self.assertIn('Reintentar', main)
        sesion = leer('js', 'sesion.js')
        self.assertRegex(sesion, r"e instanceof ErrorApi && e\.tipo === 'sesion'")                # solo un 401 equivale a «sin sesión»; lo demás se informa
        api = leer('js', 'api.js')
        self.assertIn("estado === 401", api)
        self.assertIn("sesion-expirada", api)

    def test_la_pagina_de_limpieza_no_es_la_aplicacion_ni_muestra_el_aviso_de_rescate(self):
        self.assertIn('__eventosNovaListo = true', leer('js', 'reiniciar.js'))
        self.assertIn("eventosNovaActualizar(null, './')", leer('js', 'reiniciar.js'))


if __name__ == '__main__':
    unittest.main()
