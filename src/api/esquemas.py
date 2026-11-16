"""Esquemas de entrada y respuesta de la API (Pydantic) y su conversión a objetos del dominio.

Los esquemas solo validan la *forma* de la petición (campos presentes, tipos, sin campos desconocidos).
Las reglas de negocio —datos completos del evento (CA-003), contenido de la propuesta (CA-005), importe no
negativo— las sigue aplicando el dominio al construir DatosEvento, ContenidoPropuesta e Importe; aquí no se repiten.
Este módulo depende de Pydantic y del dominio, no de FastAPI ni de la infraestructura."""
from __future__ import annotations
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, NaiveDatetime, field_validator, model_validator
from domain.proveedor import separar_servicios
from domain.valores import DatosEvento, ContenidoPropuesta, DesgloseServicio, Importe, MAXIMO_TECNICO_BIGINT


class _Esquema(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------- entrada
class DatosEventoEntrada(_Esquema):
    """Campos de DatosEvento. La fecha y hora se envían sin zona horaria, como las maneja el dominio."""
    tipo: str = Field(examples=["Boda"])
    fecha_hora: NaiveDatetime = Field(examples=["2026-11-20T18:00:00"])
    lugar: str = Field(examples=["Salón"])
    invitados_aproximados: int = Field(examples=[100], le=MAXIMO_TECNICO_BIGINT)    # límite técnico de BIGINT, no de negocio

    @field_validator("invitados_aproximados", mode="before")
    @classmethod
    def _no_booleano(cls, valor):
        """Pydantic convierte True en 1; un booleano no es una cantidad de invitados."""
        if isinstance(valor, bool):
            raise ValueError("invitados_aproximados debe ser un número entero, no un booleano")
        return valor

    def a_dominio(self) -> DatosEvento:
        return DatosEvento(self.tipo, self.fecha_hora, self.lugar, self.invitados_aproximados)


class ClienteEntrada(_Esquema):
    """Datos de contacto del cliente. El identificador lo genera el servidor; el cliente se reconoce por su correo (no por el nombre)."""
    nombres: str = Field(examples=["Ana María"], max_length=100)
    apellidos: str = Field(examples=["López Pérez"], max_length=100)
    telefono: str = Field(examples=["55 1234 5678"], max_length=30)
    correo: str = Field(examples=["ana.lopez@ejemplo.com"], max_length=254)


class RegistrarEventoEntrada(_Esquema):
    """Parámetros de GestionPropuestaService.registrar_evento_de_cliente (forma vigente: `cliente`) o registrar_evento (forma anterior:
    `cliente_id`, que se conserva por compatibilidad). Debe enviarse exactamente una de las dos."""
    cliente: Optional[ClienteEntrada] = None
    cliente_id: Optional[str] = Field(default=None, examples=["CL-1"], description="Forma anterior, solo por compatibilidad: use `cliente`.")
    datos: DatosEventoEntrada
    servicios: List[str] = Field(examples=[["Banquete"]])

    @model_validator(mode="after")
    def _una_forma_de_cliente(self):
        if (self.cliente is None) == (self.cliente_id is None):
            raise ValueError("indique los datos del cliente en `cliente` (forma vigente) o, por compatibilidad, `cliente_id`; no ambos ni ninguno")
        return self


def _a_centavos(importe: Decimal) -> Decimal:
    """Importes con dos decimales (5000 → 5000.00) para que el total y lo guardado se vean igual en memoria y en PostgreSQL."""
    return importe.quantize(Decimal('0.01')) if importe == importe.quantize(Decimal('0.01')) else importe


class DesgloseServicioEntrada(_Esquema):
    """Un renglón de la cotización: el servicio, el proveedor considerado y el importe cotizado por Coordinación (nunca se asigna un precio automáticamente)."""
    servicio: str = Field(examples=["Banquete"], max_length=100)
    proveedor_id: str = Field(examples=["PV-1"])
    importe: Decimal = Field(examples=["5000.00"], allow_inf_nan=False)


class CrearPropuestaEntrada(_Esquema):
    """Campos de ContenidoPropuesta. La fecha de la versión la asigna el servidor.
    Forma vigente: `desglose` (servicio, proveedor e importe de cada servicio): el TOTAL lo calcula el servidor como la suma de los importes y los servicios y proveedores
    considerados salen del desglose. Forma anterior (se conserva): `servicios`, `proveedores_considerados` y `costo_total`."""
    servicios: Optional[List[str]] = Field(default=None, examples=[["Banquete"]])
    proveedores_considerados: Optional[List[str]] = Field(default=None, examples=[["PV-1"]])
    costo_total: Optional[Decimal] = Field(default=None, examples=["10000.00"], allow_inf_nan=False)   # sin NaN ni infinitos; el dominio rechaza negativos
    condiciones: str = Field(examples=["Condiciones generales"])
    desglose: Optional[List[DesgloseServicioEntrada]] = Field(default=None, max_length=60)

    @model_validator(mode="after")
    def _forma_completa(self):
        if not self.desglose and (self.servicios is None or self.proveedores_considerados is None or self.costo_total is None):
            raise ValueError("indica el desglose por servicio o, en la forma anterior, servicios, proveedores_considerados y costo_total")
        return self

    def a_dominio(self) -> ContenidoPropuesta:
        if self.desglose:
            renglones = tuple(DesgloseServicio(" ".join(d.servicio.split()), d.proveedor_id.strip(), Importe(_a_centavos(d.importe))) for d in self.desglose)
            total = sum((r.importe.cantidad for r in renglones), Decimal(0))
            proveedores = tuple(dict.fromkeys(r.proveedor_id for r in renglones))            # sin repetir, en orden
            return ContenidoPropuesta(tuple(r.servicio for r in renglones), proveedores, Importe(total), self.condiciones, renglones)
        # «Banquete; Música» en una sola cadena son DOS servicios; las propuestas anteriores no se reescriben (solo las nuevas se separan)
        return ContenidoPropuesta(tuple(separar_servicios(self.servicios or [])), tuple(self.proveedores_considerados or ()),
                                  Importe(self.costo_total), self.condiciones)


# ---------------------------------------------------------------- respuesta
class EventoRegistradoRespuesta(_Esquema):
    evento_id: str
    mensaje: str
    cliente: Optional[dict] = None             # datos del cliente (clienteId, nombreCompleto, teléfono, correo); ausente con la forma anterior (`cliente_id`)
    cliente_nuevo: Optional[bool] = None       # True si el cliente se registró ahora; False si se reutilizó el del mismo correo


class PropuestaCreadaRespuesta(_Esquema):
    propuesta_id: str
    evento_id: str
    mensaje: str


class RechazoRespuesta(_Esquema):
    """Rechazo de negocio: el motivo es el que devuelve el servicio de aplicación o el dominio."""
    tipo: str = "rechazo_de_negocio"
    detalle: str
    pendientes: List[str] = []


# ---------------------------------------------------------------- respuesta de GET /eventos/{evento_id}/pagos
class ObligacionPagoRespuesta(_Esquema):
    """Anticipo o saldo del contrato original. Vacío si el Estado de Cuenta no tiene esa obligación; `plazoVencido` solo se
    informa cuando la consulta recibe reloj (CA-023); `resultadoRegularizacion` solo aparece en el saldo ya revisado."""
    importe: Optional[str] = None
    fechaLimite: Optional[str] = Field(default=None, description="Vencimiento del plazo (ISO 8601); null si la obligación no tiene plazo")
    estado: Optional[str] = None
    plazoVencido: Optional[bool] = Field(default=None, description="true si la obligación sigue Pendiente o Vencida y su plazo ya venció a la hora de la consulta (CA-023)")
    resultadoRegularizacion: Optional[str] = Field(default=None, description="«Regularizado» o «No regularizado», registrado por Administración")
    obligacionId: Optional[str] = None
    pagado: Optional[str] = Field(default=None, description="Suma de los pagos Verificados de la obligación")
    registradoSinVerificar: Optional[str] = Field(default=None, description="Pagos Registrados que aún no cuentan porque no están verificados")
    saldo: Optional[str] = Field(default=None, description="Importe menos lo pagado (nunca negativo)")


class PagoRegistradoRespuesta(_Esquema):
    pagoId: Optional[str] = None
    concepto: str
    importe: str
    fecha: str
    estado: str
    registradoEn: Optional[str] = None
    verificadoEn: Optional[str] = None


class ObligacionAdicionalRespuesta(_Esquema):
    concepto: str
    importe: str
    plazo: Optional[str] = None
    estado: str
    obligacionId: Optional[str] = None
    origenId: Optional[str] = None            # S-6: la solicitud (cambio, servicio adicional o sustitución) que originó la obligación
    pagado: Optional[str] = None
    registradoSinVerificar: Optional[str] = None
    saldo: Optional[str] = None


class DevolucionRespuesta(_Esquema):
    devolucionId: str
    solicitudId: Optional[str] = None
    concepto: str
    importe: str
    estado: str
    fechaCierre: str
    fechaLimite: str
    fechaDevolucion: Optional[str] = None
    comprobante: Optional[str] = None
    enPlazo: Optional[bool] = None
    tipo: str
    pagoId: Optional[str] = None


class EstadoCuentaResumenRespuesta(_Esquema):
    estadoCuentaId: str
    contratoId: str
    anticipo: ObligacionPagoRespuesta
    pagosRegistrados: List[PagoRegistradoRespuesta]
    saldoContratoOriginal: ObligacionPagoRespuesta
    obligacionesAdicionales: List[ObligacionAdicionalRespuesta]
    devoluciones: List[DevolucionRespuesta]


class EstadoPagosRespuesta(_Esquema):
    eventoId: str
    estadosCuenta: List[EstadoCuentaResumenRespuesta]
