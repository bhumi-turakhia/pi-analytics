from sqlalchemy import Column, Integer, BigInteger, String, DateTime, ForeignKey, Boolean, Text, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True)
    source_id = Column(Integer, ForeignKey("data_sources.id"))
    database_name = Column(String(255))
    schema_name = Column(String(255))
    table_name = Column(String(255))
    table_type = Column(String(50), default="TABLE")
    row_count = Column(BigInteger, default=0)
    size_bytes = Column(BigInteger, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    columns = relationship("CatalogColumn", back_populates="dataset", cascade="all, delete-orphan", order_by="CatalogColumn.ordinal_position")


class CatalogColumn(Base):
    __tablename__ = "catalog_columns"

    id = Column(Integer, primary_key=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False)
    column_name = Column(String(255), nullable=False)
    data_type = Column(String(100), nullable=False)
    is_nullable = Column(Boolean, default=True)
    ordinal_position = Column(Integer, default=0)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    dataset = relationship("Dataset", back_populates="columns")

    __table_args__ = (
        UniqueConstraint("dataset_id", "column_name", name="uq_catalog_columns_dataset_col"),
    )
