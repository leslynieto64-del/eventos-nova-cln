/* Operaciones de negocio de la API, declaradas una sola vez: formulario, texto de confirmación y petición real.
   Cada acción recibe un «contexto» con los identificadores que necesita (evento, contrato, estado de cuenta, solicitud…). */
import { POST, GET } from './api.js';
import { etiquetaConcepto, fmtImporte, fmtFechaHora } from './negocio.js';
import { registro } from './registro.js';
import { rol, puede } from './sesion.js';
import { dialogoInfo, h, datos } from './ui.js';

const f = (nombre, etiqueta, tipo, extra) => ({ nombre, etiqueta, tipo, ...extra });
const FECHA = (nombre, etiqueta, ayuda) => f(nombre, etiqueta, 'fechahora', {
  requerido: true, valor: 'AHORA', ayuda: ayuda || 'Fecha y hora en que ocurrió, en la hora de negocio (Ciudad de México). Se propone la actual.' });
const SI_NO = (v) => (v ? 'Sí' : 'No');
const lista = (v) => v.join(', ');

const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
// Equivalencias EXPLÍCITAS de nombres de servicio (las mismas que EQUIVALENCIAS_DE_SERVICIOS en src/domain/proveedor.py): sin coincidencias aproximadas.
const EQUIVALENCIAS = { banquetes: 'banquete', salones: 'salon', musicas: 'musica', fotografias: 'fotografia', decoraciones: 'decoracion', invitaciones: 'invitacion', transportes: 'transporte', meseros: 'mesero' };
export const claveServicio = (t) => { const n = sinAcentos(t); return EQUIVALENCIAS[n] || n; };
const conAcentos = (t) => /[^\x00-\x7f]/.test(t);
/** El nombre que se muestra de un servicio: de las variantes escritas (Banquete, Banquetes), la más corta y, a igualdad, la que lleva acentos (Música, no Musica). */
export const etiquetaServicio = (variantes) => {
  const v = [...new Set(variantes.map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean))].sort((a, b) => (a.length - b.length) || ((conAcentos(b) ? 1 : 0) - (conAcentos(a) ? 1 : 0)))[0] || '';
  return v.charAt(0).toUpperCase() + v.slice(1);
};
/** «Banquete; Música» son DOS servicios: separa por «;» o «,», quita vacíos y repetidos (sin distinguir mayúsculas, acentos ni plural/singular explícito). */
export function separarServicios(lista_) {
  const vistos = new Set(); const salida = [];
  for (const s of lista_ || []) for (const parte of String(s || '').split(/[;,]/)) {
    const limpio = parte.replace(/\s+/g, ' ').trim(); const k = claveServicio(limpio);
    if (limpio && !vistos.has(k)) { vistos.add(k); salida.push(limpio); }
  }
  return salida;
}
const num = (t) => { const n = Number(String(t === undefined || t === null ? '' : t).replace(/,/g, '').trim()); return Number.isFinite(n) ? n : 0; };
const suma = (valores) => Math.round(valores.reduce((a, b) => a + b, 0) * 100) / 100;

/** Catálogo de servicios y proveedores ACTIVOS que ofrecen cada uno (el servidor vuelve a validarlo al guardar). Incluye los servicios del evento y de la versión actual
    aunque ningún proveedor los ofrezca (se avisa y se bloquea el avance con ese servicio). */
async function prepararPropuesta(ctx) {
  const verCatalogo = puede('proveedores.consultar');
  const proveedores = verCatalogo ? ((await GET('/proveedores')).datos.proveedores || []).filter((x) => x.activo !== false) : [];
  const mapa = new Map();                                                            // clave → { variantes, proveedores }
  const agregar = (nombre) => { const k = claveServicio(nombre); if (!k) return null; if (!mapa.has(k)) mapa.set(k, { variantes: [], proveedores: [] }); mapa.get(k).variantes.push(nombre); return k; };
  const previos = separarServicios(ctx.propuesta ? ctx.propuesta.servicios : []);
  const pedidos = separarServicios(ctx.servicios);
  previos.forEach(agregar); pedidos.forEach(agregar);
  for (const p of proveedores) for (const sv of p.servicios || []) { const k = agregar(sv); if (k && !mapa.get(k).proveedores.some((x) => x.proveedorId === p.proveedorId)) mapa.get(k).proveedores.push(p); }
  const orden = [...previos, ...pedidos].map(claveServicio);
  const claves = [...new Set([...orden, ...[...mapa.keys()].sort((a, b) => a.localeCompare(b, 'es'))])];
  const servicios = claves.map((k) => ({ clave: k, etiqueta: etiquetaServicio(mapa.get(k).variantes), proveedores: mapa.get(k).proveedores }));
  const inicial = (previos.length ? previos : pedidos).map(claveServicio);
  const previo = {};                                                                  // renglón de la versión actual por servicio (proveedor e importe), si la versión tenía desglose
  for (const d of (ctx.propuesta && ctx.propuesta.desglose) || []) previo[claveServicio(d.servicio)] = d;
  return { ...ctx, servicios, inicial, previo, verCatalogo };
}
const sinProveedores = (servicio, verCatalogo) => h('div', null,
  h('p', null, h('strong', null, `No hay proveedores disponibles para «${servicio}».`)),
  h('p', null, verCatalogo ? 'Puedes consultar el catálogo o registrar un proveedor autorizado y volver a abrir este formulario.' : 'Pide a Coordinación o Administración que registre un proveedor autorizado.'),
  verCatalogo ? h('a', { href: '#/proveedores' }, 'Ir al catálogo de proveedores') : null);

const CAMPOS_PROPUESTA = (ctx) => {
  const lista_ = ctx.servicios || [];
  const campos = [];
  const version = ctx.propuesta ? ctx.propuesta.numeroVersion : null;
  campos.push(f('aviso_version', '', 'nota', { contenido: version
    ? h('div', null, h('p', null, h('strong', null, `Se generará la versión ${version + 1}.`)),
      h('p', null, `La versión ${version} se conserva tal como está y la nueva pasa a ser la vigente, otra vez en revisión del Cliente. Puedes agregar o quitar servicios, cambiar el proveedor de cada uno y ajustar importes y condiciones.`),
      ctx.propuesta && ctx.propuesta.desglose && ctx.propuesta.desglose.length ? null : h('p', null, `La versión ${version} solo tenía el total (${fmtImporte(ctx.propuesta ? ctx.propuesta.costoTotal : 0)}): captura el importe de cada servicio.`))
    : h('p', null, 'Elige los servicios, el proveedor y el importe cotizado de cada uno. El total se calcula solo.') }));
  campos.push(f('servicios', 'Servicios incluidos en la propuesta', 'checks', { requerido: true, seccion: 'Servicios', valor: ctx.inicial, opciones: lista_.map((x) => ({ valor: x.clave, texto: x.etiqueta })),
    ayuda: 'Marca los servicios que incluye la propuesta. La lista sale del catálogo de proveedores y de los servicios del evento; no estás limitado a los que se pidieron al inicio.', mensajeVacio: 'Incluye al menos un servicio en la propuesta.' }));
  lista_.forEach((sv, i) => {
    const previo = ctx.previo ? ctx.previo[sv.clave] : null;
    const visible = (v) => (v.servicios || []).includes(sv.clave);
    if (!sv.proveedores.length) {
      campos.push(f(`sin_${i}`, 'Proveedor', 'checks', { requerido: true, seccion: `Servicio: ${sv.etiqueta}`, opciones: [], sinOpciones: sinProveedores(sv.etiqueta, ctx.verCatalogo), visibleSi: visible,
        mensajeVacio: `No hay proveedores disponibles para ${sv.etiqueta}: regístralo en el catálogo o quita el servicio de la propuesta.` }));
      return;
    }
    campos.push(f(`prov_${i}`, 'Proveedor considerado', 'select', { requerido: true, seccion: `Servicio: ${sv.etiqueta}`, vacio: 'Selecciona un proveedor', visibleSi: visible,
      opciones: sv.proveedores.map((x) => ({ valor: x.proveedorId, texto: x.nombre })), valor: previo ? previo.proveedorId : undefined, ayuda: 'Solo aparecen proveedores activos que ofrecen este servicio.' }));
    campos.push(f(`imp_${i}`, 'Importe cotizado', 'importe', { requerido: true, positivo: true, visibleSi: visible, valor: previo ? String(previo.importe) : undefined,
      ayuda: 'El importe que cotizó el proveedor para este servicio; Eventos Nova no asigna precios automáticamente.' }));
  });
  campos.push(f('total', '', 'nota', { seccion: 'Total y condiciones', contenidoDe: (v) => {
    const filas = lista_.map((sv, i) => ({ sv, i })).filter(({ sv }) => (v.servicios || []).includes(sv.clave) && sv.proveedores.length);
    const total = suma(filas.map(({ i }) => num(v[`imp_${i}`])));
    return h('div', null, ...filas.map(({ sv, i }) => h('div', { class: 'fila-total' }, h('span', null, sv.etiqueta), h('span', null, fmtImporte(num(v[`imp_${i}`]))))),
      h('div', { class: 'fila-total total' }, h('strong', null, 'Total de la propuesta'), h('strong', null, fmtImporte(total))));
  } }));
  campos.push(f('condiciones', 'Condiciones', 'textarea', { requerido: true, valor: ctx.propuesta ? ctx.propuesta.condiciones : undefined, ayuda: 'Condiciones generales que se ofrecen al Cliente.' }));
  return campos;
};
const claves_ = (v) => (Array.isArray(v.servicios) ? v.servicios : []);
const renglones = (v, c) => (c.servicios || []).map((sv, i) => ({ sv, i })).filter(({ sv }) => claves_(v).includes(sv.clave)).map(({ sv, i }) => ({
  servicio: sv.etiqueta, proveedor_id: v[`prov_${i}`], importe: v[`imp_${i}`], nombre: ((sv.proveedores.find((x) => x.proveedorId === v[`prov_${i}`])) || {}).nombre }));
const cuerpoPropuesta = (v, c) => ({ desglose: renglones(v, c).map((r) => ({ servicio: r.servicio, proveedor_id: r.proveedor_id, importe: r.importe })), condiciones: v.condiciones });
const resumenPropuesta = (v, c) => {
  const r = renglones(v, c);
  return `${r.map((x) => `${x.servicio}: ${x.nombre} — ${fmtImporte(x.importe)}`).join('\n')}\nTotal: ${fmtImporte(suma(r.map((x) => num(x.importe))))}.`;
};
const campoDecision = (actorPorDefecto) => [
  f('actor', 'Quién decide', 'texto', { requerido: true, valor: actorPorDefecto }),
  f('aprobada', 'Se aprueba', 'bool', { valor: true }),
  FECHA('fecha', 'Fecha de la decisión'),
  f('motivo', 'Motivo', 'textarea', { ayuda: 'Recomendado cuando la decisión es un rechazo.' }),
];
const MEDIOS_RESPUESTA = ['Llamada telefónica', 'Mensaje (WhatsApp o SMS)', 'Correo electrónico', 'Otro'];

/** D-P3: texto con lo que Coordinación registró de la cotización del proveedor (se muestra a quien autoriza). */
export const resumenProveedor = (d) => (d ? [d.proveedorId ? `Proveedor ${d.proveedorId}` : null, d.costo != null ? `costo ${fmtImporte(d.costo)}` : 'sin costo registrado',
  d.condiciones ? `condiciones: ${d.condiciones}` : 'sin condiciones especiales'].filter(Boolean).join(' · ') : null);

/** Proveedores del catálogo REAL que pueden registrarse: activos y que ofrecen el servicio (el servidor vuelve a validarlo). */
async function proveedoresDelServicio(servicio, excluirId) {
  const r = await GET('/proveedores', { servicio });
  return (r.datos.proveedores || []).filter((p) => p.activo !== false && p.proveedorId !== excluirId && p.servicios.some((x) => claveServicio(x) === claveServicio(servicio)))
    .map((p) => ({ valor: p.proveedorId, texto: p.nombre }));
}

const cuerpoDecision = (v) => ({ actor: v.actor, aprobada: v.aprobada, fecha: v.fecha, motivo: v.motivo || '' });

// COR-16: los datos actuales del evento (c.evento, de la consulta administrativa) se muestran como valor inicial; solo se envían si el usuario marca
// «El cambio modifica los datos del evento». Al aprobarse, el cambio reemplaza los datos del evento por los de esta solicitud.
const datosPropuestos = (c) => {
  const e = (c && c.evento) || {};
  return [
    f('cambiar_datos', 'El cambio modifica los datos del evento (tipo, fecha, lugar o invitados)', 'bool', {
      ayuda: 'Al marcarlo se muestran los datos actuales del evento. Modifica solo lo que cambie: los demás se conservan tal como están.' }),
    f('tipo', 'Tipo de evento', 'texto', { requerido: true, valor: e.tipoEvento, visibleSi: (v) => v.cambiar_datos }),
    f('fecha_hora', 'Nueva fecha y hora del evento', 'fechahora', { requerido: true, valor: e.fechaHora, visibleSi: (v) => v.cambiar_datos }),
    f('lugar', 'Lugar', 'texto', { requerido: true, valor: e.lugar, visibleSi: (v) => v.cambiar_datos }),
    f('invitados_aproximados', 'Invitados aproximados', 'entero', { requerido: true, minimo: 1, valor: e.invitadosAproximados === undefined ? undefined : String(e.invitadosAproximados), visibleSi: (v) => v.cambiar_datos }),
  ];
};

export const ACCIONES = {
  // ------------------------------------------------------------ eventos y propuestas
  registrarEvento: {
    titulo: 'Registrar evento', textoEnviar: 'Registrar evento',
    intro: () => 'Registra un evento nuevo. Quedará En gestión hasta que se confirme la contratación.',
    campos: () => [
      f('nombres', 'Nombre(s)', 'texto', { requerido: true, maxLongitud: 100, seccion: 'Datos del cliente' }),
      f('apellidos', 'Apellidos', 'texto', { requerido: true, maxLongitud: 100 }),
      f('telefono', 'Teléfono', 'telefono', { requerido: true, ayuda: 'Exactamente 10 dígitos, sin espacios ni guiones. Ejemplo: 5512345678.' }),
      f('correo', 'Correo electrónico', 'correo', { requerido: true, ayuda: 'Con este correo se reconoce al cliente en eventos futuros; el identificador lo asigna el sistema.' }),
      f('tipo', 'Tipo de evento', 'texto', { requerido: true, seccion: 'Datos del evento', ayuda: 'Por ejemplo: Boda, Conferencia, Cumpleaños.' }),
      f('fecha_hora', 'Fecha y hora del evento', 'fechahora', { requerido: true }),
      f('lugar', 'Lugar', 'texto', { requerido: true }),
      f('invitados_aproximados', 'Invitados aproximados', 'entero', { requerido: true, minimo: 1 }),
      f('servicios', 'Servicios solicitados', 'lista', { requerido: true, ayuda: 'Separa los servicios con comas (por ejemplo, Banquete, Música).' }),
    ],
    enviar: (v) => POST('/eventos', { cliente: { nombres: v.nombres, apellidos: v.apellidos, telefono: v.telefono, correo: v.correo },
      datos: { tipo: v.tipo, fecha_hora: v.fecha_hora, lugar: v.lugar, invitados_aproximados: Number(v.invitados_aproximados) }, servicios: v.servicios }),
    despues: (r, ctx) => {                                            // esta respuesta no usa «datos»: trae evento_id, cliente y cliente_nuevo
      if (ctx.irA && r.evento_id) ctx.irA(`#/evento/${encodeURIComponent(r.evento_id)}`);
      const c = r.cliente;
      if (c) dialogoInfo('Evento registrado', h('div', null,
        h('p', null, r.cliente_nuevo ? 'El cliente se registró y el evento quedó En gestión.' : 'Se reutilizó el cliente que ya tenía ese correo y el evento quedó En gestión.'),
        datos(['Identificador del evento', r.evento_id], ['Identificador del cliente', c.clienteId], ['Cliente', c.nombreCompleto], ['Teléfono', c.telefono], ['Correo', c.correo]),
        h('p', { class: 'peq' }, 'Los datos del cliente se consultan en el detalle del evento; no hace falta capturarlos otra vez.')));
    },
  },
  crearPropuesta: {
    titulo: 'Crear propuesta', textoEnviar: 'Crear propuesta',
    intro: () => 'Elige los servicios, el proveedor y el importe cotizado de cada uno. El total se calcula automáticamente y la fecha de la versión la asigna el sistema.',
    preparar: prepararPropuesta,
    campos: CAMPOS_PROPUESTA,
    resumen: (v, c) => `Se creará la propuesta:\n${resumenPropuesta(v, c)}`,
    enviar: (v, c) => POST(`/eventos/${encodeURIComponent(c.eventoId)}/propuestas`, cuerpoPropuesta(v, c)),
    mensajeExito: (r, c) => `La propuesta por ${fmtImporte(suma(renglones(r._valores, c).map((x) => num(x.importe))))} se creó correctamente. Siguiente paso: que el Cliente la revise y la acepte.`,
    despues: (r, c) => registro.guardarPropuesta({ id: r.propuesta_id, eventoId: c.eventoId, version: 1, versionId: `${r.propuesta_id}-v1`, resultado: 'Creada' }),   // sin «datos»
  },
  nuevaVersion: {
    titulo: 'Generar nueva versión', textoEnviar: 'Generar versión',
    intro: () => 'Modifica la propuesta con lo que pidió el Cliente. La versión anterior se conserva y la nueva pasa a ser la vigente, otra vez en revisión del Cliente.',
    preparar: prepararPropuesta,
    campos: CAMPOS_PROPUESTA,
    resumen: (v, c) => `Se generará la versión ${c.propuesta ? c.propuesta.numeroVersion + 1 : 'siguiente'}:\n${resumenPropuesta(v, c)}`,
    enviar: (v, c) => POST(`/propuestas/${encodeURIComponent(c.propuestaId)}/versiones`, cuerpoPropuesta(v, c)),
    mensajeExito: (r) => `La versión ${r.datos.numero} de la propuesta se generó y es la vigente. La versión anterior se conserva en el historial.`,
    despues: (r, c) => registro.guardarPropuesta({ id: c.propuestaId, version: r.datos.numero, versionId: r.datos.version_id, resultado: 'Nueva versión vigente' }),
  },
  aceptarPropuesta: {
    titulo: 'Aceptar propuesta', textoEnviar: 'Aceptar propuesta',
    intro: () => 'Registra que el Cliente aceptó la versión vigente de la propuesta.',
    campos: () => [],
    resumen: () => 'Se aceptará la versión vigente de la propuesta. Después ya no se podrán generar versiones nuevas.',
    enviar: (v, c) => POST(`/propuestas/${encodeURIComponent(c.propuestaId)}/aceptacion`, { version_id: c.versionId }),
    mensajeExito: () => 'La propuesta fue aceptada. Siguiente paso: preparar el contrato.',
    despues: (r, c) => registro.guardarPropuesta({ id: c.propuestaId, resultado: 'Aceptada' }),
  },
  cerrarPropuesta: {
    titulo: 'Cerrar por no aceptación', textoEnviar: 'Cerrar propuesta', peligro: true,
    intro: () => 'Cierra la propuesta porque el Cliente no la aceptó. El evento sigue En gestión y podrás elaborar otra propuesta.',
    campos: () => [f('motivo', 'Motivo', 'textarea', { requerido: true })],
    resumen: () => 'La propuesta se cerrará por no aceptación y no podrá volver a abrirse.',
    enviar: (v, c) => POST(`/propuestas/${encodeURIComponent(c.propuestaId)}/cierre-por-no-aceptacion`, { motivo: v.motivo }),
    despues: (r, c) => registro.guardarPropuesta({ id: c.propuestaId, resultado: 'Cerrada por no aceptación' }),
    mensajeExito: () => 'La propuesta se cerró por no aceptación. El evento sigue En gestión.',
  },
  prepararContrato: {
    titulo: 'Preparar contrato', textoEnviar: 'Preparar contrato',
    intro: () => 'Prepara el contrato a partir de la propuesta aceptada.',
    campos: () => [f('politica_incluida', 'El contrato incluye la política de no reembolso', 'bool', { valor: true })],
    mensajeExito: () => 'El contrato quedó preparado. Siguiente paso: comunicar al Cliente la política de no reembolso.',
    enviar: (v, c) => POST(`/propuestas/${encodeURIComponent(c.propuestaId)}/contrato`, { politica_incluida: v.politica_incluida }),
    despues: (r, c) => registro.guardarPropuesta({ id: c.propuestaId, contratoId: r.datos.contrato_id, resultado: 'Contrato preparado' }),
  },

  // ------------------------------------------------------------ contrato
  comunicarPolitica: {
    titulo: 'Comunicar política de no reembolso', textoEnviar: 'Registrar comunicación',
    intro: () => 'Registra cuándo se comunicó al Cliente la política de no reembolso. Debe hacerse antes de la firma del contrato y solo se registra una vez.',
    campos: () => [FECHA('fecha', 'Fecha y hora de la comunicación')],
    enviar: (v, c) => POST(`/contratos/${encodeURIComponent(c.contratoId)}/comunicacion-politica-no-reembolso`, { fecha: v.fecha }),
    mensajeExito: (r) => (r.datos && r.datos.ya_registrada
      ? `La política de no reembolso ya estaba comunicada (${fmtFechaHora(r.datos.comunicada_en)}). Se conservó el registro original.`
      : 'Política de no reembolso comunicada correctamente.'),
    exito: (r) => (r.datos && r.datos.comunicada_en ? `Comunicada el ${fmtFechaHora(r.datos.comunicada_en)}.` : null),
  },
  firmarContrato: {
    titulo: 'Registrar firma del contrato', textoEnviar: 'Registrar firma',
    intro: () => 'Registra que el contrato fue firmado. Esta pantalla solo anota que la firma ocurrió; no es una firma electrónica.',
    campos: () => [FECHA('fecha', 'Fecha y hora de la firma')],
    resumen: (v) => `Se registrará la firma del contrato con fecha ${fmtFechaHora(v.fecha)}. La firma no se puede registrar dos veces.`,
    enviar: (v, c) => POST(`/contratos/${encodeURIComponent(c.contratoId)}/firma`, { fecha: v.fecha }),
    mensajeExito: () => 'La firma del contrato quedó registrada. Siguiente paso: registrar y verificar el anticipo.',
  },
  seguimientoAnticipo: {
    titulo: 'Dar seguimiento al anticipo', textoEnviar: 'Registrar seguimiento',
    intro: (c) => `Registra el contacto con el Cliente por el anticipo pendiente del contrato ${c.contratoId}.`,
    aviso: 'Si indicas que no hubo pago tras el seguimiento, el sistema puede cerrar la contratación sin confirmar.',
    campos: () => [FECHA('fecha', 'Fecha del contacto'),
      f('resultado_contacto', 'Resultado del contacto', 'textarea', { requerido: true }),
      f('sin_pago_tras_seguimiento', 'Ya pasó el plazo del seguimiento y el Cliente no pagó', 'bool', {})],
    resumen: (v) => (v.sin_pago_tras_seguimiento ? 'Se intentará cerrar la contratación porque no hubo pago tras el seguimiento.' : 'Se registrará el seguimiento del anticipo.'),
    peligro: false,
    enviar: (v, c) => POST(`/contratos/${encodeURIComponent(c.contratoId)}/seguimiento-anticipo`, { fecha: v.fecha, resultado_contacto: v.resultado_contacto, sin_pago_tras_seguimiento: v.sin_pago_tras_seguimiento }),
  },
  confirmarContratacion: {
    titulo: 'Confirmar la contratación', textoEnviar: 'Confirmar contratación',
    intro: () => 'Confirma la contratación. Requiere contrato firmado, política comunicada y anticipo verificado.',
    mensajeExito: () => 'La contratación quedó confirmada y el evento pasa a organización.',
    resumen: () => 'Se confirmará la contratación. Si falta algún requisito, el sistema lo indicará y no se cambiará nada.',
    enviar: (v, c) => POST(`/contratos/${encodeURIComponent(c.contratoId)}/confirmacion`),
  },

  // ------------------------------------------------------------ pagos
  registrarPago: {
    titulo: 'Registrar pago', textoEnviar: 'Registrar pago',
    intro: (c) => `Registra un pago recibido del Cliente en el estado de cuenta ${c.estadoCuentaId}. No se procesa ningún cobro: solo se anota el pago ya efectuado.`,
    campos: (c) => [
      f('obligacion_id', 'Obligación que se paga', 'select', { requerido: true, opciones: c.obligaciones.map((o) => ({ valor: o.obligacionId, texto: `${etiquetaConcepto(o.concepto)} — saldo ${fmtImporte(o.saldo)}${o.estado === 'Vencida' ? ' (vencida)' : ''}` })) }),
      f('importe', 'Importe pagado', 'importe', { requerido: true, positivo: true, ayuda: 'Los pagos parciales se acumulan; el anticipo mínimo puede cubrirse con varios pagos.' }),
      FECHA('fecha', 'Fecha en que el Cliente efectuó el pago', 'Es la fecha efectiva del pago según el comprobante; decide si cumplió el plazo.'),
      f('comprobante', 'Referencia del comprobante', 'texto', { requerido: true, ayuda: 'No se puede repetir el mismo comprobante en una misma obligación.' }),
      f('verificar_ahora', 'Verificar el pago ahora', 'bool', { valor: true, ayuda: 'Si lo desmarcas, el pago queda Registrado y se verifica después.' }),
    ],
    // COR-07: solo advierte; las reglas aprobadas permiten registrar un importe mayor al saldo y el servidor sigue decidiendo.
    resumen: (v, c) => {
      const o = c.obligaciones.find((x) => x.obligacionId === v.obligacion_id);
      const excede = o && o.saldo !== undefined && o.saldo !== null && Number(v.importe) > Number(o.saldo);
      return `Se registrará un pago de ${fmtImporte(v.importe)} para «${o ? etiquetaConcepto(o.concepto) : v.obligacion_id}»${v.verificar_ahora ? ' y se verificará de inmediato' : ''}.`
        + (excede ? `\nAtención: el importe supera el saldo pendiente de esta obligación (${fmtImporte(o.saldo)}). Las reglas vigentes lo permiten, pero el excedente no se devuelve automáticamente; confirma que el importe y el comprobante son correctos.` : '');
    },
    enviar: (v, c) => POST(`/estados-cuenta/${encodeURIComponent(c.estadoCuentaId)}/pagos`, { obligacion_id: v.obligacion_id, importe: v.importe, fecha: v.fecha, comprobante: v.comprobante, verificar_ahora: v.verificar_ahora }),
    despues: (r, c) => r.datos.pago_id && registro.guardarPago({ pagoId: r.datos.pago_id, estadoCuentaId: c.estadoCuentaId, eventoId: c.eventoId, estado: r.datos.estado }),
    mensajeExito: (r) => `El pago de ${fmtImporte(r._valores.importe)} fue registrado${r._valores.verificar_ahora ? ' y verificado' : ' (queda pendiente de verificación)'} correctamente.`,
  },
  verificarPago: {
    titulo: 'Verificar pago', textoEnviar: 'Verificar pago',
    intro: (c) => `Verifica el pago de ${fmtImporte(c.pago && c.pago.importe)} (${etiquetaConcepto(c.pago && c.pago.concepto)}) que quedó Registrado. Mientras no se verifique, no cuenta como pagado.`,
    campos: () => [FECHA('verificado_en', 'Fecha y hora de la verificación')],
    resumen: (v, c) => `Se verificará el pago de ${fmtImporte(c.pago && c.pago.importe)}. Un pago verificado no se vuelve a verificar.`,
    enviar: (v, c) => POST(`/estados-cuenta/${encodeURIComponent(c.estadoCuentaId)}/pagos/${encodeURIComponent(c.pago.pagoId)}/verificacion`, { verificado_en: v.verificado_en }),
    mensajeExito: (r, c) => `El pago de ${fmtImporte(c.pago && c.pago.importe)} fue verificado correctamente.`,
    despues: (r, c) => r.datos.pago_id && registro.guardarPago({ pagoId: r.datos.pago_id, estadoCuentaId: c.estadoCuentaId, estado: r.datos.estado }),
  },
  vencimientoSaldo: {
    titulo: 'Registrar vencimiento del saldo', textoEnviar: 'Registrar vencimiento',
    intro: (c) => `El sistema comprobará si el saldo del contrato original del estado de cuenta ${c.estadoCuentaId} ya venció y, si es así, lo registrará.`,
    resumen: () => 'Si el plazo del saldo terminó sin cubrirse, el saldo quedará Vencido y se bloquearán solicitudes nuevas.',
    enviar: (v, c) => POST(`/estados-cuenta/${encodeURIComponent(c.estadoCuentaId)}/vencimiento-saldo-original`),
  },
  protocoloCobro: {
    titulo: 'Activar protocolo de cobro', textoEnviar: 'Activar protocolo',
    intro: (c) => `Activa el protocolo de cobro del saldo vencido del estado de cuenta ${c.estadoCuentaId}.`,
    campos: () => [FECHA('comunicado_en', 'Fecha de la comunicación al Cliente'),
      f('importe_moratorio', 'Importe de los cargos moratorios', 'importe', { requerido: true, positivo: true }),
      f('seguimiento', 'Seguimiento realizado', 'textarea', { requerido: true })],
    resumen: (v) => `Se activará el protocolo de cobro con cargos moratorios de ${fmtImporte(v.importe_moratorio)}.`,
    enviar: (v, c) => POST(`/estados-cuenta/${encodeURIComponent(c.estadoCuentaId)}/protocolo-cobro`, { comunicado_en: v.comunicado_en, importe_moratorio: v.importe_moratorio, seguimiento: v.seguimiento }),
  },
  regularizacion: {
    titulo: 'Registrar regularización del saldo', textoEnviar: 'Registrar resultado',
    intro: (c) => `Registra el resultado de la regularización del saldo vencido del estado de cuenta ${c.estadoCuentaId}.`,
    campos: () => [FECHA('revisado_en', 'Fecha de la revisión')],
    resumen: () => 'El sistema determinará si el saldo quedó regularizado dentro del plazo y registrará el resultado.',
    enviar: (v, c) => POST(`/estados-cuenta/${encodeURIComponent(c.estadoCuentaId)}/regularizacion`, { revisado_en: v.revisado_en }),
  },
  ejecutarDevolucion: {
    titulo: 'Registrar devolución efectuada', textoEnviar: 'Registrar devolución',
    intro: (c) => `Registra que se devolvió ${fmtImporte(c.importe)} (${etiquetaConcepto(c.concepto)}). La devolución real se hace fuera del sistema.`,
    campos: () => [f('comprobante', 'Comprobante de la devolución', 'texto', { ayuda: 'Opcional. Si lo dejas vacío, el sistema usa su ejecutor de devoluciones (hoy una simulación).' })],
    resumen: (v, c) => `Se registrará como efectuada la devolución de ${fmtImporte(c.importe)}.`,
    enviar: (v, c) => POST(`/estados-cuenta/${encodeURIComponent(c.estadoCuentaId)}/devoluciones/${encodeURIComponent(c.devolucionId)}/ejecucion`, v.comprobante ? { comprobante: v.comprobante } : undefined),
  },

  // ------------------------------------------------------------ ciclo de vida del evento
  iniciarEvento: {
    titulo: 'Registrar inicio del evento (respaldo)', textoEnviar: 'Registrar inicio',
    intro: (c) => `Respaldo excepcional: el sistema inicia el evento ${c.eventoId} solo al llegar su fecha y hora (trabajador automático). Úsalo únicamente si ese proceso no actualizó el estado; el servidor rechaza el inicio antes de la fecha y hora programadas.`,
    aviso: 'Después del inicio ya no se aceptan cambios, y las solicitudes en trámite se cierran por inicio del evento.',
    resumen: () => 'Se registrará el inicio del evento.',
    enviar: (v, c) => POST(`/eventos/${encodeURIComponent(c.eventoId)}/inicio`),
  },
  finalizarEvento: {
    titulo: 'Registrar finalización del evento', textoEnviar: 'Registrar finalización',
    intro: (c) => `Registra que el evento ${c.eventoId} ya se llevó a cabo y concluyó.`,
    campos: () => [FECHA('fecha', 'Fecha de finalización')],
    resumen: (v) => `Se registrará la finalización con fecha ${fmtFechaHora(v.fecha)}.`,
    enviar: (v, c) => POST(`/eventos/${encodeURIComponent(c.eventoId)}/finalizacion`, { fecha: v.fecha }),
  },
  cancelarEvento: {
    titulo: 'Cancelar evento (solicitud del Cliente)', textoEnviar: 'Registrar cancelación', peligro: true,
    intro: (c) => `Registra la cancelación solicitada por el Cliente para el evento ${c.eventoId}.`,
    aviso: 'La política de no reembolso aplica: los pagos recibidos no se devuelven.',
    campos: () => [f('motivo', 'Motivo de la cancelación', 'textarea', { requerido: true })],
    resumen: () => 'Se cancelará el evento. Esta acción puede no tener marcha atrás.',
    enviar: (v, c) => POST(`/eventos/${encodeURIComponent(c.eventoId)}/cancelacion`, { motivo: v.motivo }),
  },
  cancelarPorRegularizacion: {
    titulo: 'Cancelar por falta de regularización', textoEnviar: 'Registrar cancelación', peligro: true,
    intro: (c) => `Registro formal de Coordinación: cancelación del evento ${c.eventoId} por falta de regularización del saldo vencido. Solo procede después de que Administración registró que el saldo no se regularizó dentro del plazo; el sistema registra tu cuenta y la fecha.`,
    campos: () => [f('motivo', 'Motivo', 'textarea', { requerido: true })],
    resumen: () => 'Se cancelará el evento por falta de regularización del saldo.',
    enviar: (v, c) => POST(`/eventos/${encodeURIComponent(c.eventoId)}/cancelacion-por-falta-de-regularizacion`, { motivo: v.motivo }),
  },
  revisionAdministrativa: {
    titulo: 'Registrar revisión administrativa', textoEnviar: 'Registrar revisión',
    intro: (c) => `Registra la revisión administrativa del evento cancelado ${c.eventoId}.`,
    campos: () => [FECHA('fecha', 'Fecha de la revisión'), f('resultado', 'Resultado de la revisión', 'textarea', { requerido: true })],
    enviar: (v, c) => POST(`/eventos/${encodeURIComponent(c.eventoId)}/revision-administrativa`, { fecha: v.fecha, resultado: v.resultado }),
  },

  // ------------------------------------------------------------ proveedores y servicios
  registrarProveedor: {
    titulo: 'Registrar proveedor', textoEnviar: 'Registrar proveedor',
    intro: () => 'Da de alta a un proveedor en el catálogo. Solo el nombre es obligatorio; los servicios que ofrece permiten proponerlo al asignar un servicio de un evento.',
    campos: () => [
      f('nombre', 'Nombre del proveedor', 'texto', { requerido: true, ayuda: 'Persona o empresa. No puede repetirse (sin distinguir mayúsculas ni acentos).' }),
      f('servicios', 'Servicios que ofrece', 'lista', { ayuda: 'Separa los servicios con comas (por ejemplo, Banquete, Música). Debe coincidir con el nombre del servicio contratado.' }),
      f('telefono', 'Teléfono (opcional)', 'telefono', { ayuda: 'Exactamente 10 dígitos, sin espacios ni guiones. Ejemplo: 5512345678.' }),
      f('contacto', 'Otros datos de contacto', 'texto', { ayuda: 'Texto libre: correo, persona de contacto u horario.' })],
    resumen: (v) => `Se registrará el proveedor «${v.nombre}»${v.servicios.length ? ` que ofrece: ${lista(v.servicios)}` : ' sin servicios indicados (no se propondrá al asignar hasta que los tenga)'}.`,
    enviar: (v) => POST('/proveedores', { nombre: v.nombre, servicios: v.servicios, contacto: v.contacto || '', ...(v.telefono ? { telefono: v.telefono } : {}) }),
    despues: (r, c) => c.irA && r.datos && r.datos.proveedorId && c.irA(`#/proveedores/${encodeURIComponent(r.datos.proveedorId)}`),
  },
  editarProveedor: {
    titulo: 'Editar proveedor', textoEnviar: 'Guardar cambios',
    intro: (c) => `Corrige los datos de «${c.proveedor.nombre}». Las asignaciones que ya tiene en eventos no cambian.`,
    campos: (c) => [
      f('nombre', 'Nombre del proveedor', 'texto', { requerido: true, valor: c.proveedor.nombre, ayuda: 'No puede repetir el nombre de otro proveedor (sin distinguir mayúsculas ni acentos).' }),
      f('servicios', 'Servicios que ofrece', 'lista', { valor: c.proveedor.servicios.join(', '), ayuda: 'Separa los servicios con comas. Debe coincidir con el nombre del servicio contratado.' }),
      f('telefono', 'Teléfono (opcional)', 'telefono', { valor: c.proveedor.telefono || '', ayuda: 'Exactamente 10 dígitos, sin espacios ni guiones. Déjalo vacío para quitarlo.' }),
      f('contacto', 'Otros datos de contacto', 'texto', { valor: c.proveedor.contacto || '', ayuda: 'Texto libre: correo, persona de contacto u horario.' })],
    resumen: (v) => `El proveedor quedará como «${v.nombre}»${v.servicios.length ? ` y ofrecerá: ${lista(v.servicios)}` : ' sin servicios indicados'}.`,
    enviar: (v, c) => POST(`/proveedores/${encodeURIComponent(c.proveedor.proveedorId)}/edicion`, { nombre: v.nombre, servicios: v.servicios, contacto: v.contacto || '', telefono: v.telefono || '' }),
  },
  desactivarProveedor: {
    titulo: 'Desactivar proveedor', textoEnviar: 'Desactivar', peligro: true,
    intro: (c) => `«${c.proveedor.nombre}» no se borra: conserva sus datos y sus asignaciones actuales, pero deja de proponerse para asignaciones nuevas. Puedes activarlo de nuevo cuando quieras.`,
    resumen: (v, c) => `El proveedor «${c.proveedor.nombre}» quedará desactivado.`,
    enviar: (v, c) => POST(`/proveedores/${encodeURIComponent(c.proveedor.proveedorId)}/desactivacion`),
  },
  activarProveedor: {
    titulo: 'Activar proveedor', textoEnviar: 'Activar', intro: (c) => `«${c.proveedor.nombre}» volverá a proponerse al asignar los servicios que ofrece.`,
    resumen: (v, c) => `El proveedor «${c.proveedor.nombre}» quedará activo.`,
    enviar: (v, c) => POST(`/proveedores/${encodeURIComponent(c.proveedor.proveedorId)}/activacion`),
  },
  asignarProveedor: {
    titulo: 'Asignar proveedor', textoEnviar: 'Asignar proveedor',
    intro: (c) => `Asigna un proveedor al servicio «${c.servicio}». Quedará pendiente de su confirmación.`,
    // Los candidatos (D-P2) son los proveedores registrados, activos y que ofrecen el servicio. Su disponibilidad en la fecha la confirma el proveedor al responder.
    campos: (c) => [f('proveedor_id', 'Proveedor', 'select', { requerido: true, opciones: c.candidatos,
      ayuda: 'Solo aparecen los proveedores candidatos: registrados, activos y que ofrecen este servicio. Que estén libres en la fecha del evento lo confirma el proveedor al responder; si falta alguno, regístralo en Proveedores indicando que ofrece este servicio.' })],
    resumen: (v, c) => `Se asignará el proveedor ${((c.candidatos || []).find((x) => x.valor === v.proveedor_id) || {}).texto || 'elegido'} al servicio «${c.servicio}». Quedará «Pendiente de confirmación del proveedor».`,
    mensajeExito: (r, c) => `El servicio «${c.servicio}» fue asignado a ${((c.candidatos || []).find((x) => x.valor === r._valores.proveedor_id) || {}).texto || 'el proveedor elegido'}. Queda pendiente de su respuesta.`,
    enviar: (v, c) => POST(`/eventos/${encodeURIComponent(c.eventoId)}/servicios/${encodeURIComponent(c.servicioId)}/proveedor`, { proveedor_id: v.proveedor_id }),
  },
  respuestaProveedor: {
    titulo: 'Registrar respuesta del proveedor', textoEnviar: 'Registrar respuesta',
    intro: (c) => (rol() === 'coordinador'
      ? `Registras la respuesta que el proveedor${c.proveedorNombre ? ` ${c.proveedorNombre}` : ''} te comunicó sobre el servicio «${c.servicio}». Quedará marcada como capturada por Coordinación, con el medio, tu cuenta y la fecha; no sustituye la respuesta directa del proveedor.`
      : `Registra si puedes prestar el servicio «${c.servicio}». Tu respuesta quedará registrada como directa de tu cuenta.`),
    campos: (c) => [
      f('disponible', 'El proveedor está disponible en la fecha del evento', 'bool', { valor: true }),
      ...(rol() === 'coordinador' ? [f('medio', 'Medio por el que el proveedor respondió', 'select', { requerido: true, opciones: [{ valor: '', texto: 'Elige el medio…' }, ...MEDIOS_RESPUESTA.map((m) => ({ valor: m, texto: m }))],
        ayuda: 'Obligatorio: la respuesta se distingue de una directa del proveedor.' })] : [])],
    resumen: (v, c) => `Se registrará que ${c.proveedorNombre || 'el proveedor'} ${v.disponible ? 'está disponible' : 'NO está disponible'} para «${c.servicio}»${v.medio ? ` (comunicado por ${v.medio.toLowerCase()}; capturada por Coordinación)` : ' (respuesta directa)'}.`,
    enviar: (v, c) => POST(`/eventos/${encodeURIComponent(c.eventoId)}/servicios/${encodeURIComponent(c.servicioId)}/respuesta-proveedor`,
      { proveedor_id: c.proveedorId, disponible: v.disponible, ...(v.medio ? { medio: v.medio } : {}) }),
    mensajeExito: (r, c) => `La respuesta quedó registrada: ${c.proveedorNombre || 'el proveedor'} ${r._valores.disponible ? 'está disponible' : 'no está disponible'} para «${c.servicio}».`,
  },
  reportarIndisponibilidad: {
    titulo: 'Reportar indisponibilidad', textoEnviar: 'Enviar reporte', peligro: true,
    intro: (c) => `Ya habías aceptado el servicio «${c.servicio}», pero ahora no puedes cumplirlo. Coordinación recibirá tu reporte y buscará un proveedor alternativo. Tu aceptación anterior se conserva en el historial y la asignación no se elimina por tu cuenta.`,
    campos: () => [
      f('motivo', 'Motivo de la indisponibilidad', 'select', { requerido: true, vacio: 'Selecciona un motivo',
        opciones: ['Problemas de disponibilidad', 'Problemas operativos', 'Imposibilidad de cumplir con el servicio', 'Otro motivo'].map((m) => ({ valor: m, texto: m }))}),
      f('descripcion', 'Descripción adicional', 'textarea', { maxLongitud: 500, ayuda: 'Opcional; obligatoria si eliges «Otro motivo». La fecha y la hora del reporte las registra el sistema.' })],
    resumen: (v, c) => `Reportarás que ya no puedes prestar «${c.servicio}» (${v.motivo}). Coordinación será notificada y buscará una alternativa.`,
    enviar: (v, c) => POST(`/eventos/${encodeURIComponent(c.eventoId)}/servicios/${encodeURIComponent(c.servicioId)}/indisponibilidad`, { proveedor_id: c.proveedorId, motivo: v.motivo, descripcion: v.descripcion || '' }),
    mensajeExito: (r, c) => `Tu reporte sobre «${c.servicio}» quedó registrado. Coordinación fue notificada y buscará un proveedor alternativo; tu aceptación anterior se conserva en el historial.`,
  },
  // Cuenta de proveedor: dos botones claros en lugar de un formulario.
  aceptarServicio: {
    titulo: 'Aceptar servicio', textoEnviar: 'Aceptar servicio',
    intro: (c) => `Confirmas que puedes prestar el servicio «${c.servicio}» en la fecha del evento.`,
    campos: () => [], resumen: (v, c) => `Aceptarás el servicio «${c.servicio}». Coordinación verá tu respuesta.`,
    enviar: (v, c) => POST(`/eventos/${encodeURIComponent(c.eventoId)}/servicios/${encodeURIComponent(c.servicioId)}/respuesta-proveedor`, { proveedor_id: c.proveedorId, disponible: true }),
    mensajeExito: (r, c) => `Aceptaste el servicio «${c.servicio}». Coordinación ya puede verlo como confirmado.`,
  },
  rechazarServicio: {
    titulo: 'Rechazar servicio', textoEnviar: 'Rechazar servicio', peligro: true,
    intro: (c) => `Indicas que NO puedes prestar el servicio «${c.servicio}» en la fecha del evento. Coordinación buscará otro proveedor.`,
    campos: () => [], resumen: (v, c) => `Rechazarás el servicio «${c.servicio}». Coordinación tendrá que buscar otro proveedor.`,
    enviar: (v, c) => POST(`/eventos/${encodeURIComponent(c.eventoId)}/servicios/${encodeURIComponent(c.servicioId)}/respuesta-proveedor`, { proveedor_id: c.proveedorId, disponible: false }),
    mensajeExito: (r, c) => `Rechazaste el servicio «${c.servicio}». Coordinación fue informada.`,
  },

  // ------------------------------------------------------------ solicitud de cambio
  nuevoCambio: {
    titulo: 'Registrar solicitud de cambio', textoEnviar: 'Registrar solicitud',
    intro: (c) => `Solicita un cambio al evento ${c.eventoId}. Solo procede después de contratar y antes del inicio; el sistema valida el plazo y te informará el resultado.`,
    campos: (c) => [
      f('contrato_id', 'Contrato', 'select', { requerido: true, opciones: c.contratos.map((x) => ({ valor: x.contratoId, texto: `Contrato por ${fmtImporte(x.costoTotal)} (${x.estado})` })), valor: c.contratos[0] && c.contratos[0].contratoId }),
      f('descripcion', 'Descripción del cambio', 'textarea', { requerido: true }),
      f('tarifa_vigente', 'Tarifa vigente del cargo por cambio tardío', 'importe', { requerido: true, ayuda: 'Escribe la tarifa autorizada por Eventos Nova (política vigente); no uses otro importe. Solo se cobra si el cambio se pide con menos de 7 días naturales y resulta viable.' }),
      ...datosPropuestos(c)],
    enviar: (v, c) => POST('/solicitudes-cambio', {
      evento_id: c.eventoId, contrato_id: v.contrato_id, descripcion: v.descripcion, tarifa_vigente: v.tarifa_vigente,
      datos_propuestos: v.cambiar_datos ? { tipo: v.tipo, fecha_hora: v.fecha_hora, lugar: v.lugar, invitados_aproximados: Number(v.invitados_aproximados) } : null }),
  },
  viabilidadCambio: {
    titulo: 'Evaluar viabilidad del cambio', textoEnviar: 'Registrar evaluación',
    intro: (c) => `Registra si el cambio «${c.descripcionSolicitud || 'esta solicitud'}» es viable.`,
    campos: () => [f('viable', 'El cambio es viable', 'bool', { valor: true }), f('motivo', 'Motivo', 'textarea'),
      f('costo_adicional_proveedor', 'Costo adicional del proveedor', 'importe', { ayuda: 'Opcional. Déjalo vacío si el cambio no genera costo. Captúralo según la cotización que comunicó el proveedor.' }),
      f('condiciones_proveedor', 'Condiciones del proveedor', 'textarea', { ayuda: 'Opcional. Descríbelas solo si el proveedor comunicó condiciones especiales; Administración las verá antes de autorizar.' })],
    enviar: (v, c) => POST(`/solicitudes-cambio/${encodeURIComponent(c.solicitudId)}/viabilidad`, { viable: v.viable, motivo: v.motivo || '', costo_adicional_proveedor: v.costo_adicional_proveedor || null, condiciones_proveedor: v.condiciones_proveedor || null }),
  },
  decisionClienteCambio: decision('cambio', 'decision-cliente', 'Registrar decisión del Cliente', 'Cliente', '/solicitudes-cambio'),
  autorizacionCambio: decision('cambio', 'autorizacion', 'Registrar autorización de Administración', 'Administración', '/solicitudes-cambio'),
  anexoCambio: anexo('/solicitudes-cambio'),
  solicitudPagoCambio: {
    titulo: 'Comunicar solicitud de pago', textoEnviar: 'Comunicar pago',
    intro: (c) => `Comunica al Cliente el pago del cambio «${c.descripcionSolicitud || 'esta solicitud'}» (costo del proveedor y, si aplica, cargo por cambio tardío).`,
    campos: () => [FECHA('comunicado_en', 'Fecha de la comunicación')],
    enviar: (v, c) => POST(`/solicitudes-cambio/${encodeURIComponent(c.solicitudId)}/solicitud-pago`, { comunicado_en: v.comunicado_en }),
  },
  confirmarCambio: confirmar('/solicitudes-cambio', 'Confirmar cambio'),
  cerrarCambioFaltaPago: cerrarPago('/solicitudes-cambio'),

  // ------------------------------------------------------------ servicio adicional
  nuevoServicioAdicional: {
    titulo: 'Registrar servicio adicional', textoEnviar: 'Registrar solicitud',
    intro: (c) => `Solicita un servicio que no está en el contrato original del evento ${c.eventoId}. Solo se registra con la contratación confirmada; si el evento ya inició, el sistema la registrará como No procedente.`,
    campos: (c) => [
      f('contrato_id', 'Contrato', 'select', { requerido: true, opciones: c.contratos.map((x) => ({ valor: x.contratoId, texto: `Contrato por ${fmtImporte(x.costoTotal)} (${x.estado})` })), valor: c.contratos[0] && c.contratos[0].contratoId }),
      f('servicio', 'Servicio solicitado', 'texto', { requerido: true, ayuda: 'Debe pedirse con al menos cinco días naturales de anticipación; el sistema lo valida.' })],
    enviar: (v, c) => POST('/solicitudes-servicio-adicional', { evento_id: c.eventoId, contrato_id: v.contrato_id, servicio: v.servicio }),
  },
  disponibilidadAdicional: {
    titulo: 'Registrar proveedor, costo y condiciones', textoEnviar: 'Registrar',
    intro: (c) => `Registra lo que el proveedor te comunicó para el servicio adicional «${c.servicio || c.solicitudId}»: si hay un proveedor disponible y, en ese caso, su costo y sus condiciones. Eventos Nova no cobra por gestionarlo: el único importe es el costo del proveedor.`,
    preparar: async (c) => ({ ...c, candidatos: await proveedoresDelServicio(c.servicio) }),
    campos: (c) => [
      f('disponible', 'Un proveedor puede prestar el servicio', 'bool', { valor: true, ayuda: 'Desmárcalo si ningún proveedor puede: la búsqueda continúa.' }),
      f('proveedor_id', 'Proveedor del catálogo', 'select', { requerido: true, opciones: c.candidatos, visibleSi: (v) => v.disponible,
        ayuda: c.candidatos.length ? 'Solo aparecen proveedores activos que ofrecen este servicio.' : 'No hay proveedores activos que ofrezcan este servicio: regístralo primero en Proveedores.' }),
      f('costo', 'Costo del proveedor', 'importe', { requerido: true, positivo: true, visibleSi: (v) => v.disponible, ayuda: 'Obligatorio y mayor que cero, según su cotización.' }),
      f('condiciones', 'Condiciones del servicio', 'textarea', { requerido: true, visibleSi: (v) => v.disponible })],
    resumen: (v) => (v.disponible ? `Se registrará al proveedor ${v.proveedor_id} con costo ${fmtImporte(v.costo)}.` : 'Se registrará que ningún proveedor está disponible y la búsqueda continúa.'),
    enviar: (v, c) => POST(`/solicitudes-servicio-adicional/${encodeURIComponent(c.solicitudId)}/disponibilidad`,
      v.disponible ? { disponible: true, proveedor_id: v.proveedor_id, costo: v.costo, condiciones: v.condiciones } : { disponible: false }),
  },
  esperaAdicional: {
    titulo: 'Decisión de espera del Cliente', textoEnviar: 'Registrar decisión',
    intro: (c) => `Registra si el Cliente acepta esperar la búsqueda de proveedor para «${c.descripcionSolicitud || 'esta solicitud'}». La espera no amplía el plazo mínimo de cinco días.`,
    campos: () => [f('acepta_esperar', 'El Cliente acepta esperar', 'bool', { valor: true })],
    enviar: (v, c) => POST(`/solicitudes-servicio-adicional/${encodeURIComponent(c.solicitudId)}/decision-espera`, { acepta_esperar: v.acepta_esperar }),
  },
  aprobacionClienteAdicional: decision('servicio adicional', 'aprobacion-cliente', 'Registrar aprobación del Cliente', 'Cliente', '/solicitudes-servicio-adicional'),
  autorizacionAdicional: decision('servicio adicional', 'autorizacion', 'Registrar autorización de Administración', 'Administración', '/solicitudes-servicio-adicional'),
  anexoAdicional: anexo('/solicitudes-servicio-adicional'),
  solicitudPagoAdicional: {
    titulo: 'Comunicar solicitud de pago', textoEnviar: 'Comunicar pago',
    intro: (c) => `Comunica al Cliente el pago del servicio adicional «${c.descripcionSolicitud || 'esta solicitud'}». Desde la comunicación corren 24 horas naturales para pagar.`,
    campos: (c) => [FECHA('comunicado_en', 'Fecha de la comunicación'),
      f('importe', 'Importe', 'importe', { requerido: true, positivo: true, valor: c.datosProveedor && c.datosProveedor.costo ? c.datosProveedor.costo : '', ayuda: 'Solo el costo del proveedor; Eventos Nova no cobra cargo propio por servicios adicionales.' })],
    resumen: (v) => `Se comunicará al Cliente un pago de ${fmtImporte(v.importe)} por el servicio adicional.`,
    enviar: (v, c) => POST(`/solicitudes-servicio-adicional/${encodeURIComponent(c.solicitudId)}/solicitud-pago`, { comunicado_en: v.comunicado_en, concepto: 'ServicioAdicional', importe: v.importe }),
  },
  confirmarAdicional: confirmar('/solicitudes-servicio-adicional', 'Confirmar servicio adicional'),
  cerrarAdicionalFaltaPago: cerrarPago('/solicitudes-servicio-adicional'),

  // ------------------------------------------------------------ sustitución de proveedor
  nuevaSustitucion: {
    titulo: 'Iniciar sustitución de proveedor', textoEnviar: 'Iniciar sustitución',
    intro: (c) => `Registra que el proveedor de un servicio del evento ${c.eventoId} no está disponible e inicia la búsqueda de una alternativa.`,
    campos: (c) => [
      f('contrato_id', 'Contrato', 'select', { requerido: true, opciones: c.contratos.map((x) => ({ valor: x.contratoId, texto: `Contrato por ${fmtImporte(x.costoTotal)} (${x.estado})` })), valor: c.contratos[0] && c.contratos[0].contratoId }),
      f('servicio_contratado_id', 'Servicio contratado', 'select', { requerido: true, opciones: c.servicios.map((s) => ({ valor: s.servicioContratadoId, texto: `${s.servicio} (${s.estado})` })) })],
    enviar: (v, c) => POST('/sustituciones', { evento_id: c.eventoId, contrato_id: v.contrato_id, servicio_contratado_id: v.servicio_contratado_id }),
  },
  alternativaSustitucion: {
    titulo: 'Proponer alternativa de proveedor', textoEnviar: 'Registrar alternativa',
    intro: (c) => `Registra la alternativa encontrada para la sustitución «${c.descripcionSolicitud || 'esta solicitud'}» según lo que el proveedor te comunicó. Quién integra el importe adicional al saldo es una decisión aún pendiente.`,
    preparar: async (c) => {
      const info = await GET(`/eventos/${encodeURIComponent(c.eventoId)}/administracion`);
      const servicio = (info.proveedores || []).find((s) => s.servicioContratadoId === c.servicioAfectado);
      return { ...c, candidatos: servicio ? await proveedoresDelServicio(servicio.servicio, servicio.proveedorId) : [] };
    },
    campos: (c) => [
      f('proveedor_id', 'Proveedor alternativo del catálogo', 'select', { requerido: true, opciones: c.candidatos,
        ayuda: c.candidatos.length ? 'Solo aparecen proveedores activos que ofrecen el servicio, distintos del que no puede prestarlo.' : 'No hay proveedores activos que ofrezcan este servicio: regístralo primero en Proveedores.' }),
      f('condiciones_alternativa', 'Condiciones de la alternativa', 'textarea', { requerido: true }),
      f('costo_adicional', 'Costo adicional', 'importe', { ayuda: 'Opcional. Si no hay costo adicional, la sustitución pasa directamente a formalización.' })],
    enviar: (v, c) => POST(`/sustituciones/${encodeURIComponent(c.solicitudId)}/alternativa`, { proveedor_id: v.proveedor_id, condiciones_alternativa: v.condiciones_alternativa, costo_adicional: v.costo_adicional || null }),
  },
  decisionClienteSustitucion: decision('sustitución de proveedor', 'decision-cliente', 'Registrar decisión del Cliente', 'Cliente', '/sustituciones'),
  autorizacionSustitucion: decision('sustitución de proveedor', 'autorizacion', 'Registrar autorización de Administración', 'Administración', '/sustituciones'),
  anexoSustitucion: anexo('/sustituciones'),
  importeSustitucion: {
    titulo: 'Integrar importe adicional al saldo', textoEnviar: 'Integrar importe',
    intro: (c) => `Integra al saldo general del contrato el importe adicional ya autorizado de la sustitución «${c.descripcionSolicitud || 'esta solicitud'}»${c.datosProveedor && c.datosProveedor.costo ? ` (autorizado: ${fmtImporte(c.datosProveedor.costo)})` : ''}. Solo se acepta ese importe y se integra una sola vez; el servidor rechaza cualquier otro.`,
    campos: (c) => [f('importe', 'Importe adicional autorizado', 'importe', { requerido: true, positivo: true, valor: c.datosProveedor && c.datosProveedor.costo ? c.datosProveedor.costo : '' })],
    resumen: (v) => `Se integrará ${fmtImporte(v.importe)} al saldo general.`,
    enviar: (v, c) => POST(`/sustituciones/${encodeURIComponent(c.solicitudId)}/importe-adicional`, { importe: v.importe }),
  },
  confirmarSustitucion: confirmar('/sustituciones', 'Confirmar sustitución'),
};

function decision(tipo, ruta, titulo, actor, base) {
  return {
    titulo, textoEnviar: 'Registrar decisión',
    intro: (c) => `Registra la decisión sobre ${tipo} «${c.descripcionSolicitud || 'esta solicitud'}».${c.datosProveedor ? ` Registrado por Coordinación: ${resumenProveedor(c.datosProveedor)}.` : ''}`,
    campos: () => campoDecision(actor),
    resumen: (v) => `Se registrará una decisión de ${v.actor}: ${v.aprobada ? 'APROBADA' : 'NO aprobada'}.`,
    enviar: (v, c) => POST(`${base}/${encodeURIComponent(c.solicitudId)}/${ruta}`, cuerpoDecision(v)),
  };
}
function anexo(base) {
  return {
    titulo: 'Registrar anexo del contrato', textoEnviar: 'Registrar anexo',
    intro: (c) => `Documenta la solicitud «${c.descripcionSolicitud || 'esta solicitud'}» mediante un anexo vinculado al contrato original.`,
    campos: () => [f('descripcion', 'Descripción del anexo', 'textarea', { requerido: true, ayuda: 'Describe lo que se agrega al contrato (por ejemplo, el cambio aprobado y sus costos). Solo se registra una vez por solicitud.' })],
    enviar: (v, c) => POST(`${base}/${encodeURIComponent(c.solicitudId)}/anexo`, { descripcion: v.descripcion }),
    mensajeExito: () => 'El anexo quedó registrado y vinculado al contrato original. Puedes consultarlo en «Anexos del contrato».',
  };
}
function confirmar(base, titulo) {
  return {
    titulo, textoEnviar: titulo,
    intro: (c) => `Confirma la solicitud «${c.descripcionSolicitud || 'esta solicitud'}». El sistema comprueba que estén cumplidos los pasos y pagos necesarios y, si falta alguno, lo indicará.`,
    resumen: () => 'Se confirmará la solicitud y se aplicará al evento.',
    enviar: (v, c) => POST(`${base}/${encodeURIComponent(c.solicitudId)}/confirmacion`),
    mensajeExito: () => 'La solicitud quedó confirmada y se aplicó al evento.',
  };
}
function cerrarPago(base) {
  return {
    titulo: 'Cerrar por falta de pago', textoEnviar: 'Cerrar solicitud', peligro: true,
    intro: (c) => `Cierra la solicitud «${c.descripcionSolicitud || 'esta solicitud'}» porque no se pagó dentro del plazo.`,
    resumen: () => 'La solicitud se cerrará por falta de pago.',
    enviar: (v, c) => POST(`${base}/${encodeURIComponent(c.solicitudId)}/cierre-por-falta-de-pago`),
  };
}

/** Acciones disponibles según el estado oficial de la solicitud (el backend sigue siendo quien decide). */
export const ACCIONES_POR_ESTADO = {
  cambio: {
    'Registrada': ['viabilidadCambio'], 'En evaluación': ['viabilidadCambio'],
    'Pendiente de aprobación del Cliente': ['decisionClienteCambio'],
    'Pendiente de autorización': ['autorizacionCambio'],
    'Pendiente de formalización': ['anexoCambio', 'solicitudPagoCambio', 'confirmarCambio'],
    'Pendiente de pago': ['confirmarCambio', 'cerrarCambioFaltaPago'],
  },
  'servicio adicional': {
    'Registrada': ['disponibilidadAdicional'], 'En búsqueda de proveedor': ['disponibilidadAdicional', 'esperaAdicional'],
    'Pendiente de aprobación del Cliente': ['aprobacionClienteAdicional'],
    'Pendiente de autorización': ['autorizacionAdicional'],
    'Autorizada': ['anexoAdicional', 'solicitudPagoAdicional'],
    'Pendiente de pago': ['confirmarAdicional', 'cerrarAdicionalFaltaPago'],
  },
  'sustitución de proveedor': {
    'En búsqueda de alternativa': ['alternativaSustitucion'],
    'Pendiente de aprobación del Cliente': ['decisionClienteSustitucion'],
    'Pendiente de autorización': ['autorizacionSustitucion'],
    'Pendiente de formalización': ['anexoSustitucion', 'importeSustitucion', 'confirmarSustitucion'],
  },
};
export const accionesDeSolicitud = (tipo, estado) => (ACCIONES_POR_ESTADO[tipo] || {})[estado] || [];

/** Proveedores candidatos (registrados, activos y que ofrecen el servicio) para un servicio contratado, con su nombre del catálogo cuando existe. */
export async function candidatosParaAsignar(eventoId, servicioId) {
  const [disp, catalogo] = await Promise.all([consultarDisponibilidad(eventoId, servicioId), GET('/proveedores')]);
  const nombres = Object.fromEntries(catalogo.datos.proveedores.map((p) => [p.proveedorId, p.nombre]));
  return ((disp.datos && disp.datos.disponibles) || []).map((id) => ({ valor: id, texto: nombres[id] || 'Proveedor sin nombre en el catálogo' }));
}

/** Cuentas (solo administrador). La contraseña viaja únicamente en la petición HTTPS/HTTP al servidor y no se guarda en la interfaz. */
ACCIONES.crearCuenta = {
  titulo: 'Crear cuenta', textoEnviar: 'Crear cuenta',
  intro: () => 'Crea una cuenta con el rol indicado. La persona podrá cambiar su contraseña al entrar. Una cuenta nueva solo recibe los permisos de su rol.',
  campos: (c) => [
    f('nombre', 'Nombre de la persona', 'texto', { requerido: true }),
    f('correo', 'Correo (será su usuario)', 'texto', { requerido: true }),
    f('rol', 'Rol', 'select', { requerido: true, opciones: [{ valor: 'coordinador', texto: 'Coordinación' }, { valor: 'administrador', texto: 'Administración' }, { valor: 'proveedor', texto: 'Proveedor' }],
      ayuda: 'Coordinación: eventos, propuestas, contratos y solicitudes. Administración: pagos, devoluciones, autorizaciones y cuentas. Proveedor: solo sus servicios.' }),
    f('proveedor_id', 'Proveedor al que pertenece', 'select', { requerido: true, vacio: 'Selecciona un proveedor', reiniciarAlOcultar: true, visibleSi: (v) => v.rol === 'proveedor', opciones: c.proveedores.map((p) => ({ valor: p.proveedorId, texto: p.nombre })),
      ayuda: 'Solo las cuentas de proveedor se vinculan a un proveedor del catálogo.' }),
    f('contrasena', 'Contraseña inicial', 'contrasena', { requerido: true, minLongitud: 12, ayuda: 'Mínimo 12 caracteres. Compártela por un medio seguro; no se vuelve a mostrar.' })],
  resumen: (v) => `Se creará la cuenta de ${v.nombre} (${v.correo}) con el rol «${v.rol}».`,
  enviar: (v) => POST('/usuarios', { nombre: v.nombre, correo: v.correo, rol: v.rol, contrasena: v.contrasena, ...(v.rol === 'proveedor' ? { proveedor_id: v.proveedor_id } : {}) }),
};
ACCIONES.desactivarCuenta = {
  titulo: 'Desactivar cuenta', textoEnviar: 'Desactivar', peligro: true,
  intro: (c) => `Desactiva la cuenta de ${c.usuario.nombre}. Sus sesiones abiertas se cierran de inmediato y no podrá volver a entrar hasta que se active de nuevo.`,
  resumen: (v, c) => `La cuenta de ${c.usuario.nombre} quedará desactivada.`,
  enviar: (v, c) => POST(`/usuarios/${encodeURIComponent(c.usuario.usuarioId)}/estado`, { activo: false }),
};
ACCIONES.activarCuenta = {
  titulo: 'Activar cuenta', textoEnviar: 'Activar', intro: (c) => `Permite que ${c.usuario.nombre} vuelva a entrar con su contraseña actual.`,
  resumen: (v, c) => `La cuenta de ${c.usuario.nombre} quedará activa.`,
  enviar: (v, c) => POST(`/usuarios/${encodeURIComponent(c.usuario.usuarioId)}/estado`, { activo: true }),
};
ACCIONES.editarCuenta = {
  titulo: 'Editar cuenta', textoEnviar: 'Guardar cambios',
  intro: (c) => `Corrige el nombre y el correo de ${c.usuario.nombre}. El rol no cambia. Si cambias el correo, sus sesiones abiertas se cierran y entrará con el correo nuevo.`,
  campos: (c) => [f('nombre', 'Nombre de la persona', 'texto', { requerido: true, valor: c.usuario.nombre }), f('correo', 'Correo (su usuario)', 'texto', { requerido: true, valor: c.usuario.correo })],
  resumen: (v, c) => `La cuenta de ${c.usuario.nombre} quedará como ${v.nombre} (${v.correo}).`,
  enviar: (v, c) => POST(`/usuarios/${encodeURIComponent(c.usuario.usuarioId)}/actualizacion`, { nombre: v.nombre, correo: v.correo }),
};
ACCIONES.restablecerContrasena = {
  titulo: 'Restablecer contraseña', textoEnviar: 'Restablecer', peligro: true,
  intro: (c) => `Define una contraseña nueva para ${c.usuario.nombre}. Sus sesiones abiertas se cierran.`,
  campos: () => [f('contrasena', 'Contraseña nueva', 'contrasena', { requerido: true, minLongitud: 12, ayuda: 'Mínimo 12 caracteres.' })],
  resumen: (v, c) => `Se restablecerá la contraseña de ${c.usuario.nombre} y se cerrarán sus sesiones.`,
  enviar: (v, c) => POST(`/usuarios/${encodeURIComponent(c.usuario.usuarioId)}/contrasena`, { contrasena: v.contrasena }),
};
ACCIONES.cambiarContrasena = {
  titulo: 'Cambiar mi contraseña', textoEnviar: 'Cambiar contraseña',
  intro: () => 'Al cambiarla se cierran todas tus sesiones y tendrás que iniciar sesión de nuevo.',
  campos: () => [f('actual', 'Contraseña actual', 'contrasena', { requerido: true }), f('nueva', 'Contraseña nueva', 'contrasena', { requerido: true, minLongitud: 12, ayuda: 'Mínimo 12 caracteres.' })],
  enviar: (v) => POST('/auth/cambio-contrasena', { actual: v.actual, nueva: v.nueva }),
};

// Permiso del servidor que autoriza cada acción. Sirve solo para mostrar u ocultar botones: el servidor decide en cada petición.
const PERMISO_DE_ACCION = {
  registrarEvento: 'eventos.registrar', crearPropuesta: 'propuestas.gestionar', nuevaVersion: 'propuestas.gestionar', aceptarPropuesta: 'propuestas.gestionar',
  cerrarPropuesta: 'propuestas.gestionar', prepararContrato: 'contratos.gestionar', comunicarPolitica: 'contratos.gestionar', firmarContrato: 'contratos.gestionar',
  seguimientoAnticipo: 'contratos.gestionar', confirmarContratacion: 'contratos.gestionar', registrarPago: 'pagos.registrar', verificarPago: 'pagos.registrar',
  vencimientoSaldo: 'pagos.cobranza', protocoloCobro: 'pagos.cobranza', regularizacion: 'pagos.cobranza', ejecutarDevolucion: 'devoluciones.ejecutar',
  iniciarEvento: 'eventos.ciclo', finalizarEvento: 'eventos.ciclo', cancelarEvento: 'eventos.cancelar', cancelarPorRegularizacion: 'eventos.cancelar',
  revisionAdministrativa: 'eventos.revision_administrativa', registrarProveedor: 'proveedores.registrar', asignarProveedor: 'proveedores.asignar',
  respuestaProveedor: 'proveedores.responder', aceptarServicio: 'proveedores.responder', rechazarServicio: 'proveedores.responder', reportarIndisponibilidad: 'proveedores.reportar', nuevoCambio: 'solicitudes.registrar', nuevoServicioAdicional: 'solicitudes.registrar', nuevaSustitucion: 'solicitudes.registrar',
  autorizacionCambio: 'solicitudes.autorizar', autorizacionAdicional: 'solicitudes.autorizar', autorizacionSustitucion: 'solicitudes.autorizar',
  importeSustitucion: 'solicitudes.importe_adicional', crearCuenta: 'usuarios.administrar', desactivarCuenta: 'usuarios.administrar',
  activarCuenta: 'usuarios.administrar', restablecerContrasena: 'usuarios.administrar', editarCuenta: 'usuarios.administrar',
  editarProveedor: 'proveedores.editar', desactivarProveedor: 'proveedores.editar', activarProveedor: 'proveedores.editar',
  cambiarContrasena: 'sesion',
};
for (const [clave, accion] of Object.entries(ACCIONES)) {
  if (clave === 'cambiarContrasena') continue;                       // cualquier persona con sesión
  accion.permiso = PERMISO_DE_ACCION[clave] || 'solicitudes.gestionar';   // el resto son gestiones de solicitudes (viabilidad, decisiones, anexos, confirmaciones, cierres…)
}

export const consultarDisponibilidad = (eventoId, servicioId) => GET(`/eventos/${encodeURIComponent(eventoId)}/servicios/${encodeURIComponent(servicioId)}/disponibilidad`);
