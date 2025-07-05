import { Component, OnInit, ElementRef, ViewChild, Input, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';
import * as d3 from 'd3';

export interface GraphNode {
  id: string;
  label: string;
  group: string;
  payload?: any;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

@Component({
  selector: 'app-network-graph-optimized',
  standalone: true,
  imports: [],
  template: `
    <div class="network-graph-container">
      <canvas #graphCanvas class="graph-canvas"></canvas>
      <div class="zoom-controls">
        <button class="zoom-btn" (click)="zoomIn()" title="Zoom In">+</button>
        <button class="zoom-btn" (click)="zoomOut()" title="Zoom Out">−</button>
        <button class="zoom-btn" (click)="resetZoom()" title="Reset Zoom">⟲</button>
        <button class="zoom-btn" (click)="fitToScreen()" title="Fit to Screen">⊡</button>
      </div>
      <div class="info-panel">
        <div>Nodes: {{ data.nodes.length }}</div>
        <div>Links: {{ data.links.length }}</div>
        <div>FPS: {{ fps.toFixed(1) }}</div>
      </div>
    </div>
  `,
  styles: [`
    .network-graph-container {
      width: 100%;
      height: 100%;
      position: relative;
      overflow: hidden;
    }

    .graph-canvas {
      width: 100%;
      height: 100%;
      cursor: grab;
      background: #f9f9f9;
    }

    .graph-canvas:active {
      cursor: grabbing;
    }

    .zoom-controls {
      position: absolute;
      top: 10px;
      right: 10px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      z-index: 10;
    }

    .zoom-btn {
      width: 32px;
      height: 32px;
      border: 1px solid #ddd;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .zoom-btn:hover {
      background: #f5f5f5;
      border-color: #999;
      transform: scale(1.05);
    }

    .zoom-btn:active {
      transform: scale(0.95);
    }

    .info-panel {
      position: absolute;
      bottom: 10px;
      left: 10px;
      background: rgba(255, 255, 255, 0.9);
      padding: 10px;
      border-radius: 4px;
      font-size: 12px;
      font-family: monospace;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
  `]
})
export class NetworkGraphOptimizedComponent implements OnInit, OnChanges, AfterViewInit {
  @ViewChild('graphCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @Input() data: GraphData = { nodes: [], links: [] };
  @Input() width: number = 800;
  @Input() height: number = 600;

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private simulation!: d3.Simulation<GraphNode, GraphLink>;
  private transform = d3.zoomIdentity;
  private color!: d3.ScaleOrdinal<string, string>;
  
  // Performance tracking
  fps: number = 0;
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  
  // Interaction state
  private isDragging = false;
  private dragNode: GraphNode | null = null;
  private mousePos = { x: 0, y: 0 };
  
  // Level of detail thresholds
  private readonly LOD_THRESHOLD_LABELS = 0.5;
  private readonly LOD_THRESHOLD_SMALL_NODES = 0.3;
  private readonly MIN_NODE_SIZE = 2;
  private readonly MAX_NODES_FULL_RENDER = 1000;

  ngOnInit() {
    this.initializeCanvas();
    this.initializeSimulation();
  }

  ngAfterViewInit() {
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['data'] && !changes['data'].firstChange) {
      this.updateGraph();
    }
  }

  private initializeCanvas() {
    this.canvas = this.canvasRef.nativeElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.color = d3.scaleOrdinal(d3.schemeCategory10);
    
    // Set up mouse events
    this.setupMouseEvents();
    
    // Set up zoom
    this.setupZoom();
  }

  private resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.width = rect.width;
    this.height = rect.height;
    
    if (this.simulation) {
      this.simulation.force('center', d3.forceCenter(this.width / 2, this.height / 2));
      this.render();
    }
  }

  private setupMouseEvents() {
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this.onMouseUp());
    this.canvas.addEventListener('mouseleave', () => this.onMouseUp());
  }

  private setupZoom() {
    const zoom = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 10])
      .wheelDelta((event) => {
        // Custom wheel delta for smoother zooming
        return -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002);
      })
      .filter((event) => {
        // Allow all events except when dragging a node
        return !this.isDragging;
      })
      .on('zoom', (event) => {
        // Prevent default browser zoom
        if (event.sourceEvent) {
          event.sourceEvent.preventDefault();
        }
        this.transform = event.transform;
        this.render();
      });

    // Store zoom behavior for later use
    (this as any).zoomBehavior = zoom;

    d3.select(this.canvas).call(zoom as any);
  }

  private initializeSimulation() {
    // Use different force strengths based on node count
    const nodeCount = this.data.nodes.length;
    const chargeStrength = nodeCount > 1000 ? -10 : nodeCount > 500 ? -30 : -100;
    const linkDistance = nodeCount > 1000 ? 30 : nodeCount > 500 ? 50 : 100;
    
    this.simulation = d3.forceSimulation<GraphNode>(this.data.nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(this.data.links)
        .id((d) => d.id)
        .distance(linkDistance))
      .force('charge', d3.forceManyBody().strength(chargeStrength))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2))
      .force('collision', d3.forceCollide().radius(5))
      .alphaDecay(0.02) // Faster convergence
      .velocityDecay(0.4); // More damping

    this.simulation.on('tick', () => this.render());
    
    // Start rendering loop
    this.animate();
  }

  private updateGraph() {
    if (!this.simulation) return;
    
    // Update simulation with new data
    this.simulation.nodes(this.data.nodes);
    this.simulation.force('link', d3.forceLink<GraphNode, GraphLink>(this.data.links)
      .id((d) => d.id));
    
    // Reheat the simulation
    this.simulation.alpha(1).restart();
  }

  private animate() {
    requestAnimationFrame(() => {
      this.updateFPS();
      this.animate();
    });
  }

  private updateFPS() {
    const now = performance.now();
    if (now - this.lastFrameTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFrameTime = now;
    }
    this.frameCount++;
  }

  private render() {
    const ctx = this.ctx;
    const transform = this.transform;
    
    // Clear canvas
    ctx.save();
    ctx.clearRect(0, 0, this.width, this.height);
    
    // Apply zoom transform
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);
    
    // Calculate level of detail
    const scale = transform.k;
    const showLabels = scale > this.LOD_THRESHOLD_LABELS;
    const showSmallNodes = scale > this.LOD_THRESHOLD_SMALL_NODES;
    
    // Render links (only if not too many)
    if (this.data.links.length < 5000 || scale > 0.5) {
      ctx.globalAlpha = Math.min(0.6, scale);
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 1 / scale;
      
      this.data.links.forEach(link => {
        const source = link.source as GraphNode;
        const target = link.target as GraphNode;
        
        if (source.x !== undefined && source.y !== undefined && 
            target.x !== undefined && target.y !== undefined) {
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
        }
      });
    }
    
    // Render nodes
    ctx.globalAlpha = 1;
    
    // Use different rendering strategies based on node count
    if (this.data.nodes.length > this.MAX_NODES_FULL_RENDER && !showSmallNodes) {
      // Render as single pixels for massive datasets when zoomed out
      ctx.fillStyle = '#666';
      this.data.nodes.forEach(node => {
        if (node.x !== undefined && node.y !== undefined) {
          ctx.fillRect(node.x - 1, node.y - 1, 2, 2);
        }
      });
    } else {
      // Regular node rendering
      this.data.nodes.forEach(node => {
        if (node.x === undefined || node.y === undefined) return;
        
        const nodeSize = Math.max(this.MIN_NODE_SIZE, 5 / Math.sqrt(scale));
        
        // Draw node
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
        ctx.fillStyle = this.color(node.group);
        ctx.fill();
        
        // Draw border for larger nodes
        if (showSmallNodes) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1 / scale;
          ctx.stroke();
        }
        
        // Draw labels for nearby nodes
        if (showLabels && this.isNodeNearMouse(node)) {
          ctx.fillStyle = '#333';
          ctx.font = `${12 / scale}px Arial`;
          ctx.fillText(node.label, node.x + nodeSize + 2, node.y + 4);
        }
      });
    }
    
    // Highlight dragged node
    if (this.dragNode && this.dragNode.x !== undefined && this.dragNode.y !== undefined) {
      ctx.beginPath();
      ctx.arc(this.dragNode.x, this.dragNode.y, 8 / scale, 0, 2 * Math.PI);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 3 / scale;
      ctx.stroke();
    }
    
    ctx.restore();
  }

  private isNodeNearMouse(node: GraphNode): boolean {
    if (node.x === undefined || node.y === undefined) return false;
    const dx = node.x - this.mousePos.x;
    const dy = node.y - this.mousePos.y;
    return Math.sqrt(dx * dx + dy * dy) < 50;
  }

  private getNodeAtPosition(x: number, y: number): GraphNode | null {
    const point = this.transform.invert([x, y]);
    const threshold = 10 / this.transform.k;
    
    for (const node of this.data.nodes) {
      if (node.x === undefined || node.y === undefined) continue;
      const dx = node.x - point[0];
      const dy = node.y - point[1];
      if (Math.sqrt(dx * dx + dy * dy) < threshold) {
        return node;
      }
    }
    return null;
  }

  private onMouseDown(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const node = this.getNodeAtPosition(x, y);
    if (node) {
      // Prevent d3 zoom from handling this event
      event.stopPropagation();
      this.isDragging = true;
      this.dragNode = node;
      this.simulation.alphaTarget(0.3).restart();
      node.fx = node.x;
      node.fy = node.y;
      
      // Temporarily disable zoom while dragging a node
      d3.select(this.canvas).on('.zoom', null);
    }
  }

  private onMouseMove(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Update mouse position for label rendering
    const point = this.transform.invert([x, y]);
    this.mousePos.x = point[0];
    this.mousePos.y = point[1];
    
    if (this.isDragging && this.dragNode) {
      this.dragNode.fx = point[0];
      this.dragNode.fy = point[1];
      this.render();
    }
    
    // Change cursor on hover
    const node = this.getNodeAtPosition(x, y);
    this.canvas.style.cursor = node ? 'pointer' : 'grab';
  }

  private onMouseUp() {
    if (this.dragNode) {
      this.simulation.alphaTarget(0);
      this.dragNode.fx = null;
      this.dragNode.fy = null;
      
      // Re-enable zoom after dragging
      const zoomBehavior = (this as any).zoomBehavior;
      if (zoomBehavior) {
        d3.select(this.canvas).call(zoomBehavior);
      }
    }
    this.isDragging = false;
    this.dragNode = null;
  }

  // Zoom control methods
  public zoomIn() {
    const zoomBehavior = (this as any).zoomBehavior;
    if (!zoomBehavior) return;
    
    d3.select(this.canvas)
      .transition()
      .duration(300)
      .call(zoomBehavior.scaleBy, 1.5);
  }

  public zoomOut() {
    const zoomBehavior = (this as any).zoomBehavior;
    if (!zoomBehavior) return;
    
    d3.select(this.canvas)
      .transition()
      .duration(300)
      .call(zoomBehavior.scaleBy, 0.67);
  }

  public resetZoom() {
    const zoomBehavior = (this as any).zoomBehavior;
    if (!zoomBehavior) return;
    
    d3.select(this.canvas)
      .transition()
      .duration(300)
      .call(zoomBehavior.transform, d3.zoomIdentity);
  }

  public fitToScreen() {
    const zoomBehavior = (this as any).zoomBehavior;
    if (!zoomBehavior || !this.data.nodes.length) return;
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    this.data.nodes.forEach(node => {
      if (node.x !== undefined && node.y !== undefined) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x);
        maxY = Math.max(maxY, node.y);
      }
    });
    
    const width = maxX - minX;
    const height = maxY - minY;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    
    const scale = 0.9 / Math.max(width / this.width, height / this.height);
    const translate = [this.width / 2 - scale * midX, this.height / 2 - scale * midY];
    
    d3.select(this.canvas)
      .transition()
      .duration(750)
      .call(zoomBehavior.transform, 
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
  }
}