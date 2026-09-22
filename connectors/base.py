from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List


@dataclass
class ConnectionTestResult:
    """
    Standardized connection test result returned by all connectors.
    Ensures safe error messages and consistent structure across platforms.
    """
    success: bool
    message: str
    latency_ms: int = 0
    error: Optional[str] = None
    details: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "success": self.success,
            "message": self.message,
            "latency_ms": self.latency_ms,
        }
        if self.error is not None:
            result["error"] = self.error
        if self.details is not None:
            result["details"] = self.details
        return result


@dataclass
class ColumnMetadata:
    """Represents column metadata discovered from a source table."""
    name: str
    data_type: str
    is_nullable: bool = True
    ordinal_position: int = 0
    comment: Optional[str] = None
    is_primary_key: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "data_type": self.data_type,
            "is_nullable": self.is_nullable,
            "ordinal_position": self.ordinal_position,
            "comment": self.comment,
            "is_primary_key": self.is_primary_key,
        }


@dataclass
class TableMetadata:
    """Represents table or view metadata discovered from a database schema."""
    database: str
    schema: str
    name: str
    table_type: str = "TABLE"
    row_count: int = 0
    bytes: int = 0
    comment: Optional[str] = None
    columns: List[ColumnMetadata] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "database": self.database,
            "schema": self.schema,
            "name": self.name,
            "table_type": self.table_type,
            "row_count": self.row_count,
            "bytes": self.bytes,
            "comment": self.comment,
            "columns": [c.to_dict() for c in self.columns],
        }


@dataclass
class MetadataDiscoveryResult:
    """Result of metadata discovery operation across databases, schemas, tables, and columns."""
    success: bool
    message: str
    databases_discovered: int = 0
    schemas_discovered: int = 0
    tables_discovered: int = 0
    columns_discovered: int = 0
    tables: List[TableMetadata] = field(default_factory=list)
    error: Optional[str] = None
    latency_ms: int = 0

    def to_dict(self) -> Dict[str, Any]:
        res: Dict[str, Any] = {
            "success": self.success,
            "message": self.message,
            "databases_discovered": self.databases_discovered,
            "schemas_discovered": self.schemas_discovered,
            "tables_discovered": self.tables_discovered,
            "columns_discovered": self.columns_discovered,
            "latency_ms": self.latency_ms,
        }
        if self.error is not None:
            res["error"] = self.error
        if self.tables:
            res["tables"] = [t.to_dict() for t in self.tables]
        return res


@dataclass
class QueryResultColumn:
    """Represents a column descriptor in query results."""
    name: str
    data_type: str = "VARCHAR"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "data_type": self.data_type,
        }


@dataclass
class QueryExecutionResult:
    """Result of read-only query execution containing bounded rows, column descriptors, and telemetry."""
    success: bool
    columns: List[QueryResultColumn] = field(default_factory=list)
    rows: List[Dict[str, Any]] = field(default_factory=list)
    row_count: int = 0
    execution_time_ms: int = 0
    message: str = ""
    error: Optional[str] = None
    query_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        res: Dict[str, Any] = {
            "success": self.success,
            "columns": [c.to_dict() for c in self.columns],
            "rows": self.rows,
            "row_count": self.row_count,
            "execution_time_ms": self.execution_time_ms,
            "message": self.message,
        }
        if self.query_id is not None:
            res["query_id"] = self.query_id
        if self.error is not None:
            res["error"] = self.error
        return res

