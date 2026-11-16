"""Catálogo de Clientes (la persona que solicita la organización de un evento).

El BRD pide registrar «la información del cliente y del evento» y sus datos de contacto. Este registro guarda solo lo necesario para
reconocer a la misma persona en eventos posteriores: nombre(s), apellidos, teléfono y correo electrónico. No pide CURP ni identificación
oficial. El identificador `CL-<uuid>` lo genera siempre el servidor (nunca lo escribe la persona usuaria).

Un cliente se reconoce por su CORREO normalizado (sin espacios y en minúsculas), nunca por el nombre: dos personas distintas pueden llamarse
igual. Es un registro de referencia, no una raíz de agregado con máquina de estados: no emite Domain Events ni se versiona. Los eventos y
propuestas históricos conservan su `cliente_id` como referencia blanda (por ejemplo «CL-DEMO-01»), sin clave foránea."""
from __future__ import annotations
import re
from dataclasses import dataclass
from datetime import datetime
from .proveedor import normalizar_texto
from .telefono import normalizar_telefono, validar_telefono
from .valores import ErrorDominio

MAXIMO_NOMBRE = 100
MAXIMO_CORREO = 254
_CORREO = re.compile(r"^[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$")


def normalizar_correo(correo: str) -> str:
    """Sin espacios alrededor y en minúsculas: «  Ana@Correo.COM » == «ana@correo.com»."""
    return (correo or "").strip().lower()


def _limpiar(texto: str) -> str:
    return " ".join((texto or "").split())


@dataclass(frozen=True)
class Cliente:
    cliente_id: str
    nombres: str
    apellidos: str
    telefono: str
    correo: str
    registrado_en: datetime

    def __post_init__(self):
        if not self.cliente_id or not self.cliente_id.strip():
            raise ErrorDominio("El cliente debe tener un identificador.")
        for etiqueta, valor in (("el nombre o los nombres", self.nombres), ("los apellidos", self.apellidos)):
            if not valor or not valor.strip():
                raise ErrorDominio(f"Debe indicarse {etiqueta} del cliente.")
            if len(valor) > MAXIMO_NOMBRE:
                raise ErrorDominio(f"{etiqueta[0].upper() + etiqueta[1:]} del cliente no puede superar {MAXIMO_NOMBRE} caracteres.")
        if not self.telefono or not self.telefono.strip():                      # el formato (10 dígitos) se exige al registrar, no al leer un registro histórico
            raise ErrorDominio("Debe indicarse el teléfono del cliente.")
        if len(self.correo) > MAXIMO_CORREO or not _CORREO.fullmatch(normalizar_correo(self.correo)):
            raise ErrorDominio("El correo electrónico no es válido (por ejemplo, nombre@dominio.com).")

    @staticmethod
    def registrar(cliente_id: str, nombres: str, apellidos: str, telefono: str, correo: str, ahora: datetime) -> "Cliente":
        """Alta con los datos limpios: espacios colapsados y correo en minúsculas. El teléfono debe tener exactamente 10 dígitos."""
        return Cliente(cliente_id, _limpiar(nombres), _limpiar(apellidos), validar_telefono(telefono), normalizar_correo(correo), ahora)

    @property
    def correo_normalizado(self) -> str:
        return normalizar_correo(self.correo)

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombres} {self.apellidos}"

    def coincide_con(self, otro: "Cliente") -> bool:
        """¿Son los mismos datos de contacto? Se compara sin distinguir mayúsculas ni acentos en el nombre y por dígitos en el teléfono.
        El correo no se compara aquí: es la clave con la que se buscó al cliente."""
        return (normalizar_texto(self.nombres) == normalizar_texto(otro.nombres)
                and normalizar_texto(self.apellidos) == normalizar_texto(otro.apellidos)
                and normalizar_telefono(self.telefono) == normalizar_telefono(otro.telefono))

    def contiene(self, busqueda: str) -> bool:
        """Búsqueda por texto en identificador, nombre, apellidos, teléfono y correo (sin distinguir mayúsculas ni acentos)."""
        q = normalizar_texto(busqueda)
        return not q or any(q in normalizar_texto(t) for t in (self.cliente_id, self.nombre_completo, self.telefono, self.correo))
