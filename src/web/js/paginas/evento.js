/* Detalle de un evento: contratación, pagos, solicitudes, proveedores y ciclo de vida. Todo sale de la API; los botones se
   habilitan según el estado oficial devuelto, y el backend sigue siendo quien acepta o rechaza cada operación. */
import { GET } from '../api.js';
import { ACCIONES, accionesDeSolicitud, candidatosParaAsignar, consultarDisponibilidad, resumenProveedor, separarServicios } from '../acciones.js';
import { AYUDA_ESTADO, AYUDA_PAGO, etiquetaConcepto, etiquetaTipoDevolucion, etiquetaTipoSolicitud, fmtFechaHora, fmtImporte } from '../negocio.js';
import { registro } from '../registro.js';
import { nombreEvento } from '../nombres-eventos.js';
import { puede } from '../sesion.js';
import { calcularFlujo, contratoVigente, siguientePaso } from '../flujo.js';
import { aviso, botonAccion, cajaError, cargando, celdaProveedor, copiable, datos, dialogoInfo, ejecutarAccion, h, insignia, tabla, tarjeta, textoRespuesta, vacio } from '../ui.js';

const irA = (clave) => { const el = document.getElementById(clave); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

/** Panel «Qué sigue»: paso actual con su botón, requisitos que faltan y progreso de los 13 pasos del evento. El backend sigue validando cada operación. */
function panelFlujo(datosFlujo, construirCtx, refrescar) {
  const f = calcularFlujo(datosFlujo); const sig = siguientePaso(datosFlujo);
  const hechos = f.pasos.filter((p) => p.estado === 'hecho').length;
  const botones = (sig.acciones || []).map((n) => botonAccion(ACCIONES[n], construirCtx(n, sig), refrescar, { clase: 'btn btn-primario' })).filter(Boolean);
  const secundarias = (sig.secundarias || []).map((n) => botonAccion(ACCIONES[n], construirCtx(n, sig), refrescar, { clase: n === 'cerrarPropuesta' ? 'btn btn-peligro-suave' : 'btn' })).filter(Boolean);
  const sinPermiso = (sig.acciones || []).length && !botones.length;
  return tarjeta('Qué sigue en este evento', h('div', null,
    h('div', { class: 'sig-paso' },
      h('p', { class: 'peq' }, f.terminal ? 'Estado del evento' : 'Siguiente paso'),
      h('h3', null, sig.titulo), h('p', null, sig.texto),
      ...(sig.requisitos || []).map((r) => h('p', { class: 'sig-req', role: 'note' }, r)),
      sinPermiso ? h('p', { class: 'peq' }, (sig.acciones || []).includes('registrarPago') ? 'Los pagos los registra y verifica Administración. Aquí puedes seguir el avance.' : 'Este paso lo realiza otro rol. Tu cuenta puede consultarlo, pero no registrarlo.') : null,
      botones.length || secundarias.length || sig.ancla ? h('div', { class: 'acciones' }, ...botones, ...secundarias,
        sig.ancla ? h('button', { type: 'button', class: 'btn', onclick: () => irA(sig.ancla) }, sig.anclaTexto || 'Ir a servicios y proveedores') : null) : null),
    h('div', { class: 'peq' }, `Progreso: ${hechos} de ${f.pasos.length} pasos completados`),
    h('progress', { class: 'barra-progreso', max: f.pasos.length, value: hechos, 'aria-label': 'Progreso del evento' }),
    h('ol', { class: 'pasos-flujo', 'aria-label': 'Pasos del evento' }, f.pasos.map((p, i) =>
      h('li', { class: p.estado, 'aria-current': p.estado === 'actual' ? 'step' : null },
        h('span', { class: 'paso-n' }, p.estado === 'hecho' ? '✓' : String(i + 1)),
        h('span', null, p.titulo, h('span', { class: 'sit' }, { hecho: 'Completado', actual: 'Paso actual', pendiente: 'Pendiente', omitido: 'No aplica' }[p.estado])))))));
}

function pagosVista(ec, pendientes, ctxBase, refrescar, evento) {
  const ctx = { ...ctxBase, estadoCuentaId: ec.estadoCuentaId, contratoId: ec.contratoId };
  const mios = pendientes.filter((p) => p.estadoCuentaId === ec.estadoCuentaId);
  const ob = (titulo, o, pend) => {
    const vacia = !o || !o.estado;
    const sinVerificar = o && o.registradoSinVerificar && Number(o.registradoSinVerificar) > 0 ? o.registradoSinVerificar : null;
    return h('div', { class: 'obligacion' }, h('h4', null, titulo),
      vacia ? h('p', { class: 'peq' }, 'Todavía no existe esta obligación.') : [
        h('div', { class: 'fila-estado' }, insignia(o.estado), o.plazoVencido === true ? h('span', { class: 'etiqueta-alerta' }, 'Plazo vencido') : null),
        datos(...[['Importe', fmtImporte(o.importe)], ['Pagado (verificado)', fmtImporte(o.pagado ?? (pend ? pend.pagado : null))], ['Saldo', fmtImporte(o.saldo ?? (pend ? pend.saldo : null))],
          sinVerificar ? ['Registrado sin verificar', fmtImporte(sinVerificar)] : null,
          ['Fecha límite', fmtFechaHora(o.fechaLimite)], o.resultadoRegularizacion ? ['Regularización', o.resultadoRegularizacion] : null].filter(Boolean)),
        o.plazoVencido === true ? h('p', { class: 'caja-aviso' }, 'El plazo de pago aparece vencido. Revisa la fecha límite y el estado actual de la cuenta.') : null]);
  };
  const anticipoPend = mios.find((p) => p.concepto === 'Anticipo');
  const saldoPend = mios.find((p) => p.concepto === 'SaldoContratoOriginal');
  const acciones = [];
  if (mios.length) acciones.push(botonAccion(ACCIONES.registrarPago, { ...ctx, obligaciones: mios }, refrescar, { clase: 'btn btn-primario' }));
  const saldo = ec.saldoContratoOriginal;
  if (saldo.estado === 'Pendiente' && saldo.plazoVencido) acciones.push(botonAccion(ACCIONES.vencimientoSaldo, ctx, refrescar));
  if (saldo.estado === 'Vencida') acciones.push(botonAccion(ACCIONES.protocoloCobro, ctx, refrescar), botonAccion(ACCIONES.regularizacion, ctx, refrescar));

  return tarjeta('Estado de cuenta del contrato', h('div', null,
    h('div', { class: 'rejilla-2' }, ob('Anticipo (mínimo 30 %)', ec.anticipo, anticipoPend), ob('Saldo del contrato original', ec.saldoContratoOriginal, saldoPend)),
    h('p', { class: 'peq' }, 'El anticipo es un mínimo del 30 %: puede cubrirse con varios pagos parciales que se acumulan (criterio adoptado por el equipo, aún sin aprobación formal).'),
    h('h4', null, 'Pagos registrados'),
    ec.pagosRegistrados.some((p) => p.estado === 'Registrado')
      ? h('p', { class: 'caja-aviso' }, `Hay ${ec.pagosRegistrados.filter((p) => p.estado === 'Registrado').length} pago(s) registrado(s) pendiente(s) de verificación. Mientras no se verifiquen, no se suman a lo pagado ni reducen el saldo.`) : null,
    tabla([
      { titulo: 'Concepto', celda: (p) => etiquetaConcepto(p.concepto) }, { titulo: 'Importe', clase: 'num', celda: (p) => fmtImporte(p.importe) },
      { titulo: 'Fecha del pago', celda: (p) => fmtFechaHora(p.fecha) },
      { titulo: 'Estado', celda: (p) => h('div', null, insignia(p.estado), AYUDA_PAGO[p.estado] ? h('div', { class: 'peq' }, AYUDA_PAGO[p.estado]) : null) },
      { titulo: 'Verificado', celda: (p) => (p.verificadoEn ? fmtFechaHora(p.verificadoEn) : 'Pendiente de verificación') },
      { titulo: 'Acción', celda: (p) => (p.estado === 'Registrado' && p.pagoId
        ? (botonAccion(ACCIONES.verificarPago, { ...ctx, pago: p }, refrescar, { clase: 'btn btn-peq btn-primario', texto: 'Verificar pago' }) || h('span', { class: 'peq' }, 'Lo verifica Administración'))
        : h('span', { class: 'etiqueta-ok' }, 'Completado')) },
    ], ec.pagosRegistrados, { vacioTitulo: 'Aún no hay pagos registrados', vacioDetalle: 'Cuando se registre un pago aparecerá aquí con su estado.' }),
    ec.obligacionesAdicionales.length ? [h('h4', null, 'Otras obligaciones'), tabla([
      { titulo: 'Concepto', celda: (o) => etiquetaConcepto(o.concepto) }, { titulo: 'Importe', clase: 'num', celda: (o) => fmtImporte(o.importe) },
      { titulo: 'Pagado (verificado)', clase: 'num', celda: (o) => fmtImporte(o.pagado) }, { titulo: 'Saldo', clase: 'num', celda: (o) => fmtImporte(o.saldo) },
      { titulo: 'Plazo', celda: (o) => fmtFechaHora(o.plazo) }, { titulo: 'Estado', celda: (o) => insignia(o.estado) }], ec.obligacionesAdicionales)] : null,
    ec.devoluciones.length ? [h('h4', null, 'Devoluciones'), tabla([
      { titulo: 'Tipo', celda: (d) => etiquetaTipoDevolucion(d.tipo) }, { titulo: 'Concepto', celda: (d) => etiquetaConcepto(d.concepto) }, { titulo: 'Importe', clase: 'num', celda: (d) => fmtImporte(d.importe) },
      { titulo: 'Fecha límite', celda: (d) => fmtFechaHora(d.fechaLimite) }, { titulo: 'Estado', celda: (d) => insignia(d.estado) },
      { titulo: 'Acción', celda: (d) => (d.estado === 'Pendiente' ? botonAccion(ACCIONES.ejecutarDevolucion, { ...ctx, devolucionId: d.devolucionId, importe: d.importe, concepto: d.concepto }, refrescar, { clase: 'btn btn-peq' }) : (d.fechaDevolucion ? fmtFechaHora(d.fechaDevolucion) : '—')) },
    ], ec.devoluciones)] : null,
    null),
  { acciones });
}

export async function evento(contenedor, [eventoId]) {
  const id = decodeURIComponent(eventoId || '');
  const refrescar = () => evento(contenedor, [eventoId]);
  contenedor.replaceChildren(cargando('Consultando el evento…'));
  let admin; let pagos; let pendientes; let solicitudes; let accionesPend; let propuestasServidor;
  try {
    admin = await GET(`/eventos/${encodeURIComponent(id)}/administracion`);
    [pagos, pendientes, solicitudes, accionesPend, propuestasServidor] = await Promise.all([
      GET(`/eventos/${encodeURIComponent(id)}/pagos`), GET('/pagos-pendientes', { evento_id: id }), GET('/solicitudes', { evento_id: id }),
      GET(`/eventos/${encodeURIComponent(id)}/solicitudes-pendientes`), GET(`/eventos/${encodeURIComponent(id)}/propuestas`)]);
  } catch (e) { contenedor.replaceChildren(cajaError(e, refrescar), h('a', { href: '#/eventos', class: 'btn' }, 'Volver a eventos')); return; }

  registro.recordarEvento(id, `${admin.tipoEvento} · ${id}`);
  const estado = admin.estadoEvento;
  const confirmados = admin.contratos.filter((c) => c.estado === 'Contratación confirmada');
  const base = { eventoId: id, servicios: separarServicios(admin.proveedores.length ? admin.proveedores.map((s) => s.servicio) : (admin.serviciosSolicitados || [])), contratos: confirmados, evento: admin };   // antes de contratar, los servicios solicitados
  const ecs = pagos.estadosCuenta;

  // ----- encabezado
  const cabecera = h('header', { class: 'pagina-cab' },
    h('a', { href: '#/eventos', class: 'migas' }, '← Eventos'),
    h('h1', null, admin.tipoEvento, ' ', insignia(estado)),
    h('p', null, `${fmtFechaHora(admin.fechaHora)} · ${admin.lugar} · ${admin.invitadosAproximados} invitados aproximados`),
    AYUDA_ESTADO[estado] ? h('p', { class: 'peq' }, AYUDA_ESTADO[estado]) : null,
    admin.cliente ? h('p', { class: 'peq' }, `Cliente: ${admin.cliente.nombreCompleto}`) : null);

  const c = admin.cliente;
  const bloqueCliente = tarjeta('Cliente', c
    ? datos(['Nombre', c.nombreCompleto], ['Teléfono', c.telefono], ['Correo', c.correo])
    : datos(['Datos de contacto', 'Evento anterior al catálogo de clientes: no hay ficha de contacto registrada.']));

  const resumen = tarjeta('Resumen económico', datos(
    ['Pagos realizados (verificados)', fmtImporte(admin.pagosRealizados)], ['Saldo pendiente del contrato original', fmtImporte(admin.saldoPendienteContratoOriginal)],
    ['Contratos', admin.contratos.length]));

  // ----- propuestas (S-9: salen del servidor; Administración las consulta y Coordinación las gestiona)
  const propuestas = propuestasServidor.propuestas;
  const bloquePropuestas = tarjeta('Propuestas', h('div', null,
    propuestas.length ? tabla([
      { titulo: 'Propuesta', celda: (p) => h('strong', { title: p.propuestaId }, `Propuesta ${propuestas.indexOf(p) + 1}`) }, { titulo: 'Estado', celda: (p) => insignia(p.estado) },
      { titulo: 'Versión vigente', celda: (p) => `v${p.numeroVersion}` }, { titulo: 'Costo total', clase: 'num', celda: (p) => fmtImporte(p.costoTotal) },
      { titulo: 'Servicios y proveedores', celda: (p) => (p.desglose && p.desglose.length
        ? h('div', null, p.desglose.map((d) => h('div', { class: 'peq' }, `${d.servicio}: ${d.proveedor} — ${fmtImporte(d.importe)}`)))
        : separarServicios(p.servicios).join(', ')) },
      { titulo: 'Acciones', celda: (p) => {
        const abierta = p.estado === 'En revisión del Cliente' || p.estado === 'En elaboración';
        const botones = abierta ? [
          botonAccion(ACCIONES.aceptarPropuesta, { propuestaId: p.propuestaId, versionId: p.versionVigenteId }, refrescar, { clase: 'btn btn-peq' }),
          botonAccion(ACCIONES.nuevaVersion, { propuestaId: p.propuestaId, propuesta: p, servicios: base.servicios }, refrescar, { clase: 'btn btn-peq' }),
          botonAccion(ACCIONES.cerrarPropuesta, { propuestaId: p.propuestaId }, refrescar, { clase: 'btn btn-peq btn-peligro-suave' })]
          : (p.estado === 'Aceptada'
            ? (admin.contratos.some((c) => c.propuestaId === p.propuestaId)
              ? [h('button', { type: 'button', class: 'btn btn-peq', onclick: () => irA('contratacion') }, 'Ver contrato')]       // ya existe: no se vuelve a preparar
              : [botonAccion(ACCIONES.prepararContrato, { propuestaId: p.propuestaId }, refrescar, { clase: 'btn btn-peq btn-primario' })])
            : []);
        if (p.versiones && p.versiones.length > 1) botones.push(h('button', { type: 'button', class: 'btn btn-peq', onclick: () => verVersiones(p, propuestas.indexOf(p) + 1) }, `Ver versiones (${p.versiones.length})`));
        const visibles = botones.filter(Boolean);
        if (visibles.length) return h('div', { class: 'acciones' }, visibles);
        if (p.estado === 'Aceptada') return h('span', { class: 'etiqueta-ok' }, 'Aceptada');
        return h('span', { class: 'peq' }, p.motivoCierre ? `Cerrada por no aceptación: ${p.motivoCierre}` : 'Cerrada por no aceptación (se conserva su historial)'); } },
    ], propuestas) : vacio('Sin propuestas', 'Todavía no hay propuestas para este evento.'),
    propuestas.some((p) => p.estado === 'Aceptada') ? h('p', { class: 'caja-aviso' },
      'Una propuesta aceptada ya no admite nuevas versiones: lo aceptado y firmado no se modifica retroactivamente. Si el Cliente pide agregar o quitar servicios, cambiar un proveedor o ajustar importes, usa «Solicitar cambio», «Sustituir proveedor» o «Solicitar servicio adicional» en «Solicitudes del evento»: cada uno se documenta con un anexo al contrato.')
      : (propuestas.length ? h('p', { class: 'peq' }, 'Mientras la propuesta no se acepte puedes generar nuevas versiones: la anterior se conserva y la nueva pasa a ser la vigente.') : null)),
  { acciones: estado === 'En gestión' ? botonAccion(ACCIONES.crearPropuesta, base, refrescar, { clase: 'btn btn-primario' }) : null });

  // ----- contratos
  const accionesContrato = (c) => {
    const ctx = { ...base, contratoId: c.contratoId }; const ec = ecs.find((x) => x.contratoId === c.contratoId);
    const out = [];
    if (c.estado === 'En preparación') {
      if (!c.politicaComunicada) out.push(botonAccion(ACCIONES.comunicarPolitica, ctx, refrescar, { clase: 'btn btn-peq btn-primario' }), h('span', { class: 'peq' }, 'Para registrar la firma primero comunica la política de no reembolso.'));
      else out.push(botonAccion(ACCIONES.firmarContrato, ctx, refrescar, { clase: 'btn btn-peq btn-primario' }));       // la política ya está comunicada: no se vuelve a ofrecer
    }
    if (c.estado === 'Firmado') {
      if (!ec || ec.anticipo.estado !== 'Liquidada') out.push(botonAccion(ACCIONES.seguimientoAnticipo, ctx, refrescar, { clase: 'btn btn-peq' }));
      if (ec && ec.anticipo.estado === 'Liquidada') out.push(botonAccion(ACCIONES.confirmarContratacion, ctx, refrescar, { clase: 'btn btn-peq btn-primario' }));
    }
    return out.length ? h('div', { class: 'acciones' }, out) : h('span', { class: 'peq' }, 'Sin acciones disponibles');
  };
  const bloqueContratos = tarjeta('Contratación', h('div', null,
    h('p', { class: 'peq' }, 'Antes de firmar debe comunicarse al Cliente la política de no reembolso. La confirmación exige contrato firmado, política comunicada y anticipo verificado; el sistema lo comprueba.'),
    tabla([
      { titulo: 'Contrato', celda: (c) => h('strong', { title: c.contratoId }, 'Contrato del evento') }, { titulo: 'Costo total', clase: 'num', celda: (c) => fmtImporte(c.costoTotal) },
      { titulo: 'Estado', celda: (c) => insignia(c.estado) },
      { titulo: 'Política de no reembolso', celda: (c) => (c.politicaComunicada ? h('div', null, h('span', { class: 'etiqueta-ok' }, 'Política comunicada'), h('div', { class: 'peq' }, fmtFechaHora(c.politicaComunicadaEn))) : h('span', { class: 'etiqueta-pend' }, 'Pendiente de comunicar')) },
      { titulo: 'Firma', celda: (c) => (c.firmadoEn ? h('div', null, h('span', { class: 'etiqueta-ok' }, 'Firmado'), h('div', { class: 'peq' }, fmtFechaHora(c.firmadoEn))) : h('span', { class: 'etiqueta-pend' }, 'Pendiente')) },
      { titulo: 'Acciones', celda: accionesContrato },
    ], admin.contratos, { vacioTitulo: 'Todavía no hay contrato', vacioDetalle: 'Acepta una propuesta y prepara el contrato desde la sección de propuestas.' })));

  // ----- pagos
  const bloquesPagos = ecs.length ? ecs.map((ec) => pagosVista(ec, pendientes.pagos, base, refrescar, admin))
    : [tarjeta('Pagos', vacio('Todavía no hay estado de cuenta', 'Se crea al firmarse el contrato.'))];

  // ----- solicitudes
  const puedeCambio = estado === 'En organización' && confirmados.length;
  const puedeAdicional = ['En organización', 'En ejecución'].includes(estado) && confirmados.length;
  const nuevas = [];
  if (puedeCambio) nuevas.push(botonAccion(ACCIONES.nuevoCambio, base, refrescar, { texto: 'Solicitar cambio' }), botonAccion(ACCIONES.nuevaSustitucion, { ...base, servicios: admin.proveedores }, refrescar, { texto: 'Sustituir proveedor' }));
  if (puedeAdicional) nuevas.push(botonAccion(ACCIONES.nuevoServicioAdicional, base, refrescar, { texto: 'Solicitar servicio adicional' }));
  const bloqueSolicitudes = tarjeta('Solicitudes del evento', h('div', null,
    !confirmados.length ? h('p', { class: 'peq' }, 'Los cambios, servicios adicionales y sustituciones solo se registran con la contratación confirmada.') : null,
    estado === 'En ejecución' ? h('p', { class: 'peq' }, 'El evento ya inició: ya no se aceptan cambios. Un servicio adicional presentado ahora se registra como «No procedente», porque ya no hay tiempo de atenderlo.') : null,
    solicitudes.solicitudes.length
      ? h('div', null, ...[...solicitudes.solicitudes].sort((a, b) => Number(b.pendiente) - Number(a.pendiente)).map((s) => panelSolicitud(s, refrescar)))
      : vacio('No hay solicitudes', 'Las solicitudes de cambio, servicio adicional y sustitución aparecerán aquí, cada una con sus pasos y su siguiente acción.')), { acciones: nuevas });

  // ----- anexos del contrato (siempre visibles, sin conocer identificadores)
  const anexos = admin.contratos.flatMap((c) => c.anexos || []);
  const bloqueAnexos = tarjeta('Anexos del contrato', anexos.length ? tabla([
    { titulo: 'Anexo', celda: (a) => h('strong', null, `Anexo ${anexos.indexOf(a) + 1}`) },
    { titulo: 'Solicitud', celda: (a) => etiquetaTipoSolicitud(a.tipoSolicitud) },
    { titulo: 'Descripción', celda: (a) => a.descripcion },
    { titulo: 'Fecha de registro', celda: (a) => fmtFechaHora(a.fecha) },
    { titulo: 'Estado de formalización', celda: (a) => (a.estadoSolicitud ? insignia(a.estadoSolicitud) : '—') },
    { titulo: 'Importe adicional', clase: 'num', celda: (a) => (a.importeAdicional === null || a.importeAdicional === undefined ? '—' : (Number(a.importeAdicional) > 0 ? fmtImporte(a.importeAdicional) : 'Sin importe adicional')) },
    { titulo: 'Acción', celda: (a) => h('button', { type: 'button', class: 'btn btn-peq', onclick: () => verAnexo(a, anexos.indexOf(a) + 1) }, 'Consultar anexo') },
  ], anexos) : vacio('Todavía no hay anexos', 'Cuando se registre el anexo de un cambio, una sustitución o un servicio adicional aparecerá aquí, relacionado con su solicitud y con el contrato.'));

  // ----- servicios y proveedores
  // Los servicios contratados nacen al confirmarse la contratación; antes solo existen los servicios pedidos al registrar el evento.
  const solicitados = admin.serviciosSolicitados || [];
  const gestionable = estado === 'En organización';
  const motivoSinAccion = (s) => {
    if (s.estado === 'Sin proveedor asignado') return `El proveedor se asigna solo con el evento En organización; este evento está ${estado}.`;
    if (s.estado === 'Pendiente de confirmación del proveedor') return `La respuesta del proveedor se registra solo con el evento En organización; este evento está ${estado}.`;
    if (s.estado === 'Proveedor no disponible') return 'Para cambiar de proveedor registra una sustitución (botón «Sustituir proveedor» de Solicitudes del evento).';
    return 'Sin acciones pendientes.';
  };
  const accionesServicio = (s) => {
    const ctx = { ...base, servicioId: s.servicioContratadoId, servicio: s.servicio, proveedorId: s.proveedorId, proveedorNombre: s.proveedorNombre };
    const botones = puede('proveedores.asignar') ? [h('button', { type: 'button', class: 'btn btn-peq', onclick: () => verDisponibilidad(id, s) }, 'Ver candidatos')] : [];
    if (gestionable && s.estado === 'Sin proveedor asignado' && puede('proveedores.asignar')) botones.push(h('button', { type: 'button', class: 'btn btn-peq btn-primario', onclick: () => asignarConCandidatos(ctx, refrescar) }, 'Asignar proveedor'));
    else if (gestionable && s.estado === 'Pendiente de confirmación del proveedor') botones.push(botonAccion(ACCIONES.respuestaProveedor, ctx, refrescar, { clase: 'btn btn-peq btn-primario' }));
    else botones.push(h('span', { class: 'peq' }, motivoSinAccion(s)));
    return h('div', { class: 'acciones' }, botones);
  };
  let contenidoServicios;
  if (admin.proveedores.length) {
    contenidoServicios = tabla([
      { titulo: 'Servicio', celda: (s) => s.servicio }, { titulo: 'Proveedor', celda: celdaProveedor },
      { titulo: 'Estado', celda: (s) => h('div', null, insignia(s.estado), s.respuesta ? h('div', { class: 'peq' }, textoRespuesta(s.respuesta)) : null) },
      { titulo: 'Acciones', celda: accionesServicio },
    ], admin.proveedores, {});
  } else if (solicitados.length) {
    contenidoServicios = h('div', null,
      h('p', { class: 'peq' }, ['Cerrado sin contratación', 'Cancelado'].includes(estado)
        ? `Estos son los servicios que se pidieron al registrar el evento. El evento está ${estado} y no llegó a contratarse, por lo que no se asignan proveedores.`
        : 'Estos son los servicios que se pidieron al registrar el evento. Todavía no están contratados: los proveedores se asignan cuando la contratación se confirma y el evento pasa a En organización.'),
      tabla([{ titulo: 'Servicio solicitado', celda: (x) => x }, { titulo: 'Situación', celda: () => h('span', { class: 'peq' }, 'Pendiente de contratación') }], solicitados, {}));
  } else {
    contenidoServicios = vacio('Sin servicios registrados', 'Este evento no tiene servicios solicitados ni contratados.');
  }
  const bloqueProveedores = tarjeta('Servicios y proveedores', contenidoServicios,
    { acciones: [h('a', { class: 'btn btn-peq', href: '#/proveedores' }, 'Ver catálogo de proveedores')] });

  // ----- ciclo de vida
  const ciclo = [];
  if (estado === 'En organización') ciclo.push(botonAccion(ACCIONES.iniciarEvento, base, refrescar), botonAccion(ACCIONES.cancelarEvento, base, refrescar, { clase: 'btn btn-peligro-suave' }));
  if (estado === 'En ejecución') ciclo.push(botonAccion(ACCIONES.finalizarEvento, base, refrescar, { clase: 'btn btn-primario' }));
  if (estado === 'Cancelado') ciclo.push(botonAccion(ACCIONES.revisionAdministrativa, base, refrescar));
  if (ecs.some((e) => e.saldoContratoOriginal.estado === 'Vencida') && !['Cancelado', 'Finalizado', 'Cerrado sin contratación'].includes(estado)) {
    ciclo.push(botonAccion(ACCIONES.cancelarPorRegularizacion, base, refrescar, { clase: 'btn btn-peligro-suave' }));
  }
  const bloqueCiclo = tarjeta('Ciclo de vida del evento', h('div', null,
    h('p', null, 'Estado actual: ', insignia(estado), ' ', AYUDA_ESTADO[estado] || ''),
    h('p', { class: 'peq' }, 'El inicio y el cierre por fecha los aplica automáticamente el trabajador del sistema; esta pantalla muestra el estado que informa el servidor. «Registrar inicio del evento (respaldo)» es solo un mecanismo excepcional para cuando el proceso automático no actualizó el estado; el servidor lo rechaza si la fecha y hora programadas todavía no llegaron.'),
    ciclo.length ? h('div', { class: 'acciones' }, ciclo) : h('p', { class: 'peq' }, 'No hay operaciones disponibles en este estado.')));

  bloqueContratos.id = 'contratacion'; bloqueProveedores.id = 'servicios'; bloqueSolicitudes.id = 'solicitudes';
  const ctxFlujo = (n, sig) => {
    const c = contratoVigente(admin.contratos); const ec = ecs.find((x) => c && x.contratoId === c.contratoId) || ecs[0];
    if (['aceptarPropuesta', 'nuevaVersion', 'cerrarPropuesta'].includes(n)) { const p = sig.propuesta || propuestas[0]; return { propuestaId: p.propuestaId, versionId: p.versionVigenteId, servicios: base.servicios }; }
    if (n === 'prepararContrato') return { propuestaId: (sig.propuesta || propuestas.find((x) => x.estado === 'Aceptada') || {}).propuestaId };
    if (['comunicarPolitica', 'firmarContrato', 'seguimientoAnticipo', 'confirmarContratacion'].includes(n)) return { ...base, contratoId: c.contratoId };
    if (n === 'registrarPago') return { ...base, estadoCuentaId: ec.estadoCuentaId, contratoId: ec.contratoId, obligaciones: pendientes.pagos.filter((p) => p.estadoCuentaId === ec.estadoCuentaId) };
    return base;
  };
  const bloqueFlujo = panelFlujo({ estado, propuestas, contratos: admin.contratos, ecs, servicios: admin.proveedores, fmt: fmtFechaHora,
    sustitucionesAbiertas: solicitudes.solicitudes.filter((s) => s.tipoSolicitud === 'sustitución de proveedor' && s.pendiente).length,
    sustitucionSiguiente: ((solicitudes.solicitudes.find((s) => s.tipoSolicitud === 'sustitución de proveedor' && s.pendiente) || {}).proceso || {}).siguiente?.titulo || '' }, ctxFlujo, refrescar);
  contenedor.replaceChildren(cabecera, bloqueFlujo, h('div', { class: 'rejilla-detalle' }, resumen, bloqueCiclo), bloqueCliente, bloquePropuestas, bloqueContratos, ...bloquesPagos, bloqueSolicitudes, bloqueAnexos, bloqueProveedores);
}

const SIMBOLO_PASO = { hecho: '✓', actual: '➜', pendiente: '○', omitido: '–' };
const TEXTO_PASO = { hecho: 'Completado', actual: 'Siguiente paso', pendiente: 'Pendiente', omitido: 'No aplica' };

function contextoDe(s) {
  return { solicitudId: s.solicitudId, eventoId: s.eventoId, servicio: s.servicioNombre, servicioAfectado: s.servicioAfectado, datosProveedor: s.datosProveedor, descripcionSolicitud: s.descripcion };
}

/** El «siguiente paso» de una solicitud: solo la acción que corresponde (más las secundarias válidas), calculado por el servidor a partir del estado guardado. */
function siguienteDe(s, refrescar) {
  const p = s.proceso;
  if (!p) {                                                    // respaldo: un servidor sin «proceso» (versión anterior) sigue mostrando las acciones por estado
    const ctxR = contextoDe(s);
    const botones = accionesDeSolicitud(s.tipoSolicitud, s.estadoActual).map((k) => botonAccion(ACCIONES[k], ctxR, refrescar, { clase: 'btn btn-peq' })).filter(Boolean);
    return botones.length ? h('div', { class: 'acciones' }, ...botones) : h('span', { class: 'peq' }, s.pendiente ? 'En trámite' : 'Estado final');
  }
  if (p.terminal) return h('p', { class: 'peq' }, p.terminal);
  const sig = p.siguiente;
  if (!sig) return h('span', { class: 'peq' }, 'Sin pasos pendientes');
  const ctx = contextoDe(s);
  const principal = sig.accion ? botonAccion(ACCIONES[sig.accion], ctx, refrescar, { clase: 'btn btn-primario' }) : null;
  const secundarias = (sig.secundarias || []).map((k) => botonAccion(ACCIONES[k], ctx, refrescar, { clase: 'btn btn-peq' })).filter(Boolean);
  return h('div', { class: 'sig-paso' }, h('p', { class: 'peq' }, 'Siguiente paso'), h('h4', null, sig.titulo), h('p', null, sig.texto),
    sig.accion && !principal ? h('p', { class: 'peq' }, 'Este paso lo realiza otro rol; tu cuenta puede consultarlo.') : null,
    principal || secundarias.length ? h('div', { class: 'acciones' }, principal, ...secundarias) : null);
}

const datosSin = (...pares) => datos(...pares.filter(Boolean));
function verAnexo(a, numero) {
  dialogoInfo(`Anexo ${numero} del contrato`, h('div', null, datosSin(['Solicitud relacionada', etiquetaTipoSolicitud(a.tipoSolicitud || a.tipo)], ['Descripción', a.descripcion], ['Fecha de registro', fmtFechaHora(a.fecha)],
    a.estadoSolicitud ? ['Estado de formalización', a.estadoSolicitud] : null,
    a.importeAdicional !== undefined && a.importeAdicional !== null ? ['Importe adicional', Number(a.importeAdicional) > 0 ? fmtImporte(a.importeAdicional) : 'Sin importe adicional'] : null,
    ['Contrato', 'Contrato original del evento']),
    h('p', { class: 'peq' }, 'El anexo queda vinculado al contrato original y a la solicitud que lo originó; no se modifica ni se elimina.')));
}

function verVersiones(p, numero) {
  dialogoInfo(`Versiones de la propuesta ${numero}`, h('div', null, h('p', { class: 'peq' }, 'Cada versión conserva sus servicios, proveedores, importes y condiciones. Solo la vigente se puede aceptar.'),
    tabla([
      { titulo: 'Versión', celda: (v) => h('div', null, h('strong', null, `v${v.numero}`), v.vigente ? h('div', null, h('span', { class: 'etiqueta-ok' }, 'Vigente')) : null) },
      { titulo: 'Fecha', celda: (v) => fmtFechaHora(v.fecha) },
      { titulo: 'Servicios y proveedores', celda: (v) => (v.desglose && v.desglose.length
        ? h('div', null, v.desglose.map((d) => h('div', { class: 'peq' }, `${d.servicio}: ${d.proveedor} — ${fmtImporte(d.importe)}`)))
        : h('div', { class: 'peq' }, separarServicios(v.servicios).join(', '), h('div', null, 'Sin desglose: solo costo total.'))) },
      { titulo: 'Total', clase: 'num', celda: (v) => fmtImporte(v.costoTotal) },
      { titulo: 'Condiciones', celda: (v) => v.condiciones },
    ], [...p.versiones].reverse())));
}

/** Un panel por solicitud: qué es, sus importes (costo del proveedor y cargo por cambio tardío por separado), sus pasos, el anexo y el siguiente paso. */
export function panelSolicitud(s, refrescar, { conEvento = false } = {}) {
  const imp = s.importes || {};
  const bloqueImportes = (s.tipoSolicitud === 'cambio' && !imp.viabilidadRegistrada) ? null : (imp.hayImportes || s.tipoSolicitud === 'cambio'
    ? h('div', { class: 'importes-solicitud' }, datosSin(
      s.tipoSolicitud === 'cambio' ? ['Costo adicional del proveedor', fmtImporte(imp.costoProveedor)] : [s.tipoSolicitud === 'servicio adicional' ? 'Costo del proveedor' : 'Costo adicional', fmtImporte(imp.costoProveedor)],
      s.tipoSolicitud === 'cambio' ? ['Cargo por cambio tardío', Number(imp.cargoTardio) > 0 ? fmtImporte(imp.cargoTardio) : 'Sin cargo'] : null,
      ['Total a pagar por esta solicitud', imp.hayImportes ? fmtImporte(imp.total) : 'Sin importe adicional']), h('p', { class: 'peq' }, imp.explicacion || ''))
    : h('p', { class: 'peq' }, 'Sin importe adicional.'));
  const reporte = s.reporte ? h('div', { class: 'caja-aviso' }, h('strong', null, `${s.reporte.proveedor || 'El proveedor'} reportó que ya no puede cumplir el servicio`),
    h('p', null, `Motivo: ${s.reporte.motivo}${s.reporte.descripcion ? ` — ${s.reporte.descripcion}` : ''}`),
    h('p', { class: 'peq' }, `Reportado el ${fmtFechaHora(s.reporte.reportadoEn)}${s.reporte.aceptadoEn ? `. Había aceptado el servicio el ${fmtFechaHora(s.reporte.aceptadoEn)} (se conserva en el historial)` : ''}.`)) : null;
  const pago = s.pago ? h('p', { class: 'peq' }, `Pago asociado: ${s.pago.estado} · pagado ${fmtImporte(s.pago.pagado)} de ${fmtImporte(s.pago.importe)}${s.pago.plazo ? ` · plazo ${fmtFechaHora(s.pago.plazo)}` : ''}`) : null;
  const anexo = s.anexo ? h('div', { class: 'anexo-reg' }, h('span', { class: 'etiqueta-ok' }, 'Anexo registrado'), h('span', { class: 'peq' }, ` ${fmtFechaHora(s.anexo.fecha)} · `),
    h('button', { type: 'button', class: 'btn btn-peq', onclick: () => verAnexo({ ...s.anexo, estadoSolicitud: s.estadoActual, importeAdicional: imp.hayImportes ? imp.total : '0' }, 1) }, 'Consultar anexo')) : null;
  const lista = s.proceso ? h('ol', { class: 'pasos-solicitud', 'aria-label': 'Pasos de la solicitud' }, s.proceso.pasos.map((p) => h('li', { class: p.estado, 'aria-current': p.estado === 'actual' ? 'step' : null },
    h('span', { class: 'marca', 'aria-hidden': 'true' }, SIMBOLO_PASO[p.estado]), h('span', null, p.titulo, h('span', { class: 'peq' }, ` · ${TEXTO_PASO[p.estado]}${p.nota ? ` — ${p.nota}` : ''}`))))) : null;
  return h('section', { class: 'panel-solicitud', 'aria-label': s.descripcion || 'Solicitud' },
    h('header', null, h('div', null, h('span', { class: 'peq' }, etiquetaTipoSolicitud(s.tipoSolicitud)), conEvento ? h('div', { class: 'peq' }, h('a', { href: `#/evento/${s.eventoId}` }, nombreEvento(s.eventoId))) : null,
      h('h4', null, s.descripcion || 'Solicitud')), insignia(s.estadoActual)),
    h('p', { class: 'peq' }, [s.registradaEn ? `Registrada el ${fmtFechaHora(s.registradaEn)}` : null, s.diasAnticipacion !== null && s.diasAnticipacion !== undefined ? `${s.diasAnticipacion} días naturales antes del evento` : null,
      s.proveedorOriginal ? `Proveedor original: ${s.proveedorOriginal}` : null, s.proveedorNuevo ? `${s.tipoSolicitud === 'servicio adicional' ? 'Proveedor' : 'Alternativa'}: ${s.proveedorNuevo}` : null].filter(Boolean).join(' · ')),
    reporte, bloqueImportes, lista, pago, anexo, h('div', { class: 'sig-solicitud' }, siguienteDe(s, refrescar)));
}

/** Vista compacta (página «Solicitudes»): una fila por solicitud con su siguiente paso. El detalle completo, con los pasos, está en el evento. */
export function tablaSolicitudes(lista, refrescar, { conEvento = false } = {}) {
  return tabla([
    conEvento ? { titulo: 'Evento', celda: (s) => h('a', { href: `#/evento/${s.eventoId}` }, nombreEvento(s.eventoId)) } : null,
    { titulo: 'Tipo', celda: (s) => etiquetaTipoSolicitud(s.tipoSolicitud) },
    { titulo: 'Solicitud', celda: (s) => h('div', null, h('strong', null, s.descripcion || 'Solicitud'), s.servicioNombre ? h('div', { class: 'peq' }, s.servicioNombre) : null,
      s.reporte ? h('div', { class: 'peq' }, `Indisponibilidad reportada: ${s.reporte.motivo}`) : null) },
    { titulo: 'Estado', celda: (s) => h('div', null, insignia(s.estadoActual), AYUDA_ESTADO[s.estadoActual] ? h('div', { class: 'peq' }, AYUDA_ESTADO[s.estadoActual]) : null) },
    { titulo: 'Anexo', celda: (s) => (s.anexo ? h('button', { type: 'button', class: 'btn btn-peq', onclick: () => verAnexo({ ...s.anexo, estadoSolicitud: s.estadoActual }, 1) }, 'Consultar anexo') : h('span', { class: 'peq' }, '—')) },
    { titulo: 'Siguiente paso', celda: (s) => siguienteDe(s, refrescar) },
  ].filter(Boolean), lista, { vacioTitulo: 'No hay solicitudes', vacioDetalle: 'Las solicitudes de cambio, servicio adicional y sustitución aparecerán aquí.' });
}

/** Abre la asignación con los proveedores candidatos (registrados, activos y que ofrecen el servicio; D-P2); sin candidatos explica cómo continuar. */
async function asignarConCandidatos(ctx, refrescar) {
  let candidatos;
  try { candidatos = await candidatosParaAsignar(ctx.eventoId, ctx.servicioId); } catch (e) { aviso('error', e.message); return; }
  if (!candidatos.length) {
    dialogoInfo('No hay proveedores candidatos', h('div', null,
      h('p', null, `No encontramos proveedores activos para el servicio «${ctx.servicio}».`),
      h('p', null, 'Puedes consultar el catálogo o registrar un proveedor autorizado que ofrezca este servicio y volver a intentarlo.'),
      h('a', { class: 'btn btn-primario', href: '#/proveedores' }, 'Ir al catálogo de proveedores')));
    return;
  }
  await ejecutarAccion(ACCIONES.asignarProveedor, { ...ctx, candidatos }, refrescar);
}

async function verDisponibilidad(eventoId, s) {
  try {
    const [r, catalogo] = await Promise.all([consultarDisponibilidad(eventoId, s.servicioContratadoId), GET('/proveedores')]);
    const nombres = Object.fromEntries(catalogo.datos.proveedores.map((p) => [p.proveedorId, p.nombre]));
    const etiqueta = (pid) => nombres[pid] || 'Proveedor sin nombre en el catálogo';
    const d = r.datos || {};
    const lista = (ids, vacioTexto) => (ids && ids.length ? h('ul', null, ids.map((x) => h('li', null, etiqueta(x)))) : h('p', { class: 'peq' }, vacioTexto));
    dialogoInfo(`Candidatos para «${s.servicio}»`, h('div', null,
      h('p', { class: 'peq' }, 'Candidato = registrado en el catálogo, activo y que ofrece este servicio. El sistema no comprueba si está libre en la fecha del evento: lo confirma el proveedor al responder la asignación.'),
      h('h4', null, 'Proveedores candidatos'), lista(d.disponibles, 'Ningún proveedor activo ofrece este servicio. Registra uno en el catálogo de proveedores.'),
      d.no_disponibles && d.no_disponibles.length ? h('div', null, h('h4', null, 'Proveedores no disponibles'), lista(d.no_disponibles, '')) : null));
  } catch (e) { aviso('error', e.message); }
}
