"""Proceso guiado de una solicitud (cambio, servicio adicional o sustitución de proveedor): qué pasos están hechos, cuál es el actual y qué acción corresponde.

Solo LEE el estado real guardado en el servidor y lo presenta en el orden de la arquitectura vigente; no cambia reglas ni estados, y cada operación sigue
validándose en su servicio. La interfaz muestra únicamente la acción `siguiente` (y las secundarias que sí pueden ejecutarse), de modo que no se ofrecen botones
que se puedan ejecutar en un orden incorrecto."""
from __future__ import annotations
from typing import List, Optional
from domain.especificaciones import CAMBIO_REQUIERE_APROBACION_CLIENTE
from domain.valores import (EstadoObligacionPago, EstadoSolicitudCambio as ESC, EstadoSolicitudServicioAdicional as ESA,
                            EstadoSustitucionProveedor as ESP)

HECHO, ACTUAL, PENDIENTE, OMITIDO = "hecho", "actual", "pendiente", "omitido"


def _paso(clave: str, titulo: str, estado: str, nota: Optional[str] = None) -> dict:
    return {"clave": clave, "titulo": titulo, "estado": estado, "nota": nota}


def _cerrar_lista(pasos: List[dict], actual_clave: Optional[str]) -> None:
    """Marca como `actual` el paso indicado y como `pendiente` lo que aún no se hizo y no es omitible."""
    for p in pasos:
        if p["estado"] == "?":
            p["estado"] = ACTUAL if p["clave"] == actual_clave else PENDIENTE


def _primero_pendiente(pasos: List[dict]) -> Optional[str]:
    return next((p["clave"] for p in pasos if p["estado"] == "?"), None)


def _resultado(pasos: List[dict], acciones: dict, textos: dict, estado_actual: str, terminal: Optional[str], secundarias: Optional[dict] = None) -> dict:
    """`acciones`: clave de paso → nombre de acción de la interfaz (None si la realiza otro rol o el sistema); `textos`: clave → explicación."""
    if terminal:
        for p in pasos:
            if p["estado"] == "?":
                p["estado"] = OMITIDO
        return {"pasos": pasos, "siguiente": None, "terminal": terminal}
    clave = _primero_pendiente(pasos)
    _cerrar_lista(pasos, clave)
    siguiente = None
    if clave is not None:
        paso = next(p for p in pasos if p["clave"] == clave)
        siguiente = {"clave": clave, "titulo": paso["titulo"], "texto": textos.get(clave, ""), "accion": acciones.get(clave),
                     "secundarias": (secundarias or {}).get(clave, [])}
    return {"pasos": pasos, "siguiente": siguiente, "terminal": None}


def _liquidada(obligacion) -> bool:
    return obligacion is not None and obligacion.estado == EstadoObligacionPago.LIQUIDADA


# ------------------------------------------------------------------------------------------------ cambio
def proceso_cambio(s, obligacion) -> dict:
    terminal = None if s.pendiente else (s.motivo_cierre.descripcion if s.motivo_cierre else s.estado.value)
    if s.estado == ESC.CONFIRMADA:
        terminal = "El cambio fue confirmado."
    pre = s.viabilidad is not None
    requiere = pre and bool(s.impacto) and CAMBIO_REQUIERE_APROBACION_CLIENTE.es_satisfecha_por(s.impacto)
    importes = bool(s.importes_por_pagar)
    pasos = [
        _paso("registro", "Solicitud registrada", HECHO),
        _paso("viabilidad", "Evaluar la viabilidad del cambio", HECHO if pre else "?"),
        _paso("cliente", "Decisión del Cliente sobre el cambio", HECHO if s.decision_cliente is not None else (OMITIDO if pre and not requiere else "?"),
              None if (not pre or requiere) else "No requiere aprobación: no afecta costos ni condiciones."),
        _paso("autorizacion", "Autorización de Administración", HECHO if s.autorizacion_administracion is not None else (OMITIDO if pre and not requiere else "?")),
        _paso("anexo", "Registrar el anexo del contrato", HECHO if s.anexo_id else "?"),
    ]
    if not pre or importes:
        pasos.append(_paso("pagocom", "Comunicar el importe adicional al Cliente", HECHO if s.obligacion_pago_id else "?"))
        pasos.append(_paso("pagover", "Registrar y verificar el pago", HECHO if _liquidada(obligacion) else "?"))
    else:
        pasos.append(_paso("pagocom", "Importe adicional", OMITIDO, "Este cambio no tiene importe adicional: no se genera ningún pago."))
    pasos.append(_paso("confirmar", "Confirmar el cambio", HECHO if s.estado == ESC.CONFIRMADA else "?"))
    acciones = {"viabilidad": "viabilidadCambio", "cliente": "decisionClienteCambio", "autorizacion": "autorizacionCambio", "anexo": "anexoCambio",
                "pagocom": "solicitudPagoCambio", "pagover": None, "confirmar": "confirmarCambio"}
    textos = {
        "viabilidad": "Evalúa si el cambio se puede realizar y registra el costo adicional del proveedor, si lo hay.",
        "cliente": "El cambio afecta costos o condiciones: registra si el Cliente lo aprueba.",
        "autorizacion": "Administración debe autorizar el cambio que afecta costos o condiciones.",
        "anexo": "Registra el anexo del contrato que documenta el cambio aprobado. Es el paso previo a comunicar el pago y a confirmar.",
        "pagocom": "Comunica al Cliente el importe adicional; tiene 24 horas naturales para pagar.",
        "pagover": "Administración registra y verifica el pago en «Pagos y devoluciones». Cuando esté verificado podrás confirmar el cambio.",
        "confirmar": "Ya están cumplidos los requisitos: confirma el cambio para aplicarlo al evento.",
    }
    secundarias = {"pagover": ["cerrarCambioFaltaPago"]}
    return _resultado(pasos, acciones, textos, s.estado.value, terminal, secundarias)


# ------------------------------------------------------------------------------------------------ servicio adicional
def proceso_adicional(s, obligacion) -> dict:
    terminal = None if s.pendiente else (s.motivo_cierre.descripcion if s.motivo_cierre else s.estado.value)
    if s.estado == ESA.CONFIRMADA:
        terminal = "El servicio adicional fue confirmado."
    d = s.disponibilidad
    con_proveedor = d is not None and d.disponible
    pasos = [
        _paso("registro", "Solicitud registrada", HECHO),
        _paso("proveedor", "Buscar proveedor, costo y condiciones", HECHO if con_proveedor else "?"),
        _paso("cliente", "Aprobación del Cliente (costo y condiciones)", HECHO if s.decision_cliente is not None else "?"),
        _paso("autorizacion", "Autorización de Administración", HECHO if s.autorizacion_administracion is not None else "?"),
        _paso("anexo", "Registrar el anexo del contrato", HECHO if s.anexo_id else "?"),
        _paso("pagocom", "Comunicar el importe al Cliente", HECHO if s.obligacion_pago_id else "?"),
        _paso("pagover", "Registrar y verificar el pago", HECHO if _liquidada(obligacion) else "?"),
        _paso("confirmar", "Confirmar el servicio adicional", HECHO if s.estado == ESA.CONFIRMADA else "?"),
    ]
    acciones = {"proveedor": "disponibilidadAdicional", "cliente": "aprobacionClienteAdicional", "autorizacion": "autorizacionAdicional", "anexo": "anexoAdicional",
                "pagocom": "solicitudPagoAdicional", "pagover": None, "confirmar": "confirmarAdicional"}
    textos = {
        "proveedor": "Consulta la disponibilidad del proveedor del catálogo y registra su costo y condiciones. Eventos Nova no cobra por gestionar el servicio: solo se considera el costo del proveedor.",
        "cliente": "Registra si el Cliente aprueba el costo y las condiciones del servicio.",
        "autorizacion": "Administración debe autorizar el servicio antes de confirmarlo.",
        "anexo": "Registra el anexo del contrato que documenta el servicio adicional.",
        "pagocom": "Comunica al Cliente el pago del servicio adicional; tiene 24 horas naturales.",
        "pagover": "Administración registra y verifica el pago en «Pagos y devoluciones».",
        "confirmar": "El pago está verificado: confirma el servicio adicional.",
    }
    secundarias = {"proveedor": ["esperaAdicional"], "pagover": ["cerrarAdicionalFaltaPago"]}
    return _resultado(pasos, acciones, textos, s.estado.value, terminal, secundarias)


# ------------------------------------------------------------------------------------------------ sustitución de proveedor
def proceso_sustitucion(s, obligacion) -> dict:
    terminal = None if s.pendiente else (s.motivo_cierre.descripcion if s.motivo_cierre else s.estado.value)
    if s.estado == ESP.CONFIRMADA:
        terminal = "La sustitución fue confirmada."
    alt = s.alternativa_vigente
    con_impacto = bool(alt and alt.impacto and alt.impacto.tiene_impacto)
    costo = bool(s.costo_adicional and s.costo_adicional.cantidad > 0)
    pre = alt is not None and s.estado not in (ESP.EN_BUSQUEDA_ALTERNATIVA,)
    pasos = [
        _paso("registro", "Indisponibilidad reportada" if getattr(s, "reporte", None) else "Proveedor no disponible registrado", HECHO),
        _paso("alternativa", "Proponer un proveedor alternativo", HECHO if pre else "?"),
        _paso("cliente", "Aprobación del Cliente", HECHO if (alt and alt.decision_cliente is not None and alt.decision_cliente.aprobada) else (OMITIDO if pre and not con_impacto else "?")),
        _paso("autorizacion", "Autorización de Administración", HECHO if (alt and alt.autorizacion_administracion is not None and alt.autorizacion_administracion.aprobada) else (OMITIDO if pre and not con_impacto else "?")),
        _paso("anexo", "Registrar el anexo del contrato", HECHO if s.anexo_id else "?"),
    ]
    if costo or not pre:
        pasos.append(_paso("importe", "Integrar el costo adicional al saldo", HECHO if obligacion is not None else ("?" if (con_impacto or not pre) else OMITIDO)))
        if s.aprobada_despues_del_limite:
            pasos.append(_paso("pagover", "Registrar y verificar el pago del costo adicional", HECHO if _liquidada(obligacion) else "?"))
    else:
        pasos.append(_paso("importe", "Costo adicional", OMITIDO, "La alternativa no tiene costo adicional."))
    pasos.append(_paso("confirmar", "Confirmar la sustitución", HECHO if s.estado == ESP.CONFIRMADA else "?"))
    acciones = {"alternativa": "alternativaSustitucion", "cliente": "decisionClienteSustitucion", "autorizacion": "autorizacionSustitucion", "anexo": "anexoSustitucion",
                "importe": "importeSustitucion", "pagover": None, "confirmar": "confirmarSustitucion"}
    textos = {
        "alternativa": "Elige un proveedor activo que ofrezca este servicio (no el proveedor original) y registra su costo adicional y condiciones. Si el Cliente o Administración la rechazan, propón otra.",
        "cliente": "La alternativa tiene impacto: registra si el Cliente la aprueba.",
        "autorizacion": "Administración debe autorizar la alternativa.",
        "anexo": "Registra el anexo del contrato que documenta la sustitución.",
        "importe": "Integra el costo adicional aprobado al saldo general del contrato.",
        "pagover": "El costo adicional debe pagarse y verificarse antes de confirmar. Administración lo registra en «Pagos y devoluciones».",
        "confirmar": "Ya están cumplidos los requisitos: confirma la sustitución. El servicio pasa al nuevo proveedor.",
    }
    return _resultado(pasos, acciones, textos, s.estado.value, terminal)


def proceso_de(tipo: str, s, obligacion) -> dict:
    return {"cambio": proceso_cambio, "servicio adicional": proceso_adicional, "sustitución de proveedor": proceso_sustitucion}[tipo](s, obligacion)
