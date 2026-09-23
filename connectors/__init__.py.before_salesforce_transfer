from typing import Dict, Any, Optional
from connectors.base import (
    ConnectionTestResult,
    ColumnMetadata,
    TableMetadata,
    MetadataDiscoveryResult,
    QueryResultColumn,
    QueryExecutionResult,
)
from connectors.snowflake import SnowflakeConnector


def test_source_connection(source_type: str, config: Dict[str, Any]) -> ConnectionTestResult:
    """
    Dispatcher for testing data source connectivity across platforms.
    Dispatches to platform-specific connectors while maintaining an extensible architecture.
    """
    normalized_type = (source_type or "").strip().lower()

    if normalized_type == "snowflake":
        return SnowflakeConnector.test_connection(config)

    elif normalized_type in ("salesforce", "databricks", "postgresql"):
        return ConnectionTestResult(
            success=False,
            message=f"{normalized_type.title()} connector testing is not yet supported in this version.",
            latency_ms=0,
            error=f"Real connection testing for {normalized_type.title()} is scheduled for a future milestone.",
        )

    else:
        return ConnectionTestResult(
            success=False,
            message=f"Unsupported data source type '{source_type}'.",
            latency_ms=0,
            error=f"No connection driver or handler is available for source type '{source_type}'.",
        )


def discover_source_metadata(source_type: str, config: Dict[str, Any]) -> MetadataDiscoveryResult:
    """
    Dispatcher for discovering database/schema/table/column metadata across platforms.
    Dispatches to platform-specific connectors while maintaining an extensible architecture.
    """
    normalized_type = (source_type or "").strip().lower()

    if normalized_type == "snowflake":
        return SnowflakeConnector.discover_metadata(config)

    elif normalized_type in ("salesforce", "databricks", "postgresql"):
        return MetadataDiscoveryResult(
            success=False,
            message=f"Metadata synchronization for {normalized_type.title()} is not yet supported in this version.",
            databases_discovered=0,
            schemas_discovered=0,
            tables_discovered=0,
            columns_discovered=0,
            tables=[],
            error=f"Metadata synchronization for {normalized_type.title()} is scheduled for a future milestone.",
            latency_ms=0,
        )

    else:
        return MetadataDiscoveryResult(
            success=False,
            message=f"Unsupported data source type '{source_type}'.",
            databases_discovered=0,
            schemas_discovered=0,
            tables_discovered=0,
            columns_discovered=0,
            tables=[],
            error=f"No metadata discovery driver is available for source type '{source_type}'.",
            latency_ms=0,
        )


def execute_source_query(
    source_type: str,
    config: Dict[str, Any],
    query: str,
    params: Optional[Dict[str, Any]] = None,
    timeout_seconds: int = 30,
    limit: int = 100,
) -> QueryExecutionResult:
    """
    Dispatcher for executing read-only queries across platforms.
    Dispatches to platform-specific connectors while maintaining an extensible architecture.
    """
    normalized_type = (source_type or "").strip().lower()

    if normalized_type == "snowflake":
        return SnowflakeConnector.execute_read_query(
            config=config,
            query=query,
            params=params,
            timeout_seconds=timeout_seconds,
            limit=limit,
        )

    elif normalized_type in ("salesforce", "databricks", "postgresql"):
        return QueryExecutionResult(
            success=False,
            message=f"Query execution for {normalized_type.title()} is not yet supported in this version.",
            error=f"Real query execution for {normalized_type.title()} is scheduled for a future milestone.",
        )

    else:
        return QueryExecutionResult(
            success=False,
            message=f"Unsupported data source type '{source_type}'.",
            error=f"No query execution driver is available for source type '{source_type}'.",
        )


__all__ = [
    "ConnectionTestResult",
    "ColumnMetadata",
    "TableMetadata",
    "MetadataDiscoveryResult",
    "QueryResultColumn",
    "QueryExecutionResult",
    "SnowflakeConnector",
    "test_source_connection",
    "discover_source_metadata",
    "execute_source_query",
]

