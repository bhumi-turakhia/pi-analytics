from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Dashboard(Base):
    __tablename__ = "dashboards"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    source_id = Column(Integer, ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    widgets = relationship(
        "DashboardWidget",
        back_populates="dashboard",
        cascade="all, delete-orphan",
        order_by="DashboardWidget.position",
    )


class DashboardWidget(Base):
    __tablename__ = "dashboard_widgets"

    id = Column(Integer, primary_key=True)
    dashboard_id = Column(Integer, ForeignKey("dashboards.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    widget_type = Column(String(50), nullable=False)
    source_id = Column(Integer, ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True)
    database_name = Column(String(255), nullable=True)
    schema_name = Column(String(255), nullable=True)
    table_name = Column(String(255), nullable=True)
    sql_query = Column(Text, nullable=False)
    visualization_spec = Column(JSON, nullable=False)
    position = Column(Integer, default=0)
    width = Column(Integer, default=6)
    height = Column(Integer, default=4)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    dashboard = relationship("Dashboard", back_populates="widgets")
