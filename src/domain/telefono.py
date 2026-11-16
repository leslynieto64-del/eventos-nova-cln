"""Teléfono: exactamente 10 dígitos numéricos (sin espacios, guiones, paréntesis, «+» ni letras).

La regla se aplica al CAPTURAR un teléfono nuevo (alta de un cliente o de un proveedor). Leer un registro histórico nunca la vuelve a exigir: los
números ya guardados se conservan tal cual, y para reconocer a un cliente existente se comparan solo los dígitos."""
import re
from .valores import ErrorDominio

MENSAJE_TELEFONO = "El número telefónico debe contener exactamente 10 dígitos"
_DIEZ_DIGITOS = re.compile(r"[0-9]{10}")                      # [0-9] y no \d: no se aceptan dígitos de otros alfabetos
_NO_DIGITOS = re.compile(r"[^0-9+]")


def es_telefono_valido(telefono) -> bool:
    return isinstance(telefono, str) and _DIEZ_DIGITOS.fullmatch(telefono.strip()) is not None


def validar_telefono(telefono) -> str:
    """Devuelve el teléfono sin espacios en los extremos o lanza ErrorDominio con el mensaje único."""
    if not es_telefono_valido(telefono):
        raise ErrorDominio(MENSAJE_TELEFONO)
    return telefono.strip()


def normalizar_telefono(telefono: str) -> str:
    """Solo para COMPARAR (p. ej. «55 1234 5678» histórico == «5512345678»): quita separadores comunes."""
    return re.sub(r"[\s\-().]", "", telefono or "")
