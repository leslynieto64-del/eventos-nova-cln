"""Teléfono: exactamente 10 dígitos numéricos, en el dominio, la API (clientes y proveedores), PostgreSQL y la interfaz.

La regla se exige al CAPTURAR un teléfono nuevo; los registros históricos (por ejemplo, «55 1234 5678») se siguen leyendo, listando y reconociendo por sus dígitos.
Ejecutar desde la raíz:  python -m unittest tests.test_telefono -v"""
import ast, json, os, shutil, subprocess, sys, tempfile, unittest
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
sys.path.insert(0, os.path.dirname(__file__))
import sqlalchemy as sa                                                                      # noqa: E402
from apoyo_bd import BaseConBD                                                               # noqa: E402
from test_api_operaciones import ApiHttp, DATOS                                              # noqa: E402
from domain.cliente import Cliente                                                           # noqa: E402
from domain.proveedor import Proveedor                                                       # noqa: E402
from domain.telefono import MENSAJE_TELEFONO, es_telefono_valido, normalizar_telefono, validar_telefono   # noqa: E402
from domain.valores import ErrorDominio                                                      # noqa: E402
from infrastructure.composicion import construir                                              # noqa: E402
from infrastructure.persistencia.composicion_persistente import construir_persistente          # noqa: E402

AHORA = datetime(2026, 11, 15, 10, 0)
RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
NODE = shutil.which('node')
MENSAJE = 'El número telefónico debe contener exactamente 10 dígitos'

VALIDOS = ['5512345678', ' 5512345678 ', '0000000000']
INVALIDOS = {
    '9 dígitos': '551234567', '11 dígitos': '55123456789', 'letras': '55123abc78', 'solo letras': 'abcdefghij',
    'símbolos': '55-1234-567', 'espacios': '55 1234 5678', 'paréntesis': '(55)12345678', 'más con prefijo': '+525512345678',
    'punto': '55.1234.567', 'vacío': '', 'solo espacios': '   ', 'dígitos de otro alfabeto': '55123456٣٤',
}


class ReglaDelDominio(unittest.TestCase):
    def test_diez_digitos_se_aceptan(self):
        for t in VALIDOS:
            with self.subTest(t):
                self.assertTrue(es_telefono_valido(t))
                self.assertEqual(validar_telefono(t), t.strip())

    def test_menos_o_mas_de_diez_letras_simbolos_y_vacio_se_rechazan_con_el_mismo_mensaje(self):
        self.assertEqual(MENSAJE_TELEFONO, MENSAJE)
        for caso, t in INVALIDOS.items():
            with self.subTest(caso):
                self.assertFalse(es_telefono_valido(t))
                with self.assertRaises(ErrorDominio) as cm:
                    validar_telefono(t)
                self.assertEqual(str(cm.exception), MENSAJE)
        for no_texto in (None, 5512345678, 5.5):
            self.assertFalse(es_telefono_valido(no_texto))

    def test_un_cliente_nuevo_exige_diez_digitos_pero_un_registro_historico_se_lee(self):
        Cliente.registrar('CL-1', 'Ana', 'López', '5512345678', 'a@b.com', AHORA)
        for caso, t in INVALIDOS.items():
            with self.subTest(caso), self.assertRaises(ErrorDominio):
                Cliente.registrar('CL-1', 'Ana', 'López', t, 'a@b.com', AHORA)
        historico = Cliente('CL-H', 'Ana', 'López', '(55) 1234-5678', 'a@b.com', AHORA)                   # lo ya guardado se conserva tal cual
        self.assertEqual(historico.telefono, '(55) 1234-5678')
        self.assertEqual(normalizar_telefono(historico.telefono), '5512345678')
        self.assertTrue(historico.coincide_con(Cliente.registrar('CL-2', 'ana', 'lopez', '5512345678', 'a@b.com', AHORA)))

    def test_el_telefono_del_proveedor_es_opcional_pero_si_se_captura_son_diez_digitos(self):
        self.assertEqual(Proveedor.registrar('PV-1', 'Banquetes', [], 'correo@ejemplo.com', AHORA).telefono, '')
        self.assertEqual(Proveedor.registrar('PV-1', 'Banquetes', [], '', AHORA, '5512345678').telefono, '5512345678')
        for caso, t in INVALIDOS.items():
            if t.strip() == '':
                continue                                                                              # vacío = sin teléfono (opcional)
            with self.subTest(caso), self.assertRaises(ErrorDominio):
                Proveedor.registrar('PV-1', 'Banquetes', [], '', AHORA, t)
        p = Proveedor.registrar('PV-1', 'Banquetes', [], '', AHORA, '5512345678')
        self.assertEqual(p.con_datos('Banquetes', [], '').telefono, '5512345678')                          # None conserva
        self.assertEqual(p.con_datos('Banquetes', [], '', '').telefono, '')                                # '' lo quita
        self.assertEqual(p.con_datos('Banquetes', [], '', '5598765432').telefono, '5598765432')
        with self.assertRaises(ErrorDominio):
            p.con_datos('Banquetes', [], '', '123')


class _ApiTelefonos:
    def evento(self, telefono, correo='ana@ejemplo.com', esperado=201):
        return self.post('/eventos', {'cliente': {'nombres': 'Ana', 'apellidos': 'López', 'telefono': telefono, 'correo': correo}, 'datos': DATOS, 'servicios': ['Banquete']}, esperado=esperado)

    def test_cliente_diez_digitos_aceptado_y_los_demas_rechazados_sin_crear_nada(self):
        for caso, t in INVALIDOS.items():
            with self.subTest(caso):
                r = self.evento(t, esperado=422)
                self.assertEqual(r['tipo'], 'rechazo_de_negocio')
                self.assertEqual(r['detalle'], MENSAJE)
        self.assertEqual(self.get('/clientes')['datos']['clientes'], [])                                   # ningún cliente a medias
        self.assertEqual(self.get('/eventos', desde='2000-01-01T00:00:00', hasta='2100-01-01T00:00:00')['eventos'], [])
        r = self.evento('5512345678')
        self.assertEqual(r['cliente']['telefono'], '5512345678')
        self.post('/eventos', {'cliente': {'nombres': 'A', 'apellidos': 'B', 'correo': 'x@ejemplo.com'}, 'datos': DATOS, 'servicios': ['a']}, esperado=422)     # falta el campo: forma

    def test_un_cliente_historico_con_telefono_con_formato_se_lista_y_se_reconoce_por_sus_digitos(self):
        from infrastructure.persistencia.repositorios_sql import ClienteRepositorySQL            # noqa: F401  (solo para documentar el origen)
        repo = self.contenedor.repos.clientes
        self.assertTrue(repo.guardar(Cliente('CL-HISTORICO', 'Ana', 'López', '55 1234 5678', 'ana@ejemplo.com', AHORA)))
        self.assertEqual(self.get('/clientes/CL-HISTORICO')['datos']['telefono'], '55 1234 5678')           # se conserva sin modificar
        r = self.evento('5512345678', 'ana@ejemplo.com')                                                   # mismo correo y mismos dígitos: se reutiliza
        self.assertEqual((r['cliente']['clienteId'], r['cliente_nuevo']), ('CL-HISTORICO', False))
        self.assertEqual(self.get('/clientes/CL-HISTORICO')['datos']['telefono'], '55 1234 5678')           # reutilizar no reescribe el registro
        distinto = self.evento('5599999999', 'ana@ejemplo.com', esperado=422)                              # otro teléfono: no se unen
        self.assertIn('no coinciden', distinto['detalle'])

    def test_proveedor_telefono_opcional_estricto_en_alta_y_edicion(self):
        ok = self.post('/proveedores', {'nombre': 'Banquetes A', 'servicios': ['Banquete'], 'contacto': 'Tel. 55 1111 2222 con Laura', 'telefono': '5511112222'})['datos']
        self.assertEqual((ok['telefono'], ok['contacto']), ('5511112222', 'Tel. 55 1111 2222 con Laura'))      # el contacto sigue siendo texto libre
        sin = self.post('/proveedores', {'nombre': 'Sin Tel', 'servicios': [], 'contacto': 'correo@ejemplo.com'})['datos']
        self.assertEqual(sin['telefono'], '')
        for caso, t in INVALIDOS.items():
            if not t.strip():
                continue
            with self.subTest(caso):
                r = self.post('/proveedores', {'nombre': f'Prueba {caso}', 'servicios': [], 'telefono': t}, esperado=422)
                self.assertEqual(r['detalle'], MENSAJE)
        self.assertEqual(len(self.get('/proveedores')['datos']['proveedores']), 2)                         # los rechazos no dejaron nada
        # edición: omitir conserva, cadena vacía quita, inválido rechaza sin cambiar
        pid = ok['proveedorId']
        self.assertEqual(self.post(f'/proveedores/{pid}/edicion', {'nombre': 'Banquetes A', 'servicios': ['Banquete'], 'contacto': 'otro'})['datos']['telefono'], '5511112222')
        self.assertEqual(self.post(f'/proveedores/{pid}/edicion', {'nombre': 'Banquetes A', 'servicios': ['Banquete'], 'contacto': 'otro', 'telefono': '5533334444'})['datos']['telefono'], '5533334444')
        self.assertEqual(self.post(f'/proveedores/{pid}/edicion', {'nombre': 'Banquetes A', 'servicios': ['Banquete'], 'contacto': 'otro', 'telefono': '12345'}, esperado=422)['detalle'], MENSAJE)
        self.assertEqual(self.get(f'/proveedores/{pid}')['datos']['telefono'], '5533334444')
        self.assertEqual(self.post(f'/proveedores/{pid}/edicion', {'nombre': 'Banquetes A', 'servicios': ['Banquete'], 'contacto': 'otro', 'telefono': ''})['datos']['telefono'], '')
        # el proveedor histórico (sin teléfono) se edita sin que se le exija uno
        self.assertEqual(self.post(f"/proveedores/{sin['proveedorId']}/edicion", {'nombre': 'Sin Tel', 'servicios': ['Música'], 'contacto': 'correo@ejemplo.com'})['datos']['telefono'], '')


class TelefonosEnMemoria(_ApiTelefonos, ApiHttp, unittest.TestCase):
    def crear_contenedor(self, disponibilidad=None):
        return construir(disponibilidad)


class TelefonosEnPostgreSQL(_ApiTelefonos, ApiHttp, BaseConBD):
    def setUp(self):
        BaseConBD.setUp(self)
        self.arrancar()

    def crear_contenedor(self, disponibilidad=None):
        return construir_persistente(motor=self.motor, disponibilidad=disponibilidad)

    def test_la_base_rechaza_un_telefono_de_proveedor_que_no_tenga_diez_digitos(self):
        from sqlalchemy.exc import IntegrityError
        sql = sa.text("insert into proveedor (proveedor_id, nombre, nombre_normalizado, registrado_en, telefono) values (:i, :n, :n, now(), :t)")
        with self.motor.begin() as con:
            con.execute(sql, {'i': 'PV-OK', 'n': 'ok', 't': '5512345678'})
            con.execute(sql, {'i': 'PV-VACIO', 'n': 'vacio', 't': ''})
        for malo in ('123456789', '55123456789', '55 1234 5678', 'abcdefghij'):
            with self.subTest(malo), self.assertRaises(IntegrityError), self.motor.begin() as con:
                con.execute(sql, {'i': 'PV-' + malo, 'n': 'x' + malo, 't': malo})

    def test_los_proveedores_existentes_quedan_sin_telefono_y_el_telefono_persiste(self):
        pid = self.post('/proveedores', {'nombre': 'Persistente', 'servicios': [], 'telefono': '5544445555'})['datos']['proveedorId']
        self.arrancar()                                                                                      # contenedor nuevo, misma base
        self.assertEqual(self.get(f'/proveedores/{pid}')['datos']['telefono'], '5544445555')

    def test_la_revision_0011_solo_agrega_la_columna_y_su_restriccion(self):
        with open(os.path.join(RAIZ, 'migraciones', 'versions', '0011_telefono_de_proveedores.py'), encoding='utf-8') as f:
            texto = f.read()
        arbol = ast.parse(texto)
        def ops(nombre):
            fn = next(n for n in arbol.body if isinstance(n, ast.FunctionDef) and n.name == nombre)
            return [n.func.attr for n in ast.walk(fn) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and isinstance(n.func.value, ast.Name) and n.func.value.id == 'op' and n.func.attr != 'f']
        self.assertEqual(ops('upgrade'), ['add_column', 'create_check_constraint'])
        self.assertEqual(ops('downgrade'), ['drop_constraint', 'drop_column'])
        self.assertIn("server_default=''", texto)                                                            # los proveedores existentes quedan con ''
        self.assertNotRegex(texto, r'(?i)(delete\s+from|truncate|drop_table|insert\s+into|update\s+proveedor)')


@unittest.skipUnless(NODE, 'Node.js no está instalado')
class ReglaEnElNavegador(unittest.TestCase):
    """texto.js aplica la misma regla que el servidor (la interfaz solo ayuda; el servidor decide)."""
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='enova-tel-')
        shutil.copy(os.path.join(RAIZ, 'src', 'web', 'js', 'texto.js'), os.path.join(cls.tmp, 'texto.mjs'))
        cls.corredor = os.path.join(cls.tmp, 'corredor.mjs')
        with open(cls.corredor, 'w', encoding='utf-8') as f:
            f.write("import { MENSAJE_TELEFONO, soloDigitos, telefonoValido } from './texto.mjs';\nimport { readFileSync } from 'node:fs';\n"
                    "const e = JSON.parse(readFileSync(process.argv[2], 'utf-8'));\n"
                    "console.log(JSON.stringify({ mensaje: MENSAJE_TELEFONO, validos: e.map(telefonoValido), digitos: e.map(soloDigitos) }));\n")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_el_navegador_y_el_servidor_coinciden_en_cada_caso(self):
        casos = VALIDOS + list(INVALIDOS.values())
        entrada = os.path.join(self.tmp, 'entrada.json')
        with open(entrada, 'w', encoding='utf-8') as f:
            json.dump(casos, f)
        r = subprocess.run([NODE, self.corredor, entrada], capture_output=True, text=True, encoding='utf-8', timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        salida = json.loads(r.stdout)
        self.assertEqual(salida['mensaje'], MENSAJE)
        self.assertEqual(salida['validos'], [es_telefono_valido(c) for c in casos])
        self.assertEqual(salida['digitos'][VALIDOS.__len__() + list(INVALIDOS).index('espacios')], '5512345678')    # al pegar con espacios o guiones quedan solo los dígitos
        self.assertEqual(salida['digitos'][VALIDOS.__len__() + list(INVALIDOS).index('11 dígitos')], '55123456789')  # más de 10 dígitos NO se recortan: se marcan inválidos

    def test_el_formulario_limita_la_captura_a_diez_digitos_numericos(self):
        ui = open(os.path.join(RAIZ, 'src', 'web', 'js', 'ui.js'), encoding='utf-8').read()
        self.assertIn("case 'telefono'", ui)
        self.assertIn("pattern: '[0-9]{10}'", ui)
        self.assertIn("addEventListener('beforeinput'", ui)                                                  # bloquea letras, símbolos y el dígito número 11 al teclear
        self.assertIn('telefonoValido(v)', ui)                                                               # validación al enviar (mensaje único)
        self.assertNotIn('maxlength: 30', ui.split("case 'telefono'")[1].split('}')[0])                      # no se usa maxlength: el pegado largo no se recorta en silencio


if __name__ == '__main__':
    unittest.main()
