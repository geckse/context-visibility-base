import { Component, OnInit, ElementRef, ViewChild, Input, OnChanges, SimpleChanges } from '@angular/core';
import * as d3 from 'd3';

export interface GraphNode {
  id: string;
  label: string;
  group: string;
  payload?: any;
}

export interface GraphLink {
  source: string;
  target: string;
  value: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

@Component({
  selector: 'app-network-graph',
  standalone: true,
  imports: [],
  templateUrl: './network-graph.component.html',
  styleUrls: ['./network-graph.component.scss']
})
export class NetworkGraphComponent implements OnInit, OnChanges {
  @ViewChild('graphContainer', { static: true }) graphContainer!: ElementRef;
  @Input() data: GraphData = { nodes: [], links: [] };
  @Input() width: number = 800;
  @Input() height: number = 600;

  private svg: any;
  private g: any; // Container group for zoom
  private simulation: any;
  private nodes: any;
  private links: any;
  private color: any;
  private zoom: any;

  ngOnInit() {
    this.initializeGraph();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['data'] && !changes['data'].firstChange) {
      this.updateGraph();
    }
  }

  private initializeGraph() {
    this.svg = d3.select(this.graphContainer.nativeElement)
      .append('svg')
      .attr('width', this.width)
      .attr('height', this.height);

    // Create container group for zoom
    this.g = this.svg.append('g');

    // Set up zoom behavior
    this.zoom = d3.zoom()
      .scaleExtent([0.1, 10]) // Min and max zoom levels
      .on('zoom', (event) => {
        this.g.attr('transform', event.transform);
      });

    // Apply zoom behavior to svg
    this.svg.call(this.zoom);

    this.color = d3.scaleOrdinal(d3.schemeCategory10);

    this.simulation = d3.forceSimulation()
      .force('link', d3.forceLink().id((d: any) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2))
      .force('collision', d3.forceCollide().radius(20));

    this.updateGraph();
  }

  private updateGraph() {
    if (!this.svg || !this.data || !this.g) return;

    // Clear only the container group content
    this.g.selectAll('*').remove();

    const linkData = this.data.links.map(d => ({
      source: d.source,
      target: d.target,
      value: d.value
    }));

    const nodeData = this.data.nodes.map(d => ({
      id: d.id,
      label: d.label,
      group: d.group,
      payload: d.payload
    }));

    this.links = this.g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(linkData)
      .enter().append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', (d: any) => Math.sqrt(d.value));

    this.nodes = this.g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodeData)
      .enter().append('g')
      .call(this.drag() as any);

    this.nodes.append('circle')
      .attr('r', 8)
      .attr('fill', (d: any) => this.color(d.group))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    this.nodes.append('text')
      .text((d: any) => d.label)
      .attr('x', 12)
      .attr('y', 4)
      .attr('font-size', '12px')
      .attr('font-family', 'Arial, sans-serif');

    this.nodes.append('title')
      .text((d: any) => `${d.label} (${d.group})`);

    this.simulation.nodes(nodeData).on('tick', () => this.ticked());
    this.simulation.force('link').links(linkData);
    this.simulation.alpha(1).restart();
  }

  private ticked() {
    this.links
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y);

    this.nodes
      .attr('transform', (d: any) => `translate(${d.x},${d.y})`);
  }

  private drag() {
    return d3.drag()
      .on('start', (event: any, d: any) => {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event: any, d: any) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event: any, d: any) => {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  // Public methods for zoom control
  public zoomIn() {
    this.svg.transition().duration(300).call(this.zoom.scaleBy, 1.5);
  }

  public zoomOut() {
    this.svg.transition().duration(300).call(this.zoom.scaleBy, 0.67);
  }

  public resetZoom() {
    this.svg.transition().duration(300).call(this.zoom.transform, d3.zoomIdentity);
  }

  public fitToScreen() {
    if (!this.g || !this.data || this.data.nodes.length === 0) return;

    // Get the bounding box of all elements
    const bounds = this.g.node().getBBox();
    const width = bounds.width;
    const height = bounds.height;
    const midX = bounds.x + width / 2;
    const midY = bounds.y + height / 2;

    // Calculate scale to fit
    const scale = 0.9 / Math.max(width / this.width, height / this.height);
    const translate = [this.width / 2 - scale * midX, this.height / 2 - scale * midY];

    this.svg.transition().duration(750).call(
      this.zoom.transform,
      d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
    );
  }
}