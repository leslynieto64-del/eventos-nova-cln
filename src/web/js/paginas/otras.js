/* Pagos y devoluciones, solicitudes, seguimiento, consulta de proveedor y estado del sistema. */
import { GET, api } from '../api.js';
import { ACCIONES } from '../acciones.js';
import { etiquetaConcepto, etiquetaTipoDevolucion, etiquetaTipoSolicitud, fmtFechaHora, fmtImporte } from '../negocio.js';
import { botonAccion, cargarEn, celdaProveedor, copiable, datos, h, insignia, tabla, tarjeta, textoRespuesta, aviso, vacio } from '../ui.js';
import { tablaSolicitudes } from './evento.js';
import { cargarNombresEventos, nombreEvento, opcionesEventos } from '../nombres-eventos.js';
import { estado as sesion, rol } from '../sesion.js';

const cabecera = (t, p) => h('header', { class: 'pagina-cab' }, h('h1', null, t), p ? h('p', null, p) : null);
const filtroEvento = (valor, alEnviar, extra = []) => h('form', { class: 'barra-filtros', onsubmit: (ev) => { ev.preventDefault(); alEnviar(ev.target.elements.evento.value.trim()); } },
  h('div', { class: 'campo' }, h('label', { for: 'f-evento' }, 'Filtrar por evento (opcional)'),
    h('select', { id: 'f-evento', name: 'evento' }, h('option', { value: '' }, 'Todos los eventos'),
      opcionesEventos().map((o) => h('option', { value: o.id, selected: o.id === valor ? true : null }, o.texto)))),
  ...extra, h('button', { class: 'btn btn-primario', type: 'submit' }, 'Consultar'));

// ------------------------------------------------------------------ pagos y devoluciones
export async function pagos(contenedor, _p, consulta) {
  await cargarNombresEventos();
  const eventoId = consulta.get('evento') || '';
  const salida = h('div');
  const pintar = () => {
    cargarEn(salida, () => Promise.all([GET('/pagos-pendientes', { evento_id: eventoId }), GET('/devoluciones-pendientes', { evento_id: eventoId })]), ([p, d]) => h('div', null,
      tarjeta(`Pagos pendientes o vencidos (${p.pagos.length})`, tabla([
        { titulo: 'Evento', celda: (x) => h('a', { href: `#/evento/${x.eventoId}` }, nombreEvento(x.eventoId)) },
        { titulo: 'Concepto', celda: (x) => etiquetaConcepto(x.concepto) },
        { titulo: 'Importe', clase: 'num', celda: (x) => fmtImporte(x.importe) }, { titulo: 'Pagado', clase: 'num', celda: (x) => fmtImporte(x.pagado) },
        { titulo: 'Saldo', clase: 'num', celda: (x) => fmtImporte(x.saldo) }, { titulo: 'Fecha límite', celda: (x) => fmtFechaHora(x.fechaLimite) },
        { titulo: 'Estado', celda: (x) => h('div', null, insignia(x.estado), x.estado === 'Vencida' ? h('div', { class: 'peq' }, 'El plazo de pago aparece vencido.') : null) },
        { titulo: 'Acción', celda: (x) => botonAccion(ACCIONES.registrarPago, { eventoId: x.eventoId, estadoCuentaId: x.estadoCuentaId, contratoId: x.contratoId, obligaciones: [x] }, pintar, { clase: 'btn btn-peq btn-primario', texto: 'Registrar pago' }) },
      ], p.pagos, { vacioTitulo: 'No hay pagos pendientes', vacioDetalle: 'Todas las obligaciones están al corriente o sin efecto.' })),
      tarjeta(`Devoluciones pendientes (${d.devoluciones.length})`, tabla([
        { titulo: 'Evento', celda: (x) => h('a', { href: `#/evento/${x.eventoId}` }, nombreEvento(x.eventoId)) }, { titulo: 'Tipo', celda: (x) => etiquetaTipoDevolucion(x.tipo) },
        { titulo: 'Concepto', celda: (x) => etiquetaConcepto(x.concepto) }, { titulo: 'Importe', clase: 'num', celda: (x) => fmtImporte(x.importe) },
        { titulo: 'Fecha límite', celda: (x) => fmtFechaHora(x.fechaLimite) },
        { titulo: 'Plazo', celda: (x) => (x.vencida ? h('span', { class: 'etiqueta-alerta' }, 'Fuera de plazo') : 'En plazo') },
        { titulo: 'Acción', celda: (x) => botonAccion(ACCIONES.ejecutarDevolucion, { eventoId: x.eventoId, estadoCuentaId: x.estadoCuentaId, devolucionId: x.devolucionId, importe: x.importe, concepto: x.concepto }, pintar, { clase: 'btn btn-peq' }, ) },
      ], d.devoluciones, { vacioTitulo: 'No hay devoluciones pendientes' }))));
  };
  contenedor.replaceChildren(cabecera('Pagos y devoluciones', 'Obligaciones pendientes o vencidas y devoluciones por efectuar, de todos los eventos.'),
    filtroEvento(eventoId, (v) => { location.hash = v ? `#/pagos?evento=${encodeURIComponent(v)}` : '#/pagos'; }), salida);
  pintar();
}

// ------------------------------------------------------------------ solicitudes
const ESTADOS_SOLICITUD = ['Registrada', 'Detenida por saldo vencido', 'En búsqueda de proveedor', 'En búsqueda de alternativa', 'Pendiente de aprobación del Cliente',
  'Pendiente de autorización', 'Pendiente de formalización', 'Autorizada', 'Pendiente de pago', 'Confirmada', 'No procedente', 'No se realizará', 'No aprobada',
  'No autorizada', 'Rechazada por el Cliente', 'Cerrada por falta de pago', 'Cerrada por inicio del evento', 'Cerrada por evento cancelado'];

export async function solicitudes(contenedor, _p, consulta) {
  await cargarNombresEventos();
  const f = { estado: consulta.get('estado') || '', tipo: consulta.get('tipo') || '', evento: consulta.get('evento') || '' };
  const salida = h('div');
  const pintar = () => cargarEn(salida, () => GET('/solicitudes', { estado: f.estado, tipo: f.tipo, evento_id: f.evento }),
    (r) => tarjeta(`${r.solicitudes.length} solicitud(es)`, tablaSolicitudes(r.solicitudes, pintar, { conEvento: true })));
  const sel = (id, etiqueta, clave, opciones) => h('div', { class: 'campo' }, h('label', { for: id }, etiqueta),
    h('select', { id, onchange: (e) => { f[clave] = e.target.value; } }, h('option', { value: '' }, 'Todos'), opciones.map((o) => h('option', { value: o, selected: f[clave] === o ? true : null }, clave === 'tipo' ? etiquetaTipoSolicitud(o) : o))));
  contenedor.replaceChildren(cabecera('Solicitudes', 'Cambios, servicios adicionales y sustituciones de proveedor. Para registrar una solicitud nueva abre el evento correspondiente.'),
    filtroEvento(f.evento, (v) => { f.evento = v; pintar(); }, [sel('f-tipo', 'Tipo', 'tipo', ['cambio', 'servicio adicional', 'sustitución de proveedor']), sel('f-estado', 'Estado', 'estado', ESTADOS_SOLICITUD)]), salida);
  pintar();
}

// ------------------------------------------------------------------ seguimiento
const EVENTOS_CERRADOS = ['Cancelado', 'Finalizado', 'Cerrado sin contratación'];

export async function seguimiento(contenedor, _p, consulta) {
  await cargarNombresEventos();
  const eventoId = consulta.get('evento') || '';
  const verCerrados = consulta.get('cerrados') === '1';
  const salida = h('div');
  contenedor.replaceChildren(cabecera('Seguimiento', 'Servicios que el proveedor aún no confirma y solicitudes en trámite.'),
    filtroEvento(eventoId, (v) => { const q = new URLSearchParams(Object.entries({ evento: v, cerrados: verCerrados ? '1' : '' }).filter(([, x]) => x)).toString(); location.hash = q ? `#/seguimiento?${q}` : '#/seguimiento'; },
      [h('div', { class: 'campo campo-bool' }, h('label', { for: 'f-cerrados' }, h('input', { id: 'f-cerrados', type: 'checkbox', checked: verCerrados ? true : null, onchange: (e) => {
        const q = new URLSearchParams(Object.entries({ evento: eventoId, cerrados: e.target.checked ? '1' : '' }).filter(([, x]) => x)).toString(); location.hash = q ? `#/seguimiento?${q}` : '#/seguimiento'; } }),
        h('span', null, 'Incluir eventos cancelados, finalizados o cerrados')))]), salida);
  const columnas = (conEstadoServicio) => [
    { titulo: 'Evento', celda: (s) => h('a', { href: `#/evento/${s.eventoId}` }, nombreEvento(s.eventoId)) }, { titulo: 'Servicio', celda: (s) => s.servicio },
    { titulo: 'Proveedor', celda: celdaProveedor }, conEstadoServicio ? { titulo: 'Estado del servicio', celda: (s) => insignia(s.estado) } : null,
    { titulo: 'Estado del evento', celda: (s) => insignia(s.estadoEvento) },
  ].filter(Boolean);
  cargarEn(salida, () => GET('/servicios-pendientes-confirmacion', { evento_id: eventoId }), (r) => {
    // Los proveedores solo se gestionan con el evento En organización: los servicios de eventos cancelados, finalizados o cerrados ya no
    // admiten asignación ni respuesta. No se alteran: se ocultan por omisión y se cuentan, y el interruptor los muestra.
    const cerrados = r.servicios.filter((s) => EVENTOS_CERRADOS.includes(s.estadoEvento));
    const vigentes = verCerrados ? r.servicios : r.servicios.filter((s) => !EVENTOS_CERRADOS.includes(s.estadoEvento));
    const sinProveedor = vigentes.filter((s) => s.estado === 'Sin proveedor asignado');
    const pendientes = vigentes.filter((s) => s.estado === 'Pendiente de confirmación del proveedor');
    const otros = vigentes.filter((s) => s.estado !== 'Sin proveedor asignado' && s.estado !== 'Pendiente de confirmación del proveedor');
    return h('div', null,
      !verCerrados && cerrados.length ? h('p', { class: 'peq' }, `Se ocultan ${cerrados.length} servicio(s) de eventos cancelados, finalizados o cerrados, que ya no admiten asignar proveedor. Activa «Incluir eventos cancelados, finalizados o cerrados» para verlos.`) : null,
      tarjeta(`Sin proveedor asignado (${sinProveedor.length})`, tabla(columnas(false), sinProveedor,
        { vacioTitulo: 'No hay servicios sin proveedor', vacioDetalle: 'Los servicios de los eventos vigentes ya tienen proveedor asignado.' }),
        { acciones: [h('a', { class: 'btn btn-peq', href: '#/proveedores' }, 'Catálogo de proveedores')] }),
      tarjeta(`Asignados, pendientes de confirmación del proveedor (${pendientes.length})`, tabla(columnas(false), pendientes,
        { vacioTitulo: 'No hay confirmaciones pendientes', vacioDetalle: 'Ningún proveedor asignado está esperando confirmar.' })),
      otros.length ? tarjeta(`Proveedor no disponible (${otros.length})`, tabla(columnas(true), otros, {})) : null,
      tarjeta(`Solicitudes en trámite (${r.solicitudes.length})`, tablaSolicitudes(r.solicitudes, () => seguimiento(contenedor, _p, consulta), { conEvento: true })));
  });
}

// ------------------------------------------------------------------ proveedor
export async function proveedor(contenedor) {
  if (rol() !== 'proveedor') await cargarNombresEventos();
  const salida = h('div');
  const selectProveedores = h('select', { id: 'p-prov', name: 'proveedor', required: true }, h('option', { value: '' }, 'Elige un proveedor'));
  const propio = rol() === 'proveedor' ? sesion.usuario.proveedorId : null;       // la cuenta de proveedor solo consulta SU proveedor (el servidor también lo exige)
  const consultar = (p, v) => cargarEn(salida, () => GET(`/proveedores/${encodeURIComponent(p)}/eventos/${encodeURIComponent(v)}`), (r) => tarjeta(`${r.tipoEvento || r.tipo || 'Evento'} · ${v}`, h('div', null,
    h('p', null, `${r.fecha || ''} ${r.hora || ''} · ${r.lugar || ''} · ${r.invitadosAproximados ?? ''} invitados aproximados`),
    tabla([{ titulo: 'Servicio', celda: (s) => s.servicio },
      { titulo: 'Estado', celda: (s) => h('div', null, insignia(s.estado), s.respuesta ? h('div', { class: 'peq' }, textoRespuesta(s.respuesta)) : null) },
      { titulo: 'Acciones', celda: (s) => (s.estado === 'Pendiente de confirmación del proveedor'
        ? botonAccion(ACCIONES.respuestaProveedor, { eventoId: v, servicioId: s.servicioContratadoId, servicio: s.servicio, proveedorId: p }, () => consultar(p, v), { clase: 'btn btn-peq btn-primario' })
        : h('span', { class: 'peq' }, 'Sin acciones pendientes')) }], r.servicios || []))));
  const asignaciones = h('div');
  const cargarAsignaciones = () => cargarEn(asignaciones, () => GET('/mis-asignaciones'), (r) => {
    const filas = [];
    (r.eventos || []).forEach((e) => (e.servicios || []).forEach((s) => filas.push({ e, s })));
    if (!filas.length) return tarjeta('Mis servicios asignados', vacio('Actualmente no tienes servicios asignados.', 'Cuando Coordinación te asigne uno, aparecerá aquí.'));
    const refrescar = cargarAsignaciones;
    const columnas = (modo) => [
      { titulo: 'Servicio', celda: ({ s }) => h('strong', null, s.servicio) },
      { titulo: 'Evento', celda: ({ e }) => h('div', null, e.tipoEvento, h('div', { class: 'peq' }, insignia(e.estadoEvento))) },
      { titulo: 'Fecha y lugar', celda: ({ e }) => h('div', null, `${e.fecha} · ${e.hora}`, h('div', { class: 'peq' }, e.lugar)) },
      { titulo: 'Situación', celda: ({ s }) => h('div', null, insignia(s.estado), s.respuesta ? h('div', { class: 'peq' }, textoRespuesta(s.respuesta)) : null) },
      modo ? { titulo: 'Qué puedes hacer', celda: ({ e, s }) => {
        const ctx = { eventoId: e.eventoId, servicioId: s.servicioContratadoId, servicio: s.servicio, proveedorId: propio };
        return modo === 'reportar'
          ? h('div', { class: 'acciones' }, botonAccion(ACCIONES.reportarIndisponibilidad, ctx, refrescar, { clase: 'btn btn-peq btn-peligro-suave', texto: 'Reportar indisponibilidad' }) || h('span', { class: 'peq' }, '—'),
            h('div', { class: 'peq' }, 'Si ya no puedes cumplir este servicio, avisa a Coordinación.'))
          : h('div', { class: 'acciones' }, botonAccion(ACCIONES.aceptarServicio, ctx, refrescar, { clase: 'btn btn-peq btn-primario' }), botonAccion(ACCIONES.rechazarServicio, ctx, refrescar, { clase: 'btn btn-peq btn-peligro-suave' }));
      } } : null,
    ].filter(Boolean);
    const grupo = (titulo, ayuda, cond, modo) => {
      const l = filas.filter(cond);
      return l.length ? tarjeta(`${titulo} (${l.length})`, h('div', null, h('p', { class: 'peq' }, ayuda), tabla(columnas(modo), l))) : null;
    };
    return h('div', null,
      grupo('Pendientes de tu respuesta', 'Coordinación te asignó estos servicios. Acepta el servicio si puedes prestarlo o recházalo si no puedes.', ({ s }) => s.estado === 'Pendiente de confirmación del proveedor', 'responder'),
      grupo('Servicios aceptados', 'Ya confirmaste que puedes prestar estos servicios. Si algo cambia y ya no puedes cumplir uno, repórtalo: Coordinación buscará un alternativo y tu aceptación anterior se conserva.', ({ s }) => s.estado === 'Confirmado por el proveedor', 'reportar'),
      grupo('Servicios rechazados o con indisponibilidad reportada', 'Indicaste que no podías prestar estos servicios (o reportaste que ya no puedes cumplirlos); Coordinación se encarga de buscar otro proveedor.', ({ s }) => s.estado === 'Proveedor no disponible', null));
  });
  if (propio) cargarAsignaciones();
  const misDatos = h('div');
  if (propio) cargarEn(misDatos, () => GET(`/proveedores/${encodeURIComponent(propio)}`), (r) => tarjeta('Mis datos', datos(
    ['Nombre', r.datos.nombre], ['Servicios que ofrece', r.datos.servicios.length ? r.datos.servicios.join(', ') : 'Sin servicios indicados'], ['Teléfono', r.datos.telefono || '—'], ['Otros datos de contacto', r.datos.contacto || '—'])));
  contenedor.replaceChildren(cabecera(propio ? 'Mi proveedor' : 'Consulta de proveedor',
    propio ? 'Aquí ves los servicios que tienes asignados, con su evento, fecha y lugar, y respondes con «Aceptar servicio» o «Rechazar servicio». Solo ves lo que te corresponde.' : 'Un proveedor solo ve los datos del evento y los servicios que tiene asignados.'),
    ...(propio ? [asignaciones, misDatos] : [
    h('form', { class: 'barra-filtros', onsubmit: (ev) => {
      ev.preventDefault(); const e = ev.target.elements; const p = e.proveedor.value; const v = e.evento.value;
      if (!p || !v) { aviso('aviso', 'Elige el proveedor y el evento que quieres consultar.'); return; }
      consultar(p, v);
    } },
    h('div', { class: 'campo' }, h('label', { for: 'p-prov' }, 'Proveedor *'), selectProveedores),
    h('div', { class: 'campo' }, h('label', { for: 'p-ev' }, 'Evento *'),
      h('select', { id: 'p-ev', name: 'evento', required: true }, h('option', { value: '' }, 'Elige un evento'), opcionesEventos().map((o) => h('option', { value: o.id }, o.texto)))),
    h('button', { class: 'btn btn-primario', type: 'submit' }, 'Consultar')), salida]));
  if (!propio) GET('/proveedores').then((r) => selectProveedores.append(...(r.datos.proveedores || []).filter((x) => x.activo !== false).map((x) => h('option', { value: x.proveedorId }, x.nombre)))).catch(() => {});
}

// ------------------------------------------------------------------ sistema
export async function sistema(contenedor) {
  const estado = h('div');
  contenedor.replaceChildren(cabecera('Sistema y ayuda', 'Estado del servicio, documentación técnica y límites conocidos de la aplicación.'),
    tarjeta('Estado del servicio', estado),
    tarjeta('Documentación técnica', h('ul', { class: 'lista-simple' },
      h('li', null, h('a', { href: '/docs', target: '_blank', rel: 'noopener' }, 'Swagger (documentación interactiva de la API)')),
      h('li', null, h('a', { href: '/openapi.json', target: '_blank', rel: 'noopener' }, 'Especificación OpenAPI')),
      h('li', null, h('a', { href: '/health', target: '_blank', rel: 'noopener' }, 'Comprobación de disponibilidad (/health)')),
      h('li', null, h('a', { href: '/ready', target: '_blank', rel: 'noopener' }, 'Comprobación de base de datos (/ready)')))),
    tarjeta('Límites conocidos', h('ul', null,
      h('li', null, 'Cada persona entra con su cuenta y su rol (Administración, Coordinación o Proveedor); el servidor rechaza lo que el rol no permite. Todavía no hay recuperación de contraseña por correo, segundo factor ni registro de auditoría persistente, y la aplicación no está lista para publicarse en Internet (falta HTTPS real y una revisión de seguridad independiente).'),
      h('li', null, 'El cliente se registra al registrar su evento (nombre, apellidos, teléfono y correo) y el sistema le asigna su identificador; con el mismo correo se reutiliza. Los eventos anteriores al catálogo conservan su identificador sin ficha de contacto. Los proveedores tienen su catálogo (módulo Proveedores), sin tarifas ni calendario de disponibilidad.'),
      h('li', null, 'La API no permite consultar propuestas ni el detalle de un pago por identificador; la interfaz recuerda en este navegador los que se crean desde aquí.'),
      h('li', null, 'No hay pasarela de pago: solo se registran pagos ya efectuados.'))));
  const pintarSalud = async () => {
    estado.replaceChildren(h('span', { class: 'rueda' }));
    const [s, r] = await Promise.allSettled([api('GET', '/health'), api('GET', '/ready')]);
    estado.replaceChildren(
      h('p', null, 'Aplicación: ', s.status === 'fulfilled' ? h('span', { class: 'insignia t-ok' }, 'Disponible') : h('span', { class: 'insignia t-error' }, 'No responde'),
        s.status === 'fulfilled' ? ` · ${s.value.aplicacion} ${s.value.version}` : ''),
      h('p', null, 'Base de datos: ', r.status === 'fulfilled' ? h('span', { class: 'insignia t-ok' }, `Lista (${r.value.persistencia})`) : h('span', { class: 'insignia t-aviso' }, 'No disponible o no comprobada')),
      h('button', { class: 'btn', type: 'button', onclick: pintarSalud }, 'Volver a comprobar'));
  };
  pintarSalud();
}
