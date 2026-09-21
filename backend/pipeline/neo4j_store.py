"""Neo4j Graph Store for paper namespaces, entities, relations, chunks, and compressed views."""
import logging
from typing import Dict, Any, List, Optional, Set
from neo4j import GraphDatabase, Driver
from backend.config import settings

logger = logging.getLogger("graphrag.neo4j")

class Neo4jStore:
    """Manages graph persistence in Neo4j with per-paper namespaces and dual original/compressed topologies."""

    def __init__(self):
        self.uri = settings.NEO4J_URI
        self.username = settings.NEO4J_USERNAME
        self.password = settings.NEO4J_PASSWORD
        self.database = settings.NEO4J_DATABASE
        self._driver: Optional[Driver] = None
        self._connected = False
        # In-memory graph fallback if Neo4j is temporarily offline/provisioning
        self._memory_nodes: Dict[str, List[Dict[str, Any]]] = {}
        self._memory_edges: Dict[str, List[Dict[str, Any]]] = {}

    def get_driver(self) -> Optional[Driver]:
        """Lazy driver initialization with connection verification."""
        if self._driver is None:
            try:
                self._driver = GraphDatabase.driver(
                    self.uri,
                    auth=(self.username, self.password),
                    connection_timeout=5.0,
                    max_connection_lifetime=300
                )
                # Verify connectivity
                with self._driver.session(database=self.database) as session:
                    session.run("RETURN 1 AS test").single()
                self._connected = True
                logger.info(f"Connected to Neo4j database '{self.database}' at {self.uri}")
            except Exception as e:
                logger.warning(f"Neo4j connection failed ({e}). Enabling in-memory fallback store.")
                self._driver = None
                self._connected = False
        return self._driver

    def check_health(self) -> Dict[str, Any]:
        """Health check reporting database status and stats."""
        try:
            driver = self.get_driver()
            if driver and self._connected:
                with driver.session(database=self.database) as session:
                    result = session.run("CALL dbms.components() YIELD name, versions, edition RETURN name, versions[0] AS version, edition").single()
                    version = result["version"] if result else "unknown"
                    counts = session.run("MATCH (n) RETURN count(n) AS node_count").single()
                    node_count = counts["node_count"] if counts else 0
                    return {
                        "status": "connected",
                        "uri": self.uri,
                        "database": self.database,
                        "version": version,
                        "total_nodes": node_count,
                        "using_fallback": False
                    }
            return {
                "status": "offline",
                "uri": self.uri,
                "database": self.database,
                "using_fallback": True,
                "message": "Neo4j Aura instance may still be resuming or credentials need review."
            }
        except Exception as e:
            return {
                "status": "error",
                "uri": self.uri,
                "error": str(e),
                "using_fallback": True
            }

    def init_schema(self):
        """Create indexes and constraints for fast querying."""
        driver = self.get_driver()
        if not driver:
            return
        try:
            with driver.session(database=self.database) as session:
                session.run("CREATE CONSTRAINT entity_id_unique IF NOT EXISTS FOR (e:Entity) REQUIRE (e.paper_id, e.id) IS UNIQUE")
                session.run("CREATE INDEX entity_name_idx IF NOT EXISTS FOR (e:Entity) ON (e.paper_id, e.name)")
                session.run("CREATE INDEX chunk_id_idx IF NOT EXISTS FOR (c:Chunk) ON (c.paper_id, c.chunk_id)")
                session.run("CREATE INDEX community_id_idx IF NOT EXISTS FOR (m:Community) ON (m.paper_id, m.id)")
        except Exception as e:
            logger.warning(f"Failed to initialize Neo4j constraints: {e}")

    def save_entities_and_relations(
        self,
        paper_id: str,
        entities: List[Dict[str, Any]],
        relations: List[Dict[str, Any]],
        chunks: List[Dict[str, Any]]
    ):
        """Persist extracted entities, directed relationships, and chunk links for a paper namespace."""
        # Save in memory store first for instant availability
        self._memory_nodes[paper_id] = entities
        self._memory_edges[paper_id] = relations

        driver = self.get_driver()
        if not driver:
            return

        try:
            with driver.session(database=self.database) as session:
                # 1. Store chunks
                chunk_query = """
                UNWIND $chunks AS c
                MERGE (chunk:Chunk {paper_id: $paper_id, chunk_id: c.chunk_id})
                SET chunk.content = c.content,
                    chunk.section = c.section,
                    chunk.page = c.page
                """
                session.run(chunk_query, chunks=chunks, paper_id=paper_id)

                # 2. Store entities
                entity_query = """
                UNWIND $entities AS e
                MERGE (ent:Entity {paper_id: $paper_id, id: e.id})
                SET ent.name = e.name,
                    ent.type = e.type,
                    ent.description = e.description
                WITH ent, e
                UNWIND e.source_chunk_ids AS cid
                MATCH (chunk:Chunk {paper_id: $paper_id, chunk_id: cid})
                MERGE (ent)-[:MENTIONED_IN]->(chunk)
                """
                session.run(entity_query, entities=entities, paper_id=paper_id)

                # 3. Store directed relationships
                relation_query = """
                UNWIND $relations AS r
                MATCH (source:Entity {paper_id: $paper_id, id: r.source})
                MATCH (target:Entity {paper_id: $paper_id, id: r.target})
                MERGE (source)-[rel:RELATED_TO {type: r.type}]->(target)
                SET rel.description = r.description,
                    rel.weight = coalesce(r.weight, 1.0)
                """
                session.run(relation_query, relations=relations, paper_id=paper_id)
        except Exception as e:
            logger.error(f"Error persisting graph to Neo4j: {e}")

    def get_paper_graph(self, paper_id: str, compressed: bool = False) -> Dict[str, Any]:
        """Fetch either original or compressed graph topology for cytoscape visualization."""
        driver = self.get_driver()
        if driver and self._connected:
            try:
                with driver.session(database=self.database) as session:
                    label = "Supernode" if compressed else "Entity"
                    node_result = session.run(
                        f"MATCH (n:{label} {{paper_id: $paper_id}}) RETURN properties(n) AS props",
                        paper_id=paper_id
                    )
                    nodes = [record["props"] for record in node_result]

                    edge_type = "COMPRESSED_EDGE" if compressed else "RELATED_TO"
                    edge_result = session.run(
                        f"""
                        MATCH (s:{label} {{paper_id: $paper_id}})-[r:{edge_type}]->(t:{label} {{paper_id: $paper_id}})
                        RETURN s.id AS source, t.id AS target, properties(r) AS props
                        """,
                        paper_id=paper_id
                    )
                    edges = [
                        {"source": r["source"], "target": r["target"], **r["props"]}
                        for r in edge_result
                    ]
                    if nodes:
                        return {"nodes": nodes, "edges": edges, "compressed": compressed}
            except Exception as e:
                logger.warning(f"Neo4j query error: {e}. Falling back to memory.")

        # Fallback to in-memory representation
        nodes = self._memory_nodes.get(paper_id, [])
        edges = self._memory_edges.get(paper_id, [])
        return {"nodes": nodes, "edges": edges, "compressed": compressed}

    def close(self):
        if self._driver:
            self._driver.close()

# Singleton instance
neo4j_store = Neo4jStore()
