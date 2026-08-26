from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func

from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True)
    source_id = Column(Integer, ForeignKey("data_sources.id"))
    database_name = Column(String(255))
    schema_name = Column(String(255))
    table_name = Column(String(255))
    created_at = Column(DateTime, server_default=func.now())
