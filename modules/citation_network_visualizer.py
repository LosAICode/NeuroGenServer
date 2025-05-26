"""
Citation Network Visualizer - Visualize citation networks from the Academic API.

This module provides utilities to render citation networks as interactive
visualizations using Plotly or NetworkX+Matplotlib.
"""

import json
import argparse
import os
from typing import Dict, Any, List, Optional
from datetime import datetime

# Optional imports - to avoid hard dependencies
try:
    import networkx as nx
    networkx_available = True
except ImportError:
    networkx_available = False
    print("Warning: NetworkX is not available. Install with 'pip install networkx'")

try:
    import matplotlib.pyplot as plt
    matplotlib_available = True
except ImportError:
    matplotlib_available = False
    print("Warning: Matplotlib is not available. Install with 'pip install matplotlib'")

try:
    import plotly.graph_objects as go
    import plotly.express as px
    plotly_available = True
except ImportError:
    plotly_available = False
    print("Warning: Plotly is not available. Install with 'pip install plotly'")
    # Create dummy class to avoid NameError
    class DummyModule:
        class Figure:
            pass
    go = DummyModule()

# Conditionally import academic_api_client with error handling
try:
    from academic_api_client import AcademicApiClient
    academic_api_client_available = True
except ImportError:
    academic_api_client_available = False
    print("Warning: AcademicApiClient is not available. Install or implement it.")
    # Create placeholder class
    class AcademicApiClient:
        def __init__(self, *args, **kwargs):
            pass
        def get_paper_citations(self, *args, **kwargs):
            return {"error": "AcademicApiClient not available"}

class CitationNetworkVisualizer:
    """Visualize citation networks from the Academic API."""
    
    def __init__(self, client: Optional[AcademicApiClient] = None, output_dir: str = "visualizations"):
        """
        Initialize the visualizer.
        
        Args:
            client: Optional API client instance
            output_dir: Directory for visualization outputs
        """
        # Initialize client if available
        self.client = client if client and academic_api_client_available else None
        if not self.client and academic_api_client_available:
            self.client = AcademicApiClient()
            
        # Setup output directory
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Check available visualization libraries
        self.libraries = {
            "networkx": networkx_available,
            "matplotlib": matplotlib_available,
            "plotly": plotly_available
        }
        
        # Default colors for node types
        self.node_colors = {
            "main": "#ff7700",  # Orange for the main paper
            "citing": "#77aaff",  # Blue for citing papers
            "cited": "#ff77aa",  # Pink for cited papers
            "related": "#77ff77"  # Green for related papers
        }
    
    def fetch_citation_network(self, paper_id: str, source: str = "arxiv", depth: int = 1) -> Dict:
        """
        Fetch citation data for a paper.
        
        Args:
            paper_id: Unique identifier for the paper
            source: Source platform (arxiv, semantic, openalex)
            depth: Depth of citation analysis
            
        Returns:
            Citation analysis dictionary
        """
        if not self.client:
            return {"error": "API client not available"}
        
        try:
            return self.client.get_paper_citations(paper_id, source, depth)
        except Exception as e:
            return {"error": f"Failed to fetch citation network: {str(e)}"}
    
    def create_networkx_graph(self, citation_data: Dict) -> Optional[nx.Graph]:
        """
        Create a NetworkX graph from citation data.
        
        Args:
            citation_data: Citation analysis dictionary from the API
            
        Returns:
            NetworkX graph object or None if NetworkX is not available
        """
        if not networkx_available:
            print("NetworkX is not available. Please install with 'pip install networkx'.")
            return None
        
        try:
            # Create directed graph
            G = nx.DiGraph()
            
            # Extract network data
            network = citation_data.get("citation_network", {})
            nodes = network.get("nodes", [])
            links = network.get("links", [])
            
            # Add nodes
            for node in nodes:
                G.add_node(
                    node["id"],
                    label=node.get("label", node["id"]),
                    type=node.get("type", "unknown"),
                    year=node.get("year", "")
                )
            
            # Add edges
            for link in links:
                G.add_edge(
                    link["source"],
                    link["target"],
                    type=link.get("type", "cites")
                )
            
            return G
        except Exception as e:
            print(f"Error creating NetworkX graph: {e}")
            return None
    
    def visualize_with_matplotlib(self, citation_data: Dict, output_file: Optional[str] = None) -> str:
        """
        Visualize the citation network using NetworkX and Matplotlib.
        
        Args:
            citation_data: Citation analysis dictionary from the API
            output_file: Optional path to save the visualization image
            
        Returns:
            Path to the saved image or empty string if visualization failed
        """
        if not networkx_available or not matplotlib_available:
            print("NetworkX and Matplotlib are required. Install with 'pip install networkx matplotlib'.")
            return ""
        
        try:
            # Create graph
            G = self.create_networkx_graph(citation_data)
            if not G:
                return ""
            
            # Create figure
            plt.figure(figsize=(12, 8))
            
            # Define node colors based on type
            node_colors = []
            for node, attrs in G.nodes(data=True):
                node_type = attrs.get("type", "related")
                node_colors.append(self.node_colors.get(node_type, "#aaaaaa"))
            
            # Define layout - spring layout often works well for citation networks
            pos = nx.spring_layout(G, seed=42)
            
            # Draw nodes
            nx.draw_networkx_nodes(
                G, pos, 
                node_color=node_colors,
                node_size=500,
                alpha=0.8
            )
            
            # Draw edges
            nx.draw_networkx_edges(
                G, pos,
                width=1.0,
                alpha=0.5,
                arrows=True,
                arrowstyle='-|>',
                arrowsize=15
            )
            
            # Draw labels
            nx.draw_networkx_labels(
                G, pos,
                font_size=10,
                font_family='sans-serif'
            )
            
            # Add legend
            legend_elements = [
                plt.Line2D([0], [0], marker='o', color='w', markerfacecolor=color, markersize=10, label=node_type)
                for node_type, color in self.node_colors.items()
            ]
            plt.legend(handles=legend_elements, loc='upper right')
            
            # Set title
            paper_title = citation_data.get("paper_title", "Citation Network")
            plt.title(f"Citation Network: {paper_title}", fontsize=14)
            
            # Remove axes
            plt.axis('off')
            
            # Generate output file if not provided
            if not output_file:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                output_file = os.path.join(self.output_dir, f"citation_network_{timestamp}.png")
            
            # Create output directory if it doesn't exist
            os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
            
            # Save the figure
            plt.savefig(output_file, bbox_inches='tight', dpi=300)
            print(f"Visualization saved to {output_file}")
            plt.close()
            
            return output_file
            
        except Exception as e:
            print(f"Error visualizing with matplotlib: {e}")
            plt.close()
            return ""
    
    def visualize_with_plotly(self, citation_data: Dict, output_file: Optional[str] = None, show: bool = True) -> Optional[go.Figure]:
        """
        Create an interactive visualization of the citation network using Plotly.
        
        Args:
            citation_data: Citation analysis dictionary from the API
            output_file: Optional path to save the visualization as HTML
            show: Whether to show the plot in the browser
            
        Returns:
            Plotly figure object or None if Plotly is not available
        """
        if not plotly_available:
            print("Plotly is not available. Please install with 'pip install plotly'.")
            return None
        
        try:
            # Extract network data
            network = citation_data.get("citation_network", {})
            nodes = network.get("nodes", [])
            links = network.get("links", [])
            
            if not nodes or not links:
                print("No citation network data found.")
                return None
            
            # Create node lookup for edge references
            node_lookup = {node['id']: i for i, node in enumerate(nodes)}
            
            # Create edge traces
            edge_x = []
            edge_y = []
            edge_text = []
            
            # Create a layout for nodes (we'll use Fruchterman-Reingold algorithm)
            if networkx_available:
                G = self.create_networkx_graph(citation_data)
                pos = nx.spring_layout(G, seed=42)
                
                # Update node positions based on layout
                for node in nodes:
                    node_id = node['id']
                    if node_id in pos:
                        node['x'] = pos[node_id][0] * 10  # Scale for visibility
                        node['y'] = pos[node_id][1] * 10
            else:
                # Simple circular layout if NetworkX not available
                import math
                num_nodes = len(nodes)
                for i, node in enumerate(nodes):
                    angle = 2 * math.pi * i / num_nodes
                    node['x'] = 10 * math.cos(angle)
                    node['y'] = 10 * math.sin(angle)
            
            # Create edges using node positions
            for link in links:
                source_idx = node_lookup.get(link['source'])
                target_idx = node_lookup.get(link['target'])
                
                if source_idx is not None and target_idx is not None:
                    source = nodes[source_idx]
                    target = nodes[target_idx]
                    
                    # Plot a line from source to target
                    edge_x.append(source.get('x', 0))
                    edge_x.append(target.get('x', 0))
                    edge_x.append(None)  # Create a break in the line
                    
                    edge_y.append(source.get('y', 0))
                    edge_y.append(target.get('y', 0))
                    edge_y.append(None)
                    
                    edge_text.append(f"{source.get('label', source['id'])} → {target.get('label', target['id'])}")
            
            # Create edge trace
            edge_trace = go.Scatter(
                x=edge_x, y=edge_y,
                line=dict(width=0.5, color='#888'),
                hoverinfo='none',
                mode='lines'
            )
            
            # Create node traces for each node type
            node_traces = {}
            
            for node_type, color in self.node_colors.items():
                node_traces[node_type] = go.Scatter(
                    x=[], y=[],
                    text=[],
                    mode='markers',
                    hoverinfo='text',
                    marker=dict(
                        color=color,
                        size=15,
                        line=dict(width=2, color='white')
                    ),
                    name=node_type
                )
            
            # Add fallback trace for unknown node types
            node_traces['unknown'] = go.Scatter(
                x=[], y=[],
                text=[],
                mode='markers',
                hoverinfo='text',
                marker=dict(
                    color='#aaaaaa',
                    size=15,
                    line=dict(width=2, color='white')
                ),
                name='unknown'
            )
            
            # Add nodes to appropriate traces
            for node in nodes:
                node_type = node.get('type', 'unknown')
                if node_type not in node_traces:
                    node_type = 'unknown'
                    
                trace = node_traces[node_type]
                
                trace['x'] = trace['x'] + (node.get('x', 0),)
                trace['y'] = trace['y'] + (node.get('y', 0),)
                
                node_info = f"{node.get('label', node['id'])}<br>"
                if 'year' in node:
                    node_info += f"Year: {node['year']}<br>"
                
                trace['text'] = trace['text'] + (node_info,)
            
            # Create figure
            fig = go.Figure(
                data=[edge_trace] + list(node_traces.values()),
                layout=go.Layout(
                    title=f"Citation Network: {citation_data.get('paper_title', '')}",
                    titlefont_size=16,
                    showlegend=True,
                    hovermode='closest',
                    margin=dict(b=20, l=5, r=5, t=40),
                    xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
                    yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
                    paper_bgcolor='rgba(0,0,0,0)',
                    plot_bgcolor='rgba(0,0,0,0)',
                )
            )
            
            # Improve layout
            fig.update_layout(
                annotations=[
                    dict(
                        text=f"Total Citations: {citation_data.get('total_citations', 'Unknown')}",
                        showarrow=False,
                        xref="paper", yref="paper",
                        x=0.01, y=0.01
                    )
                ]
            )
            
            # Generate output file if not provided
            if not output_file:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                output_file = os.path.join(self.output_dir, f"interactive_citation_network_{timestamp}.html")
            
            # Create output directory if it doesn't exist
            os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
            
            # Save to HTML file if requested
            fig.write_html(output_file)
            print(f"Interactive visualization saved to {output_file}")
            
            # Show the plot in the default web browser
            if show:
                fig.show()
            
            return fig
            
        except Exception as e:
            print(f"Error visualizing with plotly: {e}")
            return None
    
    def visualize_citation_data(self, citation_data: Dict, output_format: str = "both") -> Dict[str, str]:
        """
        Visualize citation data using the preferred format.
        
        Args:
            citation_data: Citation analysis dictionary from the API
            output_format: Visualization format ("matplotlib", "plotly", "both")
            
        Returns:
            Dictionary with paths to generated visualizations
        """
        outputs = {}
        
        if output_format in ["matplotlib", "both"]:
            if matplotlib_available and networkx_available:
                static_path = self.visualize_with_matplotlib(citation_data)
                if static_path:
                    outputs["static"] = static_path
            else:
                print("Static visualization requires matplotlib and networkx.")
        
        if output_format in ["plotly", "both"]:
            if plotly_available:
                interactive_fig = self.visualize_with_plotly(citation_data, show=False)
                if interactive_fig:
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    interactive_path = os.path.join(self.output_dir, f"interactive_citation_network_{timestamp}.html")
                    interactive_fig.write_html(interactive_path)
                    outputs["interactive"] = interactive_path
            else:
                print("Interactive visualization requires plotly.")
        
        return outputs

# Command-line interface
def main():
    """Command-line interface for the citation network visualizer."""
    parser = argparse.ArgumentParser(description="Visualize citation networks from Academic API")
    parser.add_argument("paper_id", help="Paper ID to analyze (e.g., arXiv ID)")
    parser.add_argument("--source", default="arxiv", help="Source platform (default: arxiv)")
    parser.add_argument("--depth", type=int, default=1, help="Citation analysis depth (default: 1)")
    parser.add_argument("--output", help="Output file path")
    parser.add_argument("--format", choices=["matplotlib", "plotly", "both"], default="both", help="Visualization format")
    parser.add_argument("--api-key", help="API key for the Academic API")
    parser.add_argument("--api-url", default="http://localhost:5001", help="Base URL for the Academic API")
    parser.add_argument("--output-dir", default="visualizations", help="Output directory for visualizations")
    
    args = parser.parse_args()
    
    try:
        # Create API client if available
        client = None
        if academic_api_client_available:
            client = AcademicApiClient(
                base_url=args.api_url,
                api_key=args.api_key
            )
        
        # Create visualizer
        visualizer = CitationNetworkVisualizer(client, output_dir=args.output_dir)
        
        # Check if required visualization libraries are available
        if args.format == "matplotlib" and not (networkx_available and matplotlib_available):
            print("Error: matplotlib visualization requires NetworkX and Matplotlib.")
            print("Install with: pip install networkx matplotlib")
            return 1
        
        if args.format == "plotly" and not plotly_available:
            print("Error: plotly visualization requires Plotly.")
            print("Install with: pip install plotly")
            return 1
        
        # Fetch citation data
        print(f"Fetching citation data for {args.paper_id}...")
        citation_data = visualizer.fetch_citation_network(args.paper_id, args.source, args.depth)
        
        if "error" in citation_data:
            print(f"Error: {citation_data['error']}")
            return 1
        
        print(f"Found {citation_data.get('total_citations', 0)} citations for paper: {citation_data.get('paper_title', args.paper_id)}")
        
        # Create visualization based on format
        print(f"Creating {args.format} visualization...")
        
        if args.format == "matplotlib":
            output_file = args.output
            static_path = visualizer.visualize_with_matplotlib(citation_data, output_file)
            if not static_path:
                print("Failed to create static visualization.")
                return 1
        elif args.format == "plotly":
            output_file = args.output
            if output_file and not output_file.lower().endswith(".html"):
                output_file += ".html"
            
            interactive_fig = visualizer.visualize_with_plotly(citation_data, output_file)
            if not interactive_fig:
                print("Failed to create interactive visualization.")
                return 1
        else:  # both
            outputs = visualizer.visualize_citation_data(citation_data)
            if not outputs:
                print("Failed to create visualizations.")
                return 1
            print(f"Created visualizations: {', '.join(outputs.keys())}")
        
        return 0
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    import sys
    sys.exit(main())