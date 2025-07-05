import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { NetworkGraphFullscreenComponent, GraphData } from './components/network-graph-fullscreen/network-graph-fullscreen.component';
import { QdrantService } from './services/qdrant.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, HttpClientModule, NetworkGraphFullscreenComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  Math = Math; // Expose Math to template
  title = 'Context Visibility Base';
  graphData: GraphData = { nodes: [], links: [] };
  collections: any[] = [];
  selectedCollection: string = '';
  isLoading = false;
  selectedNodeDetails: any = null;
  showNodeDetails = false;
  selectedNodes: any[] = [];

  constructor(private qdrantService: QdrantService) {}

  ngOnInit() {
    this.loadCollections();
    this.generateSampleData();
  }

  loadCollections() {
    this.isLoading = true;
    this.qdrantService.getCollections().subscribe({
      next: (response) => {
        this.collections = response.collections;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading collections:', error);
        this.isLoading = false;
      }
    });
  }

  onCollectionChange(collectionName: string) {
    this.selectedCollection = collectionName;
    this.loadCollectionData(collectionName);
  }

  loadCollectionData(collectionName: string) {
    this.isLoading = true;
    // Use clustered data based on vector similarity - more clusters for better granularity
    this.qdrantService.getClusteredData(collectionName, 2000, 16).subscribe({
      next: (response) => {
        this.graphData = {
          nodes: response.nodes,
          links: response.links,
          clusters: response.clusters,
          clusterCenters: response.clusterCenters
        } as any;
        console.log('Cluster stats:', response.clusterStats);
        console.log('Clusters:', response.clusters);
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading clustered data:', error);
        // Fallback to regular points if clustering fails
        this.loadRegularData(collectionName);
      }
    });
  }

  private loadRegularData(collectionName: string) {
    this.qdrantService.getPoints(collectionName, 10000).subscribe({
      next: (response) => {
        this.convertPointsToGraphData(response.points);
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading collection data:', error);
        this.isLoading = false;
      }
    });
  }

  private convertPointsToGraphData(points: any[]) {
    const nodes = points.map(point => ({
      id: point.id.toString(),
      label: point.payload?.metadata?.title || point.payload?.title || point.payload?.name || `Point ${point.id}`,
      group: point.payload?.metadata?.domain || point.payload?.category || 'default',
      payload: point.payload
    }));

    // Create links based on similarity or relationships
    // For large datasets, create fewer links to maintain performance
    const links = [];
    const maxLinks = Math.min(points.length * 2, 5000); // Cap at 5000 links
    const linksPerNode = Math.max(1, Math.min(5, 50000 / points.length));
    
    for (let i = 0; i < points.length && links.length < maxLinks; i++) {
      // Create a few random connections per node
      for (let j = 0; j < linksPerNode; j++) {
        const randomTarget = Math.floor(Math.random() * points.length);
        if (i !== randomTarget) {
          links.push({
            source: points[i].id.toString(),
            target: points[randomTarget].id.toString(),
            value: Math.random() * 10
          });
        }
      }
    }

    this.graphData = { nodes, links };
  }

  onNodeClick(event: {nodeId: string, collectionName: string}) {
    this.loadNodeDetails(event.nodeId, event.collectionName);
  }

  loadNodeDetails(nodeId: string, collectionName: string) {
    this.qdrantService.getPointDetails(collectionName, nodeId).subscribe({
      next: (details) => {
        this.selectedNodeDetails = details;
        this.showNodeDetails = true;
      },
      error: (error) => {
        console.error('Error loading node details:', error);
      }
    });
  }

  closeNodeDetails() {
    this.showNodeDetails = false;
    this.selectedNodeDetails = null;
  }

  onSelectionChange(nodes: any[]) {
    this.selectedNodes = nodes;
  }

  private generateSampleData() {
    this.graphData = {
      nodes: [
        { id: '1', label: 'Document A', group: 'documents' },
        { id: '2', label: 'Document B', group: 'documents' },
        { id: '3', label: 'Concept X', group: 'concepts' },
        { id: '4', label: 'Concept Y', group: 'concepts' },
        { id: '5', label: 'Entity Z', group: 'entities' }
      ],
      links: [
        { source: '1', target: '3', value: 5 },
        { source: '1', target: '4', value: 3 },
        { source: '2', target: '3', value: 7 },
        { source: '2', target: '5', value: 2 },
        { source: '3', target: '4', value: 4 },
        { source: '4', target: '5', value: 6 }
      ]
    };
  }
}
