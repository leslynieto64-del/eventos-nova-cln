"""Simplificación de la interfaz (15/11/2026): lo que cambia en el servidor y la lógica pura del flujo guiado.

Servidor (memoria y PostgreSQL de pruebas): la política de no reembolso se comunica una sola vez (la fecha original no se sobrescribe), el detalle del
evento informa política, firma y propuesta de cada contrato, los pagos exponen su identificador interno para verificarlos uno a uno, los servicios
escritos como «Banquete; Música» son dos servicios, las equivalencias de nombres de servicio son explícitas (sin coincidencias aproximadas), cada
servicio se asigna a su propio proveedor y las acciones ya realizadas se rechazan sin duplicar nada.
Navegador (Node): `flujo.js` calcula pasos y «siguiente paso» a partir de los estados reales; `explicar` redacta los rechazos habituales.
Ejecutar desde la raíz:  python -m unittest tests.test_ux_simplificacion -v"""
import json, os, shutil, subprocess, sys, tempfile, unittest
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
sys.path.insert(0, os.path.dirname(__file__))
from apoyo_bd import BaseConBD                                                               # noqa: E402
from apoyo_flujo import FECHA_EVENTO                                                         # noqa: E402
from test_api_operaciones import ApiHttp, CONTENIDO, DATOS, iso                              # noqa: E402
from domain.proveedor import Proveedor, normalizar_servicio, separar_servicios               # noqa: E402
from infrastructure.composicion import construir                                              # noqa: E402
from infrastructure.persistencia.composicion_persistente import construir_persistente          # noqa: E402

AHORA = datetime(2026, 11, 15, 10, 0)
RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
WEB = os.path.join(RAIZ, 'src', 'web')
NODE = shutil.which('node')


class ServiciosYEquivalencias(unittest.TestCase):
    def test_separa_servicios_por_punto_y_coma_y_coma_sin_repetidos(self):
        self.assertEqual(separar_servicios(['Banquete; Musica']), ['Banquete', 'Musica'])
        self.assertEqual(separar_servicios(['Banquete, Música', ' banquetes ', 'DJ;;']), ['Banquete', 'Música', 'DJ'])
        self.assertEqual(separar_servicios([]), [])
        self.assertEqual(separar_servicios(None), [])

    def test_las_equivalencias_son_explicitas_y_no_aproximadas(self):
        for igual in ('Banquetes', ' BANQUETE ', 'banquete'):
            self.assertEqual(normalizar_servicio(igual), 'banquete')
        self.assertEqual(normalizar_servicio('Música'), normalizar_servicio('musica'))
        self.assertNotEqual(normalizar_servicio('Banquet'), normalizar_servicio('Banquete'))         # sin coincidencia aproximada
        self.assertNotEqual(normalizar_servicio('Banquete de gala'), normalizar_servicio('Banquete'))
        p = Proveedor.registrar('PV-1', 'Banquetes Local', ['Banquetes'], '', AHORA)
        self.assertTrue(p.ofrece('Banquete'))
        self.assertFalse(p.ofrece('Banquete; Musica'))                                              # la cadena completa NO es un servicio
        self.assertFalse(p.ofrece('Música'))


class _FlujoUX:
    """Pruebas HTTP comunes a memoria y PostgreSQL."""

    def evento_con_propuesta_aceptada(self, servicios=('Banquete; Musica',)):
        self.ahora = datetime(2026, 11, 2, 9, 0)
        ev = self.post('/eventos', {'cliente_id': 'CL-1', 'datos': {**DATOS, 'fecha_hora': iso(FECHA_EVENTO)}, 'servicios': list(servicios)})['evento_id']
        pr = self.post(f'/eventos/{ev}/propuestas', {**CONTENIDO, 'servicios': list(servicios)})['propuesta_id']
        self.post(f'/propuestas/{pr}/aceptacion', {'version_id': f'{pr}-v1'})
        return ev, pr

    def contratos(self, ev):
        return self.get(f'/eventos/{ev}/administracion')['contratos']

    def test_servicios_juntos_en_una_cadena_son_dos_servicios_en_evento_y_propuesta(self):
        ev, pr = self.evento_con_propuesta_aceptada()
        self.assertEqual(self.get(f'/eventos/{ev}/propuestas')['propuestas'][0]['servicios'], ['Banquete', 'Musica'])
        self.assertEqual(self.get(f'/eventos/{ev}/administracion')['serviciosSolicitados'], ['Banquete', 'Musica'])

    def test_el_contrato_informa_politica_firma_y_propuesta_y_las_acciones_repetidas_se_rechazan(self):
        ev, pr = self.evento_con_propuesta_aceptada()
        self.assertEqual(self.post(f'/propuestas/{pr}/aceptacion', {'version_id': f'{pr}-v1'}, esperado=422)['tipo'], 'rechazo_de_negocio')     # ya aceptada
        ct = self.post(f'/propuestas/{pr}/contrato', {'politica_incluida': True})['datos']['contrato_id']
        self.assertIn('contrato activo', self.post(f'/propuestas/{pr}/contrato', {'politica_incluida': True}, esperado=422)['detalle'])          # no se duplica
        c = self.contratos(ev)
        self.assertEqual(len(c), 1)
        self.assertEqual((c[0]['propuestaId'], c[0]['politicaComunicada'], c[0]['politicaComunicadaEn'], c[0]['firmadoEn'], c[0]['estado']), (pr, False, None, None, 'En preparación'))
        # primera comunicación
        r1 = self.post(f'/contratos/{ct}/comunicacion-politica-no-reembolso', {'fecha': '2026-11-02T10:00:00'})
        self.assertFalse(r1['datos']['ya_registrada'])
        # segunda comunicación: no sobrescribe la fecha original
        r2 = self.post(f'/contratos/{ct}/comunicacion-politica-no-reembolso', {'fecha': '2026-11-03T18:30:00'})
        self.assertTrue(r2['datos']['ya_registrada'])
        self.assertEqual(r2['datos']['comunicada_en'], '2026-11-02T10:00:00')
        c = self.contratos(ev)[0]
        self.assertEqual((c['politicaComunicada'], c['politicaComunicadaEn']), (True, '2026-11-02T10:00:00'))
        # firma una sola vez
        self.post(f'/contratos/{ct}/firma', {'fecha': '2026-11-02T11:00:00'})
        self.assertIn('puede firmarse', self.post(f'/contratos/{ct}/firma', {'fecha': '2026-11-02T12:00:00'}, esperado=422)['detalle'])
        c = self.contratos(ev)[0]
        self.assertEqual((c['estado'], c['firmadoEn']), ('Firmado', '2026-11-02T11:00:00'))
        # la política se conserva tras la firma y tampoco se sobrescribe
        self.assertTrue(self.post(f'/contratos/{ct}/comunicacion-politica-no-reembolso', {'fecha': '2026-11-09T09:00:00'})['datos']['ya_registrada'])
        self.assertEqual(self.contratos(ev)[0]['politicaComunicadaEn'], '2026-11-02T10:00:00')

    def test_pagos_se_verifican_uno_a_uno_por_su_identificador_y_no_se_repite_la_verificacion(self):
        ev, pr = self.evento_con_propuesta_aceptada(('Banquete',))
        ct = self.post(f'/propuestas/{pr}/contrato', {'politica_incluida': True})['datos']['contrato_id']
        self.post(f'/contratos/{ct}/comunicacion-politica-no-reembolso', {'fecha': iso(self.ahora)})
        self.post(f'/contratos/{ct}/firma', {'fecha': iso(self.ahora)})
        ec = self.get(f'/eventos/{ev}/pagos')['estadosCuenta'][0]
        self.assertEqual(ec['anticipo']['importe'], '3000.00')                                      # 30 % de 10,000.00 (regla sin cambios)
        pago = self.post(f"/estados-cuenta/{ec['estadoCuentaId']}/pagos", {'obligacion_id': ec['anticipo']['obligacionId'], 'importe': '3000.00', 'fecha': iso(self.ahora), 'comprobante': 'UX-1', 'verificar_ahora': False})['datos']['pago_id']
        registrados = self.get(f'/eventos/{ev}/pagos')['estadosCuenta'][0]['pagosRegistrados']
        self.assertEqual([(p['pagoId'], p['estado']) for p in registrados], [(pago, 'Registrado')])
        self.post(f"/estados-cuenta/{ec['estadoCuentaId']}/pagos/{pago}/verificacion", {'verificado_en': iso(self.ahora)})
        despues = self.get(f'/eventos/{ev}/pagos')['estadosCuenta'][0]
        self.assertEqual((despues['pagosRegistrados'][0]['estado'], despues['anticipo']['estado']), ('Verificado', 'Liquidada'))
        antes = despues['pagosRegistrados'][0]['verificadoEn']
        self.post(f"/estados-cuenta/{ec['estadoCuentaId']}/pagos/{pago}/verificacion", {'verificado_en': '2026-12-31T00:00:00'}, esperado=(200, 201, 422))
        self.assertEqual(self.get(f'/eventos/{ev}/pagos')['estadosCuenta'][0]['pagosRegistrados'][0]['verificadoEn'], antes)       # la fecha original no se pisa

    def test_proveedores_por_servicio_equivalencias_y_asignacion_independiente(self):
        banq = self.registrar_proveedor('Banquetes Local', ['Banquetes'])                           # catálogo con «Banquetes»; el servicio es «Banquete»
        musica = self.registrar_proveedor('Música Eventos', ['Música'])
        self.post('/proveedores', {'nombre': 'Solo Fotos', 'servicios': ['Fotografía'], 'contacto': ''})
        self.post('/proveedores/' + self.registrar_proveedor('Banquetes Inactivo', ['Banquete']) + '/desactivacion')
        nombres = lambda s: [p['nombre'] for p in self.get('/proveedores', servicio=s)['datos']['proveedores'] if p['activo']]
        self.assertEqual(nombres('Banquete'), ['Banquetes Local'])                                 # equivalente explícito; el inactivo no se ofrece
        self.assertEqual(nombres('musica'), ['Música Eventos'])                                    # sin acentos ni mayúsculas
        self.assertEqual(nombres('Banquete; Musica'), [])                                          # la cadena completa no es un servicio
        # contratar y asignar cada servicio a su proveedor
        self.ahora = datetime(2026, 11, 2, 9, 0)
        ev = self.post('/eventos', {'cliente_id': 'CL-1', 'datos': {**DATOS, 'fecha_hora': iso(FECHA_EVENTO)}, 'servicios': ['Banquete; Musica']})['evento_id']
        pr = self.post(f'/eventos/{ev}/propuestas', {**CONTENIDO, 'servicios': ['Banquete; Musica'], 'proveedores_considerados': [banq, musica]})['propuesta_id']
        self.post(f'/propuestas/{pr}/aceptacion', {'version_id': f'{pr}-v1'})
        ct = self.post(f'/propuestas/{pr}/contrato', {'politica_incluida': True})['datos']['contrato_id']
        self.post(f'/contratos/{ct}/comunicacion-politica-no-reembolso', {'fecha': iso(self.ahora)})
        self.post(f'/contratos/{ct}/firma', {'fecha': iso(self.ahora)})
        ec = self.get(f'/eventos/{ev}/pagos')['estadosCuenta'][0]
        self.post(f"/estados-cuenta/{ec['estadoCuentaId']}/pagos", {'obligacion_id': ec['anticipo']['obligacionId'], 'importe': '3000.00', 'fecha': iso(self.ahora), 'comprobante': 'UX-2', 'verificar_ahora': True})
        servicios = {s['servicio']: s for s in self.get(f'/eventos/{ev}/administracion')['proveedores']}
        self.assertEqual(sorted(servicios), ['Banquete', 'Musica'])                                # dos servicios independientes
        cand = lambda srv: self.get(f"/eventos/{ev}/servicios/{servicios[srv]['servicioContratadoId']}/disponibilidad")['datos']['disponibles']
        self.assertEqual(cand('Banquete'), [banq])
        self.assertEqual(cand('Musica'), [musica])
        for srv, pv in (('Banquete', banq), ('Musica', musica)):
            self.post(f"/eventos/{ev}/servicios/{servicios[srv]['servicioContratadoId']}/proveedor", {'proveedor_id': pv})
        asignados = {s['servicio']: (s['proveedorNombre'], s['estado']) for s in self.get(f'/eventos/{ev}/administracion')['proveedores']}
        self.assertEqual(asignados, {'Banquete': ('Banquetes Local', 'Pendiente de confirmación del proveedor'), 'Musica': ('Música Eventos', 'Pendiente de confirmación del proveedor')})
        # un proveedor no puede asignarse a un servicio que no ofrece
        self.assertEqual(self.post(f"/eventos/{ev}/servicios/{servicios['Banquete']['servicioContratadoId']}/proveedor", {'proveedor_id': musica}, esperado=422)['tipo'], 'rechazo_de_negocio')


class UXEnMemoria(_FlujoUX, ApiHttp, unittest.TestCase):
    def crear_contenedor(self, disponibilidad=None):
        return construir(disponibilidad)


class UXEnPostgreSQL(_FlujoUX, ApiHttp, BaseConBD):
    def setUp(self):
        BaseConBD.setUp(self)
        self.arrancar()

    def crear_contenedor(self, disponibilidad=None):
        return construir_persistente(motor=self.motor, disponibilidad=disponibilidad)

    def test_la_fecha_de_comunicacion_persiste_y_no_se_sobrescribe_tras_reconstruir(self):
        ev, pr = self.evento_con_propuesta_aceptada(('Banquete',))
        ct = self.post(f'/propuestas/{pr}/contrato', {'politica_incluida': True})['datos']['contrato_id']
        self.post(f'/contratos/{ct}/comunicacion-politica-no-reembolso', {'fecha': '2026-11-02T10:00:00'})
        self.arrancar()                                                                             # contenedor nuevo, misma base (equivale a recargar)
        self.post(f'/contratos/{ct}/comunicacion-politica-no-reembolso', {'fecha': '2026-11-05T10:00:00'})
        self.assertEqual(self.contratos(ev)[0]['politicaComunicadaEn'], '2026-11-02T10:00:00')


@unittest.skipUnless(NODE, 'Node.js no está instalado')
class FlujoGuiadoYMensajes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='enova-flujo-')
        for nombre in ('flujo', 'texto'):
            shutil.copy(os.path.join(WEB, 'js', nombre + '.js'), os.path.join(cls.tmp, nombre + '.mjs'))
        cls.corredor = os.path.join(cls.tmp, 'corredor.mjs')
        with open(cls.corredor, 'w', encoding='utf-8') as f:
            f.write("import { calcularFlujo, siguientePaso } from './flujo.mjs';\nimport { explicar } from './texto.mjs';\nimport { readFileSync } from 'node:fs';\n"
                    "const e = JSON.parse(readFileSync(process.argv[2], 'utf-8'));\n"
                    "console.log(JSON.stringify({ casos: e.casos.map((d) => { const f = calcularFlujo(d); const s = siguientePaso(d); return { actual: f.actual, hechos: f.pasos.filter((p) => p.estado === 'hecho').map((p) => p.clave), terminal: f.terminal, titulo: s.titulo, acciones: s.acciones, requisitos: s.requisitos }; }),\n"
                    "  textos: e.textos.map(explicar) }));\n")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def correr(self, casos, textos=()):
        entrada = os.path.join(self.tmp, 'entrada.json')
        with open(entrada, 'w', encoding='utf-8') as f:
            json.dump({'casos': casos, 'textos': list(textos)}, f)
        r = subprocess.run([NODE, self.corredor, entrada], capture_output=True, text=True, encoding='utf-8', timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)

    @staticmethod
    def datos(estado='En gestión', propuestas=(), contrato=None, anticipo=None, servicios=(), saldo='Pendiente', pagos=()):
        ec = [{'contratoId': 'C1', 'anticipo': {'estado': anticipo or 'Pendiente'}, 'saldoContratoOriginal': {'estado': saldo}, 'pagosRegistrados': list(pagos)}] if contrato else []
        return {'estado': estado, 'propuestas': [{'estado': e} for e in propuestas], 'contratos': [dict(contrato, contratoId='C1')] if contrato else [], 'ecs': ec, 'servicios': list(servicios)}

    def test_el_paso_actual_sigue_los_estados_reales(self):
        c = lambda **k: {'estado': 'En preparación', 'politicaComunicada': False, 'firmadoEn': None, **k}
        casos = [
            self.datos(),                                                                                    # recién registrado
            self.datos(propuestas=['En revisión del Cliente']),
            self.datos(propuestas=['Aceptada']),
            self.datos(propuestas=['Aceptada'], contrato=c()),
            self.datos(propuestas=['Aceptada'], contrato=c(politicaComunicada=True)),
            self.datos(propuestas=['Aceptada'], contrato=c(estado='Firmado', politicaComunicada=True, firmadoEn='x')),
            self.datos(propuestas=['Aceptada'], contrato=c(estado='Firmado', politicaComunicada=True, firmadoEn='x'), anticipo='Liquidada'),
        ]
        r = self.correr(casos)['casos']
        self.assertEqual([x['actual'] for x in r], ['propuesta', 'aceptacion', 'contrato', 'politica', 'firma', 'anticipo', 'confirmacion'])
        self.assertEqual(r[3]['acciones'], ['comunicarPolitica'])                                           # no se ofrece «preparar contrato» si ya existe
        self.assertEqual(r[4]['acciones'], ['firmarContrato'])                                              # la política ya comunicada no se vuelve a pedir
        self.assertEqual(r[5]['acciones'], ['registrarPago'])
        self.assertEqual(r[6]['acciones'], ['confirmarContratacion'])
        self.assertIn('politica', r[4]['hechos'])
        self.assertNotIn('contrato', [a for x in r[3:] for a in x['acciones']])

    def test_confirmar_sin_anticipo_explica_el_requisito_y_no_ofrece_el_boton(self):
        d = self.datos(propuestas=['Aceptada'], contrato={'estado': 'Firmado', 'politicaComunicada': True, 'firmadoEn': 'x'}, anticipo='Pendiente')
        d['_paso'] = 'confirmacion'
        sig = self.correr([d])['casos'][0]
        self.assertEqual(sig['actual'], 'anticipo')                                                          # primero el anticipo
        self.assertNotIn('confirmarContratacion', sig['acciones'])

    def test_con_un_pago_registrado_sin_verificar_la_accion_es_verificarlo_no_registrar_otro(self):
        d = self.datos(propuestas=['Aceptada'], contrato={'estado': 'Firmado', 'politicaComunicada': True, 'firmadoEn': 'x'}, pagos=[{'estado': 'Registrado'}])
        sig = self.correr([d])['casos'][0]
        self.assertEqual((sig['actual'], sig['acciones']), ('anticipo', []))
        self.assertIn('Verificar', sig['titulo'])

    def test_organizacion_seguimiento_pago_final_y_cierre(self):
        firmado = {'estado': 'Contratación confirmada', 'politicaComunicada': True, 'firmadoEn': 'x'}
        s = lambda *e: [{'servicio': f'S{i}', 'estado': x} for i, x in enumerate(e)]
        casos = [
            self.datos('En organización', ['Aceptada'], firmado, 'Liquidada', s('Sin proveedor asignado', 'Sin proveedor asignado')),
            self.datos('En organización', ['Aceptada'], firmado, 'Liquidada', s('Pendiente de confirmación del proveedor', 'Confirmado por el proveedor')),
            self.datos('En organización', ['Aceptada'], firmado, 'Liquidada', s('Confirmado por el proveedor', 'Confirmado por el proveedor')),
            self.datos('En ejecución', ['Aceptada'], firmado, 'Liquidada', s('Confirmado por el proveedor'), saldo='Liquidada'),
            self.datos('Finalizado', ['Aceptada'], firmado, 'Liquidada', s('Confirmado por el proveedor'), saldo='Liquidada'),
            self.datos('Cancelado', ['Aceptada'], firmado, 'Liquidada'),
            self.datos('Cerrado sin contratación', ['Cerrada por no aceptación']),
        ]
        r = self.correr(casos)['casos']
        self.assertEqual([x['actual'] for x in r], ['asignacion', 'seguimiento', 'pagofinal', 'cierre', None, None, None])
        self.assertEqual(r[3]['acciones'], ['finalizarEvento'])
        self.assertEqual((r[5]['terminal'], r[6]['terminal']), ('Cancelado', 'Cerrado sin contratación'))
        self.assertTrue(all(x['hechos'][:2] == ['registro', 'necesidades'] for x in r))

    def test_los_rechazos_habituales_se_explican_en_lenguaje_claro(self):
        t = self.correr([], ['Ya existe un contrato activo para el evento.', 'La propuesta está Aceptada.', 'Solo un contrato En preparación puede firmarse.',
                             'Mensaje que no tiene explicación propia'])['textos']
        self.assertIn('El contrato ya fue preparado', t[0])
        self.assertIn('ya fue aceptada', t[1])
        self.assertIn('ya fue firmado', t[2])
        self.assertEqual(t[3], 'Mensaje que no tiene explicación propia')


if __name__ == '__main__':
    unittest.main()
