"""Indisponibilidad reportada por el proveedor, sustitución completa, proceso guiado de las solicitudes (orden de acciones), cargo por cambio tardío, anexos y
versiones de propuesta con cotización por servicio. Con autenticación activa, llamando directo a la API, con la composición en memoria y con PostgreSQL (base de PRUEBAS).
Ejecutar desde la raíz:  python -m unittest tests.test_solicitudes_sustitucion_anexos -v"""
import os, sys, unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
sys.path.insert(0, os.path.dirname(__file__))
from apoyo_bd import BaseConBD                                                               # noqa: E402
from test_decisiones_dp2_s7_s8 import Apoyo, T                                               # noqa: E402
from test_seguridad import T0                                                                # noqa: E402
from application.seguridad import ADMINISTRADOR, COORDINADOR, MATRIZ, PROVEEDOR, autoriza, permisos_del_rol   # noqa: E402
from infrastructure.composicion import construir                                              # noqa: E402
from infrastructure.persistencia.composicion_persistente import construir_persistente          # noqa: E402

DIA = T0 + timedelta(days=1)


class Flujo(Apoyo):
    def decision(self, actor, aprobada=True):
        return {'actor': actor, 'aprobada': aprobada, 'fecha': self.ahora.isoformat(), 'motivo': ''}

    def fila(self, evento, sid):
        return next(f for f in self.coord.get('/solicitudes', params={'evento_id': evento}).json()['solicitudes'] if f['solicitudId'] == sid)

    def siguiente(self, evento, sid):
        p = self.fila(evento, sid)['proceso']
        return p['siguiente']['clave'] if p['siguiente'] else None

    def estados_de_pasos(self, evento, sid):
        return {p['clave']: p['estado'] for p in self.fila(evento, sid)['proceso']['pasos']}

    def aceptado(self, evento, nombre='Banquete', pv=None, servicios=('Banquete',)):
        """Asigna un proveedor al servicio y la cuenta de ese proveedor responde que sí. Devuelve (id del proveedor, cuenta, id del servicio)."""
        pv = pv or self.proveedor(f'{nombre} Uno', [nombre])
        cuenta = self.cliente(PROVEEDOR, pv)
        sc = self.servicios(evento)[nombre]['servicioContratadoId']
        self.assertEqual(self.coord.post(f'/eventos/{evento}/servicios/{sc}/proveedor', {'proveedor_id': pv}).status_code, 200)
        self.assertEqual(cuenta.post(f'/eventos/{evento}/servicios/{sc}/respuesta-proveedor', {'proveedor_id': pv, 'disponible': True}).status_code, 200)
        return pv, cuenta, sc

    # ====================================================================================== 1. el proveedor reporta que ya no puede cumplir
    def test_el_proveedor_acepta_reporta_indisponibilidad_y_la_sustitucion_llega_a_confirmarse_conservando_el_historial(self):
        evento, contrato = self.evento_en_organizacion()
        pv1, cuenta1, sc = self.aceptado(evento, pv=self.proveedor('Banquetes Original', ['Banquete']))
        pv2 = self.proveedor('Banquetes Alterno', ['Banquetes'])                                  # «Banquetes» equivale a «Banquete»
        cuenta2 = self.cliente(PROVEEDOR, pv2)
        self.ahora = DIA
        # un proveedor no reporta por otro, y Coordinación no usa esta ruta (permiso propio del proveedor)
        ruta = f'/eventos/{evento}/servicios/{sc}/indisponibilidad'
        self.assertEqual(cuenta2.post(ruta, {'proveedor_id': pv1, 'motivo': 'Problemas operativos'}).status_code, 403)
        self.assertEqual(cuenta2.post(ruta, {'proveedor_id': pv2, 'motivo': 'Problemas operativos'}).status_code, 422)        # no está asignado a ese servicio
        self.assertEqual(self.coord.post(ruta, {'proveedor_id': pv1, 'motivo': 'Problemas operativos'}).status_code, 403)
        self.assertEqual(self.admin.post(ruta, {'proveedor_id': pv1, 'motivo': 'Problemas operativos'}).status_code, 403)
        # motivo obligatorio (de la lista) y descripción obligatoria con «Otro motivo»
        self.assertEqual(cuenta1.post(ruta, {'proveedor_id': pv1, 'motivo': ''}).status_code, 422)
        self.assertEqual(cuenta1.post(ruta, {'proveedor_id': pv1, 'motivo': 'Porque sí'}).status_code, 422)
        self.assertIn('describe', cuenta1.post(ruta, {'proveedor_id': pv1, 'motivo': 'Otro motivo'}).json()['detalle'])
        self.assertEqual(self.servicios(evento)['Banquete']['estado'], 'Confirmado por el proveedor')                              # los rechazos no cambiaron nada
        r = cuenta1.post(ruta, {'proveedor_id': pv1, 'motivo': 'Problemas operativos', 'descripcion': 'Se enfermó el personal'})
        self.assertEqual(r.status_code, 200, r.text)
        sid = r.json()['datos']['sustitucion_id']
        s = self.servicios(evento)['Banquete']
        self.assertEqual(s['estado'], 'Proveedor no disponible')
        self.assertTrue(s['respuesta']['disponible'])                                                                               # la aceptación original se conserva
        self.assertEqual(cuenta1.post(ruta, {'proveedor_id': pv1, 'motivo': 'Problemas operativos'}).status_code, 422)             # no se duplica el reporte
        # Coordinación ve el reporte con motivo, fecha y proveedor original, y el siguiente paso es proponer una alternativa
        f = self.fila(evento, sid)
        self.assertEqual((f['tipoSolicitud'], f['estadoActual'], f['servicioNombre'], f['proveedorOriginal']), ('sustitución de proveedor', 'En búsqueda de alternativa', 'Banquete', 'Banquetes Original'))
        self.assertEqual((f['reporte']['motivo'], f['reporte']['descripcion'], f['reporte']['proveedor']), ('Problemas operativos', 'Se enfermó el personal', 'Banquetes Original'))
        self.assertEqual(f['reporte']['reportadoEn'], DIA.isoformat())
        self.assertIsNotNone(f['reporte']['aceptadoEn'])
        self.assertEqual(self.siguiente(evento, sid), 'alternativa')
        self.assertEqual(self.estados_de_pasos(evento, sid)['registro'], 'hecho')
        # la alternativa: no el original; un proveedor que no ofrece el servicio se rechaza
        self.assertEqual(self.coord.post(f'/sustituciones/{sid}/alternativa', {'proveedor_id': pv1, 'condiciones_alternativa': 'x'}).status_code, 422)
        otro = self.proveedor('Solo Música', ['Música'])
        self.assertEqual(self.coord.post(f'/sustituciones/{sid}/alternativa', {'proveedor_id': otro, 'condiciones_alternativa': 'x'}).status_code, 422)
        self.assertEqual(self.coord.post(f'/sustituciones/{sid}/alternativa', {'proveedor_id': pv2, 'condiciones_alternativa': 'Menú equivalente'}).status_code, 200)
        f = self.fila(evento, sid)
        self.assertEqual((f['estadoActual'], f['proveedorNuevo']), ('Pendiente de aprobación del Cliente', 'Banquetes Alterno'))
        self.assertEqual(self.siguiente(evento, sid), 'cliente')                                                                    # cambiar de proveedor tiene impacto: el Cliente decide
        self.assertEqual(self.coord.post(f'/sustituciones/{sid}/confirmacion').status_code, 422)                                    # registrar la alternativa no completa la sustitución
        self.assertEqual(self.coord.post(f'/sustituciones/{sid}/decision-cliente', self.decision('Cliente')).status_code, 200)
        self.assertEqual(self.siguiente(evento, sid), 'autorizacion')
        self.assertEqual(self.admin.post(f'/sustituciones/{sid}/autorizacion', self.decision('Administración')).status_code, 200)
        self.assertEqual(self.fila(evento, sid)['estadoActual'], 'Pendiente de formalización')
        self.assertEqual(self.siguiente(evento, sid), 'anexo')
        # confirmar antes del anexo se rechaza y dice qué falta
        faltante = self.coord.post(f'/sustituciones/{sid}/confirmacion')
        self.assertEqual(faltante.status_code, 422)
        self.assertIn('anexo', ' '.join(faltante.json().get('pendientes', []) + [faltante.json().get('detalle', '')]))
        self.assertEqual(self.estado_sustitucion(evento, sid), 'Pendiente de formalización')
        # anexo: una sola vez, visible en la solicitud y en el contrato
        self.assertEqual(self.coord.post(f'/sustituciones/{sid}/anexo', {'descripcion': 'Cambio de proveedor de banquete'}).status_code, 200)
        self.contenedor.despachador.despachar()
        self.assertEqual(self.coord.post(f'/sustituciones/{sid}/anexo', {'descripcion': 'Otro texto'}).status_code, 422)             # sin duplicados
        f = self.fila(evento, sid)
        self.assertEqual(f['anexo']['descripcion'], 'Cambio de proveedor de banquete')
        self.assertEqual(self.siguiente(evento, sid), 'confirmar')
        anexos = self.coord.get(f'/eventos/{evento}/administracion').json()['contratos'][0]['anexos']
        self.assertEqual([(a['tipoSolicitud'], a['descripcion'], a['solicitudId']) for a in anexos], [('sustitución de proveedor', 'Cambio de proveedor de banquete', sid)])
        # confirmar: el servicio pasa al nuevo proveedor y el historial se conserva
        self.assertEqual(self.coord.post(f'/sustituciones/{sid}/confirmacion').status_code, 200)
        self.contenedor.despachador.despachar()
        s = self.servicios(evento)['Banquete']
        self.assertEqual((s['proveedorNombre'], s['estado']), ('Banquetes Alterno', 'Confirmado por el proveedor'))
        f = self.fila(evento, sid)
        self.assertEqual((f['estadoActual'], f['proceso']['terminal']), ('Confirmada', 'La sustitución fue confirmada.'))
        self.assertEqual((f['proveedorOriginal'], f['reporte']['motivo']), ('Banquetes Original', 'Problemas operativos'))         # el historial del proveedor anterior se conserva
        # cada proveedor ve solo lo suyo: el original ya no tiene el servicio; el nuevo sí y puede reportar a su vez
        self.assertEqual([x['servicio'] for e in cuenta1.get('/mis-asignaciones').json()['eventos'] for x in e['servicios']], [])
        self.assertEqual([x['servicio'] for e in cuenta2.get('/mis-asignaciones').json()['eventos'] for x in e['servicios']], ['Banquete'])
        self.assertEqual(cuenta2.post(ruta, {'proveedor_id': pv2, 'motivo': 'Problemas de disponibilidad'}).status_code, 200)

    def estado_sustitucion(self, evento, sid):
        return self.fila(evento, sid)['estadoActual']

    def test_si_la_alternativa_es_rechazada_se_puede_proponer_otra(self):
        evento, contrato = self.evento_en_organizacion()
        pv1, cuenta1, sc = self.aceptado(evento, pv=self.proveedor('Banquetes Original', ['Banquete']))
        alterno1, alterno2 = self.proveedor('Alterno Uno', ['Banquete']), self.proveedor('Alterno Dos', ['Banquete'])
        sid = cuenta1.post(f'/eventos/{evento}/servicios/{sc}/indisponibilidad', {'proveedor_id': pv1, 'motivo': 'Problemas operativos'}).json()['datos']['sustitucion_id']
        self.ahora = DIA
        self.assertEqual(self.coord.post(f'/sustituciones/{sid}/alternativa', {'proveedor_id': alterno1, 'condiciones_alternativa': 'Menú', 'costo_adicional': '800.00'}).status_code, 200)
        self.assertEqual(self.siguiente(evento, sid), 'cliente')                                                                    # con costo adicional requiere aprobación
        self.assertEqual(self.coord.post(f'/sustituciones/{sid}/decision-cliente', self.decision('Cliente', False)).status_code, 200)
        f = self.fila(evento, sid)
        self.assertEqual((f['estadoActual'], self.siguiente(evento, sid)), ('En búsqueda de alternativa', 'alternativa'))           # puede proponer otra
        self.assertEqual(self.coord.post(f'/sustituciones/{sid}/alternativa', {'proveedor_id': alterno2, 'condiciones_alternativa': 'Menú 2', 'costo_adicional': '500.00'}).status_code, 200)
        self.assertEqual(self.fila(evento, sid)['proveedorNuevo'], 'Alterno Dos')

    # ====================================================================================== 3. solicitud de cambio: orden de acciones y cargo por cambio tardío
    def cambio(self, evento, contrato, descripcion='Cambiar el lugar de la recepción', tarifa='2000.00'):
        r = self.coord.post('/solicitudes-cambio', {'evento_id': evento, 'contrato_id': contrato, 'descripcion': descripcion, 'tarifa_vigente': tarifa})
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()['datos']['solicitud_id']

    def test_cambio_sin_costo_con_mas_de_7_dias_no_genera_cargo_ni_pago_y_exige_el_anexo_antes_de_confirmar(self):
        evento, contrato = self.evento_en_organizacion()                                      # el evento es 80 días después
        self.ahora = DIA
        sid = self.cambio(evento, contrato, tarifa='2000.00')                                  # tarifa manual alta: no debe cobrarse con tanta anticipación
        self.assertEqual(self.siguiente(evento, sid), 'viabilidad')
        self.assertEqual(self.coord.post(f'/solicitudes-cambio/{sid}/viabilidad', {'viable': True}).status_code, 200)
        f = self.fila(evento, sid)
        self.assertEqual(f['estadoActual'], 'Pendiente de formalización')
        self.assertGreaterEqual(f['diasAnticipacion'], 7)
        self.assertEqual((f['importes']['costoProveedor'], f['importes']['cargoTardio'], f['importes']['total'], f['importes']['hayImportes']), ('0', '0', '0', False))
        self.assertIn('no genera cargo', f['importes']['explicacion'])
        pasos = self.estados_de_pasos(evento, sid)
        self.assertEqual((pasos['cliente'], pasos['autorizacion'], pasos['pagocom'], pasos['anexo']), ('omitido', 'omitido', 'omitido', 'actual'))
        self.assertNotIn('pagover', pasos)                                                     # no hay pagos que gestionar
        self.assertEqual(self.siguiente(evento, sid), 'anexo')
        # no se puede confirmar ni comunicar pago antes del anexo; no se genera ninguna obligación de pago
        self.assertEqual(self.coord.post(f'/solicitudes-cambio/{sid}/confirmacion').status_code, 422)
        self.assertEqual(self.coord.post(f'/solicitudes-cambio/{sid}/solicitud-pago', {'comunicado_en': self.ahora.isoformat()}).status_code, 422)
        self.assertEqual(self.coord.post(f'/solicitudes-cambio/{sid}/anexo', {'descripcion': 'Nuevo lugar: Jardín Nova'}).status_code, 200)
        self.contenedor.despachador.despachar()
        self.assertEqual(self.coord.post(f'/solicitudes-cambio/{sid}/anexo', {'descripcion': 'Duplicado'}).status_code, 422)
        self.assertEqual(self.siguiente(evento, sid), 'confirmar')
        self.assertEqual(self.coord.post(f'/solicitudes-cambio/{sid}/confirmacion').status_code, 200)
        f = self.fila(evento, sid)
        self.assertEqual((f['estadoActual'], f['anexo']['descripcion']), ('Confirmada', 'Nuevo lugar: Jardín Nova'))
        pendientes = self.admin.get('/pagos-pendientes', params={'evento_id': evento}).json()['pagos']
        self.assertEqual([p['concepto'] for p in pendientes if p['concepto'] not in ('Anticipo', 'SaldoContratoOriginal')], [])      # sin obligaciones por $0

    def test_cambio_con_costo_del_proveedor_sigue_el_orden_decision_autorizacion_anexo_pago_y_confirmacion(self):
        evento, contrato = self.evento_en_organizacion()
        self.ahora = DIA
        sid = self.cambio(evento, contrato, 'Aumentar los invitados', tarifa='2000.00')
        self.assertEqual(self.coord.post(f'/solicitudes-cambio/{sid}/viabilidad', {'viable': True, 'costo_adicional_proveedor': '2000.00'}).status_code, 200)
        f = self.fila(evento, sid)
        # el costo adicional del PROVEEDOR no es el cargo por cambio tardío: con más de 7 días el cargo es $0
        self.assertEqual((f['importes']['costoProveedor'], f['importes']['cargoTardio'], f['importes']['total']), ('2000.00', '0', '2000.00'))
        self.assertTrue(f['importes']['hayImportes'])
        secuencia = [self.siguiente(evento, sid)]
        self.assertEqual(f['estadoActual'], 'Pendiente de aprobación del Cliente')
        self.assertEqual(self.coord.post(f'/solicitudes-cambio/{sid}/decision-cliente', self.decision('Cliente')).status_code, 200)
        secuencia.append(self.siguiente(evento, sid))
        self.assertEqual(self.admin.post(f'/solicitudes-cambio/{sid}/autorizacion', self.decision('Administración')).status_code, 200)
        secuencia.append(self.siguiente(evento, sid))
        # acciones fuera de orden se rechazan
        self.assertEqual(self.coord.post(f'/solicitudes-cambio/{sid}/solicitud-pago', {'comunicado_en': self.ahora.isoformat()}).status_code, 422)     # antes del anexo
        self.assertEqual(self.coord.post(f'/solicitudes-cambio/{sid}/confirmacion').status_code, 422)
        self.assertEqual(self.coord.post(f'/solicitudes-cambio/{sid}/anexo', {'descripcion': 'Más invitados y su costo'}).status_code, 200)
        self.contenedor.despachador.despachar()
        secuencia.append(self.siguiente(evento, sid))
        self.assertEqual(self.coord.post(f'/solicitudes-cambio/{sid}/solicitud-pago', {'comunicado_en': self.ahora.isoformat()}).status_code, 200)
        f = self.fila(evento, sid)
        secuencia.append(self.siguiente(evento, sid))
        self.assertEqual(f['estadoActual'], 'Pendiente de pago')
        self.assertEqual((f['pago']['concepto'], f['pago']['estado'], f['pago']['importe']), ('Cambio', 'Pendiente', '2000.00'))
        faltantes = self.coord.post(f'/solicitudes-cambio/{sid}/confirmacion')
        self.assertEqual(faltantes.status_code, 422)                                                                                          # sin pago verificado no se confirma
        ec = self.admin.get(f'/eventos/{evento}/pagos').json()['estadosCuenta'][0]['estadoCuentaId']
        ob = next(p for p in self.admin.get('/pagos-pendientes', params={'evento_id': evento}).json()['pagos'] if p['concepto'] == 'Cambio')
        self.assertEqual(self.admin.post(f'/estados-cuenta/{ec}/pagos', {'obligacion_id': ob['obligacionId'], 'importe': '2000.00', 'fecha': self.ahora.isoformat(),
                                                                         'comprobante': 'CAMBIO-1', 'verificar_ahora': True}).status_code, 201)
        self.contenedor.despachador.despachar()
        secuencia.append(self.siguiente(evento, sid))
        self.assertEqual(self.coord.post(f'/solicitudes-cambio/{sid}/confirmacion').status_code, 200)
        self.assertEqual(secuencia, ['cliente', 'autorizacion', 'anexo', 'pagocom', 'pagover', 'confirmar'])
        self.assertEqual(self.fila(evento, sid)['estadoActual'], 'Confirmada')

    def test_cambio_con_menos_de_7_dias_aplica_la_tarifa_y_se_muestra_por_separado(self):
        evento, contrato = self.evento_en_organizacion(fecha=T0 + timedelta(days=5))
        saldo = next(p for p in self.admin.get('/pagos-pendientes', params={'evento_id': evento}).json()['pagos'] if p['concepto'] == 'SaldoContratoOriginal')
        ec = self.admin.get(f'/eventos/{evento}/pagos').json()['estadosCuenta'][0]['estadoCuentaId']
        self.assertEqual(self.admin.post(f'/estados-cuenta/{ec}/pagos', {'obligacion_id': saldo['obligacionId'], 'importe': saldo['saldo'], 'fecha': T0.isoformat(),
                                                                         'comprobante': 'SALDO-1', 'verificar_ahora': True}).status_code, 201)   # sin saldo vencido (el pago final vence 7 días antes)
        self.ahora = T0 + timedelta(days=1)                                                    # 4 días naturales antes del evento
        sid = self.cambio(evento, contrato, 'Cambio de última hora', tarifa='1500.00')
        self.assertEqual(self.coord.post(f'/solicitudes-cambio/{sid}/viabilidad', {'viable': True}).status_code, 200)
        f = self.fila(evento, sid)
        self.assertLess(f['diasAnticipacion'], 7)
        self.assertEqual((f['importes']['cargoTardio'], f['importes']['costoProveedor'], f['importes']['total']), ('1500.00', '0', '1500.00'))
        self.assertTrue(f['importes']['hayImportes'])
        self.assertIn('pagocom', self.estados_de_pasos(evento, sid))
        self.assertNotEqual(self.estados_de_pasos(evento, sid)['pagocom'], 'omitido')

    # ====================================================================================== 4. anexos de los tres procesos
    def test_anexos_de_servicio_adicional_se_muestran_en_la_solicitud_y_en_el_contrato_sin_mezclar_eventos(self):
        pv = self.proveedor('DJ Nova', ['DJ'])
        evento, contrato = self.evento_en_organizacion()
        otro_evento, otro_contrato = self.evento_en_organizacion()
        self.ahora = DIA
        sid = self.coord.post('/solicitudes-servicio-adicional', {'evento_id': evento, 'contrato_id': contrato, 'servicio': 'DJ'}).json()['datos']['solicitud_id']
        self.assertEqual(self.siguiente(evento, sid), 'proveedor')
        self.assertEqual(self.coord.post(f'/solicitudes-servicio-adicional/{sid}/disponibilidad', {'disponible': True, 'proveedor_id': pv, 'costo': '800.00', 'condiciones': 'DJ 4 horas'}).status_code, 200)
        self.assertEqual(self.siguiente(evento, sid), 'cliente')
        self.assertEqual(self.coord.post(f'/solicitudes-servicio-adicional/{sid}/aprobacion-cliente', self.decision('Cliente')).status_code, 200)
        self.assertEqual(self.admin.post(f'/solicitudes-servicio-adicional/{sid}/autorizacion', self.decision('Administración')).status_code, 200)
        f = self.fila(evento, sid)
        self.assertEqual((f['estadoActual'], f['proveedorNuevo'], f['importes']['costoProveedor']), ('Autorizada', 'DJ Nova', '800.00'))
        self.assertIn('no cobra por gestionar', f['importes']['explicacion'])
        self.assertEqual(self.siguiente(evento, sid), 'anexo')
        self.assertEqual(self.coord.post(f'/solicitudes-servicio-adicional/{sid}/anexo', {'descripcion': 'DJ 4 horas por $800'}).status_code, 200)
        self.contenedor.despachador.despachar()
        self.assertEqual(self.coord.post(f'/solicitudes-servicio-adicional/{sid}/anexo', {'descripcion': 'otra vez'}).status_code, 422)
        self.assertEqual(self.siguiente(evento, sid), 'pagocom')
        anexos = self.coord.get(f'/eventos/{evento}/administracion').json()['contratos'][0]['anexos']
        self.assertEqual([(a['tipoSolicitud'], a['descripcion'], a['importeAdicional']) for a in anexos], [('servicio adicional', 'DJ 4 horas por $800', '800.00')])
        self.assertEqual(self.coord.get(f'/eventos/{otro_evento}/administracion').json()['contratos'][0]['anexos'], [])                  # no aparecen en otro evento
        self.assertEqual([s['solicitudId'] for s in self.coord.get('/solicitudes', params={'evento_id': otro_evento}).json()['solicitudes']], [])

    def test_los_anexos_de_cambio_persisten_al_reconstruir_el_contenedor(self):
        evento, contrato = self.evento_en_organizacion()
        self.ahora = DIA
        sid = self.cambio(evento, contrato)
        self.coord.post(f'/solicitudes-cambio/{sid}/viabilidad', {'viable': True})
        self.assertEqual(self.coord.post(f'/solicitudes-cambio/{sid}/anexo', {'descripcion': 'Anexo persistente'}).status_code, 200)
        self.contenedor.despachador.despachar()
        self.reiniciar_contenedor()                                                            # equivale a actualizar la página: todo sale de la base
        self.assertEqual(self.fila(evento, sid)['anexo']['descripcion'], 'Anexo persistente')
        self.assertEqual(len(self.coord.get(f'/eventos/{evento}/administracion').json()['contratos'][0]['anexos']), 1)

    # ====================================================================================== 2. versiones de propuesta con cotización por servicio
    def test_propuesta_v1_v2_con_servicios_agregados_quitados_proveedor_distinto_y_total_calculado(self):
        banq = self.proveedor('Banquetes Local', ['Banquetes'])
        musica = self.proveedor('Música Local', ['Música'])
        deco = self.proveedor('Decoraciones Local', ['Decoración'])
        banq2 = self.proveedor('Banquetes Gourmet', ['Banquete'])
        coord = self.coord
        evento = coord.post('/eventos', {'cliente_id': 'CL-1', 'datos': {'tipo': 'Boda', 'fecha_hora': T.isoformat(), 'lugar': 'Salón', 'invitados_aproximados': 100}, 'servicios': ['Banquete', 'Música']}).json()['evento_id']
        v1 = {'condiciones': 'Condiciones V1', 'desglose': [{'servicio': 'Banquete', 'proveedor_id': banq, 'importe': '5000'}, {'servicio': 'Música', 'proveedor_id': musica, 'importe': '3000'}]}
        r = coord.post(f'/eventos/{evento}/propuestas', v1)
        self.assertEqual(r.status_code, 201, r.text)
        pr = r.json()['propuesta_id']
        p = coord.get(f'/eventos/{evento}/propuestas').json()['propuestas'][0]
        self.assertEqual((p['numeroVersion'], p['costoTotal']), (1, '8000.00'))                  # el total lo calcula el servidor
        # V2: agrega Decoración, quita Música, cambia el proveedor de Banquete y modifica importes
        v2 = {'condiciones': 'Condiciones V2', 'desglose': [{'servicio': 'Banquete', 'proveedor_id': banq2, 'importe': '5500.50'}, {'servicio': 'Decoración', 'proveedor_id': deco, 'importe': '2000'}]}
        r = coord.post(f'/propuestas/{pr}/versiones', v2)
        self.assertEqual(r.status_code, 201, r.text)
        p = coord.get(f'/eventos/{evento}/propuestas').json()['propuestas'][0]
        self.assertEqual((p['numeroVersion'], p['costoTotal'], p['estado']), (2, '7500.50', 'En revisión del Cliente'))
        self.assertEqual([v['numero'] for v in p['versiones']], [1, 2])
        v_1, v_2 = p['versiones']
        self.assertEqual((v_1['vigente'], v_1['costoTotal'], v_1['servicios'], v_1['condiciones']), (False, '8000.00', ['Banquete', 'Música'], 'Condiciones V1'))        # V1 intacta
        self.assertEqual([(d['servicio'], d['proveedor'], d['importe']) for d in v_1['desglose']], [('Banquete', 'Banquetes Local', '5000.00'), ('Música', 'Música Local', '3000.00')])
        self.assertEqual((v_2['vigente'], v_2['costoTotal'], v_2['servicios']), (True, '7500.50', ['Banquete', 'Decoración']))
        self.assertEqual([(d['proveedor'], d['importe']) for d in v_2['desglose']], [('Banquetes Gourmet', '5500.50'), ('Decoraciones Local', '2000.00')])
        self.assertEqual(p['versionVigenteId'], f'{pr}-v2')
        # validaciones del servidor: proveedor que no ofrece el servicio, desactivado o inexistente; servicio repetido
        malo = coord.post(f'/propuestas/{pr}/versiones', {'condiciones': 'x', 'desglose': [{'servicio': 'Decoración', 'proveedor_id': banq, 'importe': '10'}]})
        self.assertEqual(malo.status_code, 422); self.assertIn('no ofrece', malo.json()['detalle'])
        self.assertEqual(coord.post(f'/propuestas/{pr}/versiones', {'condiciones': 'x', 'desglose': [{'servicio': 'Banquete', 'proveedor_id': 'PV-NO-EXISTE', 'importe': '10'}]}).status_code, 422)
        self.assertEqual(coord.post(f'/propuestas/{pr}/versiones', {'condiciones': 'x', 'desglose': [{'servicio': 'Banquete', 'proveedor_id': banq, 'importe': '1'}, {'servicio': 'banquetes', 'proveedor_id': banq2, 'importe': '2'}]}).status_code, 422)
        self.assertEqual(coord.post(f'/propuestas/{pr}/versiones', {'condiciones': 'x', 'desglose': [{'servicio': 'Banquete', 'proveedor_id': banq, 'importe': '-5'}]}).status_code, 422)
        self.assertEqual(self.admin.post(f'/proveedores/{deco}/desactivacion').status_code, 200)
        inactivo = coord.post(f'/propuestas/{pr}/versiones', {'condiciones': 'x', 'desglose': [{'servicio': 'Decoración', 'proveedor_id': deco, 'importe': '10'}]})
        self.assertEqual(inactivo.status_code, 422); self.assertIn('desactivado', inactivo.json()['detalle'])
        self.assertEqual(coord.get(f'/eventos/{evento}/propuestas').json()['propuestas'][0]['numeroVersion'], 2)                  # ningún rechazo creó versiones
        # aceptada: ya no admite versiones nuevas (lo contratado se modifica con una solicitud de cambio y su anexo)
        self.assertEqual(coord.post(f'/propuestas/{pr}/aceptacion', {'version_id': f'{pr}-v2'}).status_code, 200)
        despues = coord.post(f'/propuestas/{pr}/versiones', {'condiciones': 'V3', 'desglose': [{'servicio': 'Banquete', 'proveedor_id': banq2, 'importe': '6000'}]})
        self.assertEqual(despues.status_code, 422); self.assertIn('Aceptada', despues.json()['detalle'])
        self.assertEqual(coord.get(f'/eventos/{evento}/propuestas').json()['propuestas'][0]['versiones'][0]['costoTotal'], '8000.00')    # V1 sigue intacta

    def test_la_propuesta_en_forma_anterior_sin_desglose_sigue_funcionando(self):
        evento = self.coord.post('/eventos', {'cliente_id': 'CL-1', 'datos': {'tipo': 'Boda', 'fecha_hora': T.isoformat(), 'lugar': 'Salón', 'invitados_aproximados': 100}, 'servicios': ['Banquete']}).json()['evento_id']
        r = self.coord.post(f'/eventos/{evento}/propuestas', {'servicios': ['Banquete; Música'], 'proveedores_considerados': ['PV-1'], 'costo_total': '10000.00', 'condiciones': 'c'})
        self.assertEqual(r.status_code, 201, r.text)
        p = self.coord.get(f'/eventos/{evento}/propuestas').json()['propuestas'][0]
        self.assertEqual((p['costoTotal'], p['servicios'], p['desglose']), ('10000.00', ['Banquete', 'Música'], []))
        self.assertEqual(p['versiones'][0]['desglose'], [])

    # ====================================================================================== permisos
    def test_permisos_del_reporte_y_de_las_solicitudes_siguen_siendo_los_de_cada_rol(self):
        ruta = ('POST', '/eventos/{evento_id}/servicios/{servicio_contratado_id}/indisponibilidad')
        self.assertIn(ruta, MATRIZ)
        self.assertTrue(autoriza(PROVEEDOR, *ruta))
        self.assertFalse(autoriza(COORDINADOR, *ruta))
        self.assertFalse(autoriza(ADMINISTRADOR, *ruta))
        self.assertEqual({r for r in (PROVEEDOR, COORDINADOR, ADMINISTRADOR) if 'proveedores.reportar' in permisos_del_rol(r)}, {PROVEEDOR})
        evento, contrato = self.evento_en_organizacion()
        pv, cuenta, sc = self.aceptado(evento)
        self.assertEqual(cuenta.get('/solicitudes').status_code, 403)                          # el proveedor no consulta solicitudes
        self.assertEqual(cuenta.post('/solicitudes-cambio', {'evento_id': evento, 'contrato_id': contrato, 'descripcion': 'x', 'tarifa_vigente': '1'}).status_code, 403)
        self.assertEqual(cuenta.post('/solicitudes-cambio/SC-X/anexo', {'descripcion': 'x'}).status_code, 403)


class SolicitudesEnMemoria(Flujo, unittest.TestCase):
    def crear_contenedor(self):
        return construir()

    def reiniciar_contenedor(self):
        pass                                                                                   # en memoria el contenedor es la «base»: no hay recarga que simular


class SolicitudesEnPostgreSQL(Flujo, BaseConBD):
    def setUp(self):
        BaseConBD.setUp(self)
        self.arrancar()

    def crear_contenedor(self):
        return construir_persistente(motor=self.motor)

    def reiniciar_contenedor(self):
        """Contenedor y aplicación nuevos sobre la misma base (equivale a recargar la página): las cuentas ya existen, solo se vuelve a iniciar sesión."""
        from api.dependencias import obtener_reloj
        from api.main import crear_app
        from application.seguridad import ConfiguracionSeguridad
        from test_seguridad import Cliente
        self.contenedor = self.crear_contenedor()
        self.app = crear_app(lambda: self.contenedor, ConfiguracionSeguridad(activa=True))
        self.app.dependency_overrides[obtener_reloj] = lambda: (lambda: self.ahora)
        self.seg = self.contenedor.servicios.seguridad
        self.seg.reloj = lambda: T0
        self.admin, self.coord = Cliente(self.app), Cliente(self.app)
        self.admin.entrar('administrador-1@ejemplo.mx')
        self.coord.entrar('coordinador-2@ejemplo.mx')


if __name__ == '__main__':
    unittest.main()
