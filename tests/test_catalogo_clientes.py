"""Catálogo de clientes: el cliente se reconoce o se registra al registrar su evento, con un identificador `CL-<uuid>` generado por el servidor.

Cubre el dominio (normalización y validación), la API en memoria y sobre PostgreSQL (base de PRUEBAS): alta, reutilización por correo,
datos contradictorios, personas distintas con el mismo nombre, validaciones, compatibilidad con `cliente_id`, eventos anteriores al catálogo,
consulta del cliente desde el evento y desde la lista, integración con propuestas, contrato, pagos y servicios, permisos, concurrencia y la
migración 0010.
Ejecutar desde la raíz:  python -m unittest tests.test_catalogo_clientes -v"""
import os, sys, threading, unittest
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
sys.path.insert(0, os.path.dirname(__file__))
from apoyo_bd import BaseConBD                                                               # noqa: E402
from apoyo_flujo import FECHA_EVENTO                                                         # noqa: E402
from test_api_operaciones import ApiHttp, CONTENIDO, DATOS, iso                              # noqa: E402
from application.seguridad import MATRIZ, autoriza                                           # noqa: E402
from application.servicios import GestionCatalogoClientesService                             # noqa: E402
from domain.cliente import Cliente, normalizar_correo, normalizar_telefono                   # noqa: E402
from domain.valores import ErrorDominio                                                      # noqa: E402
from infrastructure.composicion import construir                                              # noqa: E402
from infrastructure.persistencia.composicion_persistente import construir_persistente          # noqa: E402
from infrastructure.persistencia.repositorios_sql import ClienteRepositorySQL                 # noqa: E402

AHORA = datetime(2026, 11, 15, 10, 0)
ANA = {'nombres': 'Ana María', 'apellidos': 'López Pérez', 'telefono': '5512345678', 'correo': 'ana.lopez@ejemplo.com'}


class DominioDelCliente(unittest.TestCase):
    def test_limpia_los_datos_y_normaliza_el_correo(self):
        c = Cliente.registrar('CL-1', '  Ana   María ', ' López  Pérez ', ' 5512345678 ', '  Ana.Lopez@EJEMPLO.com ', AHORA)
        self.assertEqual((c.nombres, c.apellidos, c.telefono, c.correo), ('Ana María', 'López Pérez', '5512345678', 'ana.lopez@ejemplo.com'))
        self.assertEqual(c.correo_normalizado, 'ana.lopez@ejemplo.com')
        self.assertEqual(c.nombre_completo, 'Ana María López Pérez')
        self.assertEqual(normalizar_correo('  A@B.Com '), 'a@b.com')
        self.assertEqual(normalizar_telefono('(55) 1234-5678'), '5512345678')

    def test_correos_no_validos_se_rechazan(self):
        for malo in ('', '   ', 'sin-arroba', 'a@b', 'a@@b.com', 'a b@c.com', '@c.com', 'a@.com', 'a@c.', 'x' * 250 + '@c.com'):
            with self.subTest(malo[:20]), self.assertRaises(ErrorDominio):
                Cliente.registrar('CL-1', 'Ana', 'López', '5512345678', malo, AHORA)

    def test_telefonos_no_validos_se_rechazan_y_los_validos_se_aceptan(self):
        for malo in ('', '12345', '123456789', '12345678901', 'abcdefghij', '55-1234-56', '55 1234 5678', '(55) 1234-5678', '+525512345678', '55123456٣٤', '1' * 16):
            with self.subTest(malo), self.assertRaises(ErrorDominio):
                Cliente.registrar('CL-1', 'Ana', 'López', malo, 'a@b.com', AHORA)
        for bueno in ('5512345678', ' 5512345678 ', '0000000000'):
            with self.subTest(bueno):
                Cliente.registrar('CL-1', 'Ana', 'López', bueno, 'a@b.com', AHORA)

    def test_nombre_y_apellidos_son_obligatorios_y_acotados(self):
        for nombres, apellidos in (('', 'López'), ('Ana', ''), ('   ', 'López'), ('Ana', '  '), ('x' * 101, 'López'), ('Ana', 'y' * 101)):
            with self.subTest((nombres[:5], apellidos[:5])), self.assertRaises(ErrorDominio):
                Cliente.registrar('CL-1', nombres, apellidos, '5512345678', 'a@b.com', AHORA)
        with self.assertRaises(ErrorDominio):
            Cliente.registrar('  ', 'Ana', 'López', '5512345678', 'a@b.com', AHORA)

    def test_coincidencia_y_busqueda_sin_acentos_ni_mayusculas(self):
        a = Cliente.registrar('CL-1', 'Ana María', 'López', '5512345678', 'a@b.com', AHORA)
        self.assertTrue(a.coincide_con(Cliente.registrar('CL-2', 'ANA MARIA', 'lopez', '5512345678', 'a@b.com', AHORA)))
        self.assertFalse(a.coincide_con(Cliente.registrar('CL-2', 'Ana María', 'López', '5599999999', 'a@b.com', AHORA)))
        self.assertFalse(a.coincide_con(Cliente.registrar('CL-2', 'Ana Marta', 'López', '5512345678', 'a@b.com', AHORA)))
        historico = Cliente('CL-H', 'Ana María', 'López', '55 1234 5678', 'a@b.com', AHORA)               # registro anterior a la regla: se lee y se compara por dígitos
        self.assertTrue(historico.coincide_con(a))
        for q in ('maria', 'LOPEZ', 'cl-1', '1234', 'a@b', ''):
            self.assertTrue(a.contiene(q), q)
        self.assertFalse(a.contiene('zapata'))


class _FlujoDeClientes:
    """Pruebas HTTP comunes a memoria y PostgreSQL (la subclase decide el contenedor)."""

    def evento(self, cliente=None, datos=None, esperado=201, **extra):
        cuerpo = {'cliente': cliente if cliente is not None else dict(ANA), 'datos': datos or dict(DATOS), 'servicios': ['Banquete'], **extra}
        return self.post('/eventos', cuerpo, esperado=esperado)

    def ficha(self, cliente_id):
        return self.get(f'/clientes/{cliente_id}')['datos']

    def test_un_cliente_nuevo_recibe_su_identificador_y_se_puede_consultar(self):
        r = self.evento()
        c = r['cliente']
        self.assertRegex(c['clienteId'], r'^CL-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')      # CL- + UUID versión 4
        self.assertTrue(r['cliente_nuevo'])
        self.assertTrue(r['evento_id'].startswith('EV-'))
        self.assertEqual((c['nombreCompleto'], c['telefono'], c['correo']), ('Ana María López Pérez', '5512345678', 'ana.lopez@ejemplo.com'))
        ficha = self.ficha(c['clienteId'])
        self.assertEqual((ficha['nombres'], ficha['apellidos'], ficha['telefono'], ficha['correo']), ('Ana María', 'López Pérez', '5512345678', 'ana.lopez@ejemplo.com'))
        self.assertIn('registradoEn', ficha)
        self.assertEqual(self.get('/clientes')['datos']['clientes'][0]['clienteId'], c['clienteId'])

    def test_otro_evento_del_mismo_cliente_conserva_su_identificador_sin_duplicar(self):
        a = self.evento()
        b = self.evento(cliente={**ANA, 'correo': '  ANA.LOPEZ@Ejemplo.COM ', 'nombres': 'ana maría', 'telefono': '5512345678'},
                        datos={**DATOS, 'lugar': 'Jardín'})
        self.assertEqual(a['cliente']['clienteId'], b['cliente']['clienteId'])
        self.assertFalse(b['cliente_nuevo'])
        self.assertNotEqual(a['evento_id'], b['evento_id'])
        self.assertEqual(len(self.get('/clientes')['datos']['clientes']), 1)
        for e in (a, b):
            self.assertEqual(self.get(f"/eventos/{e['evento_id']}/administracion")['clienteId'], a['cliente']['clienteId'])

    def test_dos_personas_con_el_mismo_nombre_y_correos_distintos_son_clientes_distintos(self):
        a = self.evento()
        b = self.evento(cliente={**ANA, 'correo': 'otra.ana@ejemplo.com', 'telefono': '5598765432'})
        self.assertNotEqual(a['cliente']['clienteId'], b['cliente']['clienteId'])
        self.assertTrue(b['cliente_nuevo'])
        self.assertEqual(len(self.get('/clientes')['datos']['clientes']), 2)

    def test_mismo_correo_con_datos_contradictorios_no_une_los_registros_ni_crea_el_evento(self):
        self.evento()
        eventos_antes = len(self.get('/eventos', desde='2000-01-01T00:00:00', hasta='2100-01-01T00:00:00')['eventos'])
        for cambio in ({'nombres': 'Beatriz'}, {'apellidos': 'Ramírez'}, {'telefono': '5500001111'}):
            with self.subTest(cambio):
                r = self.evento(cliente={**ANA, **cambio}, esperado=422)
                self.assertEqual(r['tipo'], 'rechazo_de_negocio')
                self.assertIn('no coinciden', r['detalle'])
                self.assertIn('Revisa los datos', r['detalle'])
        self.assertEqual(len(self.get('/clientes')['datos']['clientes']), 1)
        self.assertEqual(len(self.get('/eventos', desde='2000-01-01T00:00:00', hasta='2100-01-01T00:00:00')['eventos']), eventos_antes)
        self.assertEqual(self.ficha(self.get('/clientes')['datos']['clientes'][0]['clienteId'])['nombres'], 'Ana María')       # la ficha original no cambió

    def test_validaciones_de_correo_telefono_y_forma(self):
        for cambio in ({'correo': 'no-es-correo'}, {'correo': ''}, {'telefono': '123'}, {'telefono': 'abc'}, {'nombres': ''}, {'apellidos': '   '}):
            with self.subTest(cambio):
                self.assertEqual(self.evento(cliente={**ANA, **cambio}, esperado=422)['tipo'], 'rechazo_de_negocio')
        self.assertEqual(self.get('/clientes')['datos']['clientes'], [])                  # un dato inválido no deja clientes a medias
        self.evento(cliente={'nombres': 'Ana'}, esperado=422)                              # faltan campos: validación de forma
        self.evento(cliente={**ANA, 'curp': 'XXXX'}, esperado=422)                         # no se aceptan datos personales innecesarios
        self.post('/eventos', {'datos': DATOS, 'servicios': ['Banquete']}, esperado=422)   # ni cliente ni cliente_id
        self.post('/eventos', {'cliente': ANA, 'cliente_id': 'CL-1', 'datos': DATOS, 'servicios': ['Banquete']}, esperado=422)   # las dos formas a la vez

    def test_un_evento_invalido_no_registra_evento_pero_el_cliente_valido_se_reutiliza_al_reintentar(self):
        malo = self.evento(datos={**DATOS, 'lugar': ''}, esperado=422)
        self.assertEqual(malo['tipo'], 'rechazo_de_negocio')
        ok = self.evento()
        self.assertEqual(len(self.get('/clientes')['datos']['clientes']), 1)               # el reintento no duplicó al cliente
        self.assertTrue(ok['evento_id'].startswith('EV-'))

    def test_la_forma_anterior_con_cliente_id_sigue_funcionando(self):
        e = self.post('/eventos', {'cliente_id': 'CL-1', 'datos': DATOS, 'servicios': ['Banquete']})
        self.assertEqual(set(e), {'evento_id', 'mensaje'})                                  # la respuesta anterior no cambia
        self.assertEqual(self.get('/clientes')['datos']['clientes'], [])                    # y no crea clientes ficticios
        info = self.get(f"/eventos/{e['evento_id']}/administracion")
        self.assertEqual((info['clienteId'], info['cliente']), ('CL-1', None))             # evento anterior al catálogo: identificador sin ficha
        self.assertEqual(self.get('/clientes/CL-1', esperado=404)['tipo'], 'no_encontrado')
        lista = self.get('/eventos', desde='2000-01-01T00:00:00', hasta='2100-01-01T00:00:00')['eventos']
        self.assertEqual((lista[0]['clienteId'], lista[0].get('clienteNombre')), ('CL-1', None))

    def test_el_detalle_y_la_lista_de_eventos_muestran_al_cliente(self):
        e = self.evento()
        info = self.get(f"/eventos/{e['evento_id']}/administracion")
        self.assertEqual(info['clienteId'], e['cliente']['clienteId'])
        self.assertEqual((info['cliente']['nombreCompleto'], info['cliente']['telefono'], info['cliente']['correo']),
                         ('Ana María López Pérez', '5512345678', 'ana.lopez@ejemplo.com'))
        lista = self.get('/eventos', desde='2000-01-01T00:00:00', hasta='2100-01-01T00:00:00')['eventos']
        self.assertEqual((lista[0]['clienteId'], lista[0]['clienteNombre']), (e['cliente']['clienteId'], 'Ana María López Pérez'))

    def test_busqueda_de_clientes_y_404(self):
        self.evento()
        self.evento(cliente={**ANA, 'nombres': 'Luis', 'apellidos': 'Núñez', 'correo': 'luis@ejemplo.com', 'telefono': '5522223333'})
        nombres = lambda **p: [c['nombres'] for c in self.get('/clientes', **p)['datos']['clientes']]
        self.assertEqual(nombres(), ['Ana María', 'Luis'])
        self.assertEqual(nombres(q='NUNEZ'), ['Luis'])
        self.assertEqual(nombres(q='ana.lopez'), ['Ana María'])
        self.assertEqual(nombres(q='2222'), ['Luis'])
        self.assertEqual(nombres(q='no existe'), [])
        self.assertEqual(self.get('/clientes/CL-NO-EXISTE', esperado=404)['tipo'], 'no_encontrado')

    def test_el_cliente_nuevo_recorre_propuesta_contrato_pagos_y_consultas_sin_cambios_en_los_importes(self):
        self.ahora = datetime(2026, 11, 2, 9, 0)
        e = self.evento(datos={**DATOS, 'fecha_hora': iso(FECHA_EVENTO)})
        evento = e['evento_id']
        propuesta = self.post(f'/eventos/{evento}/propuestas', CONTENIDO)['propuesta_id']
        self.assertEqual([p['propuestaId'] for p in self.get(f'/eventos/{evento}/propuestas')['propuestas']], [propuesta])
        self.post(f'/propuestas/{propuesta}/aceptacion', {'version_id': f'{propuesta}-v1'})
        contrato = self.post(f'/propuestas/{propuesta}/contrato', {'politica_incluida': True})['datos']['contrato_id']
        self.post(f'/contratos/{contrato}/firma', {'fecha': iso(self.ahora)})
        pagos = self.get(f'/eventos/{evento}/pagos')['estadosCuenta'][0]
        self.assertEqual(pagos['anticipo']['importe'], '3000.00')                           # 30 % de 10,000.00: la política de anticipo no cambió
        info = self.get(f'/eventos/{evento}/administracion')
        self.assertEqual(info['cliente']['clienteId'], e['cliente']['clienteId'])
        self.assertEqual([c['contratoId'] for c in info['contratos']], [contrato])
        self.get('/pagos-pendientes', evento_id=evento)
        self.get('/devoluciones-pendientes', evento_id=evento)
        self.get('/solicitudes', evento_id=evento)
        self.get(f'/eventos/{evento}/solicitudes-pendientes')
        self.get('/servicios-pendientes-confirmacion')
        self.assertEqual(self.get('/proveedores')['datos']['proveedores'], [])

    def test_la_matriz_de_permisos_protege_los_datos_personales(self):
        for ruta in ('/clientes', '/clientes/{cliente_id}'):
            self.assertIn(('GET', ruta), MATRIZ)
            self.assertTrue(autoriza('administrador', 'GET', ruta))
            self.assertTrue(autoriza('coordinador', 'GET', ruta))
            self.assertFalse(autoriza('proveedor', 'GET', ruta))
            self.assertFalse(autoriza('desconocido', 'GET', ruta))
        self.assertTrue(autoriza('coordinador', 'POST', '/eventos'))
        self.assertFalse(autoriza('administrador', 'POST', '/eventos'))                    # registrar eventos sigue siendo de Coordinación
        self.assertNotIn(('POST', '/clientes'), MATRIZ)                                    # el alta solo ocurre al registrar un evento


class ClientesEnMemoria(_FlujoDeClientes, ApiHttp, unittest.TestCase):
    def crear_contenedor(self, disponibilidad=None):
        return construir(disponibilidad)

    def test_dos_altas_simultaneas_con_el_mismo_correo_dejan_un_solo_cliente(self):
        self._concurrencia(self.contenedor.servicios.clientes)

    def _concurrencia(self, servicio):
        resultados, errores = [], []
        tope = threading.Barrier(8)

        def alta(i, correo):
            try:
                tope.wait()
                resultados.append(servicio.registrar_o_identificar('Ana', 'López', '5512345678', correo, AHORA))
            except Exception as e:                                                          # pragma: no cover
                errores.append(e)

        hilos = [threading.Thread(target=alta, args=(i, 'misma@ejemplo.com')) for i in range(8)]
        [h.start() for h in hilos]
        [h.join() for h in hilos]
        self.assertEqual(errores, [])
        self.assertTrue(all(r.exito for r in resultados))
        self.assertEqual(len({r.datos['cliente']['clienteId'] for r in resultados}), 1)
        self.assertEqual(sum(1 for r in resultados if r.datos['clienteNuevo']), 1)           # solo una alta fue nueva
        self.assertEqual(len(servicio.listar_clientes().datos['clientes']), 1)


class ClientesEnPostgreSQL(_FlujoDeClientes, ApiHttp, BaseConBD):
    def setUp(self):
        BaseConBD.setUp(self)
        self.arrancar()

    def crear_contenedor(self, disponibilidad=None):
        return construir_persistente(motor=self.motor, disponibilidad=disponibilidad)

    def test_persiste_tras_reconstruir_el_contenedor(self):
        e = self.evento()
        self.arrancar()                                                                      # contenedor y aplicación nuevos, misma base
        self.assertEqual(self.ficha(e['cliente']['clienteId'])['correo'], 'ana.lopez@ejemplo.com')
        otra = self.evento(datos={**DATOS, 'lugar': 'Jardín'})
        self.assertEqual(otra['cliente']['clienteId'], e['cliente']['clienteId'])
        self.assertEqual(self.contar('cliente'), 1)
        self.assertEqual(self.contar('evento'), 2)

    def test_la_base_impide_correos_duplicados_aunque_se_salte_la_aplicacion(self):
        repo = ClienteRepositorySQL(self.contenedor.almacen)
        self.assertTrue(repo.guardar(Cliente.registrar('CL-A', 'Ana', 'López', '5512345678', 'a@b.com', AHORA)))
        self.assertFalse(repo.guardar(Cliente.registrar('CL-B', 'Otra', 'Persona', '5598765432', ' A@B.COM ', AHORA)))     # mismo correo normalizado
        self.assertFalse(repo.guardar(Cliente.registrar('CL-A', 'Otra', 'Persona', '5598765432', 'c@d.com', AHORA)))      # mismo identificador
        self.assertEqual([c.cliente_id for c in repo.listar_todos()], ['CL-A'])
        self.assertEqual(repo.obtener_por_correo('a@b.com').nombres, 'Ana')
        self.assertIsNone(repo.obtener_por_correo('c@d.com'))
        self.assertIsNone(repo.obtener_por_id('CL-B'))

    def test_altas_simultaneas_con_el_mismo_correo_dejan_una_sola_fila(self):
        ClientesEnMemoria._concurrencia(self, GestionCatalogoClientesService(ClienteRepositorySQL(self.contenedor.almacen)))
        self.assertEqual(self.contar('cliente'), 1)

    def test_altas_simultaneas_con_correos_distintos_generan_identificadores_unicos(self):
        servicio = GestionCatalogoClientesService(ClienteRepositorySQL(self.contenedor.almacen))
        resultados = []
        tope = threading.Barrier(12)

        def alta(i):
            tope.wait()
            resultados.append(servicio.registrar_o_identificar('Ana', 'López', '5512345678', f'persona{i}@ejemplo.com', AHORA))

        hilos = [threading.Thread(target=alta, args=(i,)) for i in range(12)]
        [h.start() for h in hilos]
        [h.join() for h in hilos]
        ids = [r.datos['cliente']['clienteId'] for r in resultados]
        self.assertTrue(all(r.exito and r.datos['clienteNuevo'] for r in resultados))
        self.assertEqual((len(ids), len(set(ids)), self.contar('cliente')), (12, 12, 12))
        self.assertTrue(all(i.startswith('CL-') and len(i) == 39 for i in ids))               # «CL-» + UUID de 36 caracteres

    def test_los_eventos_anteriores_y_su_identificador_historico_no_se_tocan(self):
        e = self.post('/eventos', {'cliente_id': 'CL-DEMO-01', 'datos': DATOS, 'servicios': ['Banquete']})
        nuevo = self.evento()
        self.assertEqual(self.contar('cliente'), 1)                                           # nada de clientes ficticios para el histórico
        self.assertEqual(self.get(f"/eventos/{e['evento_id']}/administracion")['clienteId'], 'CL-DEMO-01')
        self.assertEqual(self.get(f"/eventos/{nuevo['evento_id']}/administracion")['cliente']['correo'], 'ana.lopez@ejemplo.com')


if __name__ == '__main__':
    unittest.main()
