"""Teléfono opcional de los proveedores: columna `proveedor.telefono`.

Cambio aditivo: agrega una columna con valor por omisión '' y una restricción que acepta '' o exactamente 10 dígitos. No modifica ni borra ninguna fila
existente (los proveedores anteriores quedan sin teléfono y conservan su contacto de texto libre). El teléfono de los clientes no se toca.

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-15
"""
from alembic import op
import sqlalchemy as sa

revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('proveedor', sa.Column('telefono', sa.Text(), server_default='', nullable=False))
    op.create_check_constraint(op.f('ck_proveedor_telefono_10_digitos'), 'proveedor', "telefono = '' OR telefono ~ '^[0-9]{10}$'")


def downgrade() -> None:
    op.drop_constraint(op.f('ck_proveedor_telefono_10_digitos'), 'proveedor', type_='check')
    op.drop_column('proveedor', 'telefono')
