"""Stage 3 Verification Tests: Tarjan SCC, Bridges, and Articulation Points verified against NetworkX."""
import pytest
import networkx as nx
import random
from backend.core.tarjan import tarjan
from backend.core.compression import compressor

def test_tarjan_scc_vs_networkx_cycles():
    """Verify SCC equivalence with networkx on cyclic topologies."""
    # Graph with two distinct SCC cycles and singleton nodes:
    # Cycle 1: a -> b -> c -> a
    # Cycle 2: d -> e -> d
    # Bridge edge: c -> d
    # Outgoing to singleton: e -> f
    adj = {
        "a": ["b"],
        "b": ["c"],
        "c": ["a", "d"],
        "d": ["e"],
        "e": ["d", "f"],
        "f": []
    }

    # Custom iterative Tarjan
    custom_sccs = [set(scc) for scc in tarjan.strongly_connected_components(adj)]

    # NetworkX reference
    G = nx.DiGraph()
    for u, neighbors in adj.items():
        G.add_node(u)
        for v in neighbors:
            G.add_edge(u, v)

    nx_sccs = [set(scc) for scc in nx.strongly_connected_components(G)]

    # Verify identical partition
    assert len(custom_sccs) == len(nx_sccs)
    for scc in custom_sccs:
        assert scc in nx_sccs

def test_tarjan_scc_vs_networkx_random_graphs():
    """Verify iterative Tarjan on multiple randomized directed graphs against NetworkX."""
    random.seed(42)
    for num_nodes in [10, 25, 50]:
        for edge_prob in [0.05, 0.15, 0.3]:
            G = nx.fast_gnp_random_graph(num_nodes, edge_prob, directed=True, seed=42)
            nodes = [str(n) for n in G.nodes()]
            adj = {str(n): [] for n in G.nodes()}
            for u, v in G.edges():
                adj[str(u)].append(str(v))

            custom_sccs = [set(scc) for scc in tarjan.strongly_connected_components(adj)]
            nx_sccs = [set(str(n) for n in scc) for scc in nx.strongly_connected_components(G)]

            assert len(custom_sccs) == len(nx_sccs)
            for scc in custom_sccs:
                assert scc in nx_sccs

def test_bridges_and_articulation_points_vs_networkx():
    """Verify bridges and articulation points match NetworkX exactly."""
    # Classic bridge & articulation point graph:
    # Triangle (1, 2, 3) connected via bridge (3, 4) to barbell (4, 5, 6)
    # Node 3 and Node 4 are articulation points, edge (3, 4) is a bridge
    nodes = ["1", "2", "3", "4", "5", "6"]
    edges = [
        ("1", "2"), ("2", "3"), ("3", "1"),  # cycle 1
        ("3", "4"),                          # bridge!
        ("4", "5"), ("5", "6"), ("6", "4")   # cycle 2
    ]

    custom_bridges, custom_ap = tarjan.bridges_and_articulation_points(nodes, edges)

    # NetworkX reference on undirected graph
    G = nx.Graph()
    G.add_nodes_from(nodes)
    G.add_edges_from(edges)

    nx_bridges = {tuple(sorted((str(u), str(v)))) for u, v in nx.bridges(G)}
    nx_ap = {str(n) for n in nx.articulation_points(G)}

    assert custom_bridges == nx_bridges
    assert custom_ap == nx_ap
    assert ("3", "4") in custom_bridges
    assert "3" in custom_ap and "4" in custom_ap

def test_graph_compression_preserves_connectors_and_mapping():
    """Verify that compression collapses SCCs, preserves articulation points, and stores member mappings."""
    nodes = [
        {"id": "a1", "name": "Node A1"},
        {"id": "a2", "name": "Node A2"},
        {"id": "b", "name": "Bridge Point B"},
        {"id": "c", "name": "Connector C"},
        {"id": "d", "name": "Bridge Point D"},
        {"id": "e1", "name": "Node E1"},
        {"id": "e2", "name": "Node E2"}
    ]
    # Triangle a1 <-> a2 <-> b <-> a1 connected to c, c connected to d, d connected to e1 <-> e2 <-> d <-> e1
    relations = [
        {"source": "a1", "target": "a2", "type": "CONNECTED_TO", "weight": 1.0},
        {"source": "a2", "target": "a1", "type": "CONNECTED_TO", "weight": 1.0},
        {"source": "a2", "target": "b", "type": "CONNECTED_TO", "weight": 1.0},
        {"source": "b", "target": "a2", "type": "CONNECTED_TO", "weight": 1.0},
        {"source": "b", "target": "a1", "type": "CONNECTED_TO", "weight": 1.0},
        {"source": "a1", "target": "b", "type": "CONNECTED_TO", "weight": 1.0},

        {"source": "b", "target": "c", "type": "BRIDGES_TO", "weight": 1.0},
        {"source": "c", "target": "d", "type": "BRIDGES_TO", "weight": 1.0},

        {"source": "d", "target": "e1", "type": "CONNECTED_TO", "weight": 1.0},
        {"source": "e1", "target": "d", "type": "CONNECTED_TO", "weight": 1.0},
        {"source": "e1", "target": "e2", "type": "CONNECTED_TO", "weight": 1.0},
        {"source": "e2", "target": "e1", "type": "CONNECTED_TO", "weight": 1.0},
        {"source": "e2", "target": "d", "type": "CONNECTED_TO", "weight": 1.0},
        {"source": "d", "target": "e2", "type": "CONNECTED_TO", "weight": 1.0},
    ]

    compressed = compressor.compress_graph(nodes, relations)

    assert "nodes" in compressed
    assert "edges" in compressed
    assert "diagnostics" in compressed
    assert compressed["compression_ratio"] < 1.0

    comp_nodes = compressed["nodes"]
    # Check that articulation point 'c' is preserved as a connector
    c_nodes = [n for n in comp_nodes if n["id"] == "c"]
    assert len(c_nodes) == 1
    assert c_nodes[0]["is_connector"] is True
    assert c_nodes[0]["is_supernode"] is False

    # Check supernodes have member mappings
    supernodes = [n for n in comp_nodes if n["is_supernode"]]
    assert len(supernodes) >= 1
    for sn in supernodes:
        assert len(sn["member_node_ids"]) > 1
        assert "member_nodes" in sn

def test_giant_scc_alerting():
    """Verify that giant SCCs exceeding threshold trigger diagnostics with mitigation recommendations."""
    # Graph with 10 nodes where 8 form one giant SCC cycle
    nodes = [{"id": f"n{i}", "name": f"Node {i}"} for i in range(10)]
    relations = []
    # 8-node cycle
    for i in range(8):
        relations.append({"source": f"n{i}", "target": f"n{(i+1)%8}"})
    # 2 trailing nodes
    relations.append({"source": "n0", "target": "n8"})
    relations.append({"source": "n8", "target": "n9"})

    sccs, diag = compressor.analyze_scc_distribution(nodes, relations)
    assert diag.has_giant_scc is True
    assert diag.max_scc_ratio >= 0.30
    assert diag.mitigation_strategy is not None
