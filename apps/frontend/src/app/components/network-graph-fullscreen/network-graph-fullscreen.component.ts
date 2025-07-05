import { Component, OnInit, ElementRef, ViewChild, Input, OnChanges, SimpleChanges, AfterViewInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as d3 from 'd3';

export interface GraphNode {
  id: string;
  label: string;
  group: string;
  clusterId?: number;
  payload?: any;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  value: number;
}

export interface ClusterInfo {
  id: number;
  label: string;
  sublabels?: string[];
  size: number;
  tagCount?: number;
  tags?: { tag: string; count: number }[];
  level: number;
}

export interface ClusterCenter {
  id: number;
  x: number;
  y: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  clusters?: ClusterInfo[];
  clusterCenters?: ClusterCenter[];
}

@Component({
  selector: 'app-network-graph-fullscreen',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './network-graph-fullscreen.component.html',
  styleUrls: ['./network-graph-fullscreen.component.scss']
})
export class NetworkGraphFullscreenComponent implements OnInit, OnChanges, AfterViewInit {
  @ViewChild('graphCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('textInputContainer', { static: true }) textInputRef!: ElementRef<HTMLDivElement>;
  @Input() data: GraphData = { nodes: [], links: [] };
  @Input() collections: any[] = [];
  @Input() selectedCollection: string = '';
  @Input() isLoading: boolean = false;
  @Output() collectionChange = new EventEmitter<string>();
  @Output() nodeClick = new EventEmitter<{nodeId: string, collectionName: string}>();
  @Output() selectionChange = new EventEmitter<GraphNode[]>();

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private simulation!: d3.Simulation<GraphNode, GraphLink>;
  private transform = d3.zoomIdentity;
  private color!: d3.ScaleOrdinal<string, string>;
  private clusterColors!: d3.ScaleOrdinal<string, string>;
  private pastelColors: string[] = [];
  private clusterPalette: string[] = [];
  private groupCenters: Map<string, {x: number, y: number}> = new Map();
  
  // Component state
  searchText: string = '';
  selectedTool: string = 'pointer';
  isPanning: boolean = false;
  fps: number = 0;
  
  // Text input position
  textInputPosition = { x: 0, y: 0 };
  private isDraggingInput = false;
  private dragOffset = { x: 0, y: 0 };
  
  // Performance tracking
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  
  // Interaction state
  private isDragging = false;
  private dragNode: GraphNode | null = null;
  private mousePos = { x: 0, y: 0 };
  
  // Lasso selection state
  private isLassoActive = false;
  private lassoPath: {x: number, y: number}[] = [];
  private selectedNodes: Set<string> = new Set();
  
  // Search state
  private searchResults: Set<string> = new Set();
  
  // Canvas dimensions
  private width: number = 0;
  private height: number = 0;
  
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
    this.centerTextInput();
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.centerTextInput();
    });
    
    // Set up dragging for text input
    document.addEventListener('mousemove', (e) => this.onDocumentMouseMove(e));
    document.addEventListener('mouseup', () => this.onDocumentMouseUp());
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['data'] && !changes['data'].firstChange) {
      this.updateGraph();
    }
  }

  private centerTextInput() {
    const container = this.textInputRef.nativeElement.parentElement!;
    this.textInputPosition.x = (container.clientWidth - 350) / 2;
    this.textInputPosition.y = 50;
  }

  startDrag(event: MouseEvent) {
    // Only start drag if the target is the drag handle or container (not the input)
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT') {
      return; // Don't drag when clicking on the input
    }
    
    this.isDraggingInput = true;
    const rect = this.textInputRef.nativeElement.getBoundingClientRect();
    this.dragOffset.x = event.clientX - rect.left;
    this.dragOffset.y = event.clientY - rect.top;
    event.preventDefault();
  }

  private onDocumentMouseMove(event: MouseEvent) {
    if (this.isDraggingInput) {
      const container = this.textInputRef.nativeElement.parentElement!;
      const containerRect = container.getBoundingClientRect();
      this.textInputPosition.x = event.clientX - containerRect.left - this.dragOffset.x;
      this.textInputPosition.y = event.clientY - containerRect.top - this.dragOffset.y;
    }
  }

  private onDocumentMouseUp() {
    this.isDraggingInput = false;
  }

  selectTool(tool: string) {
    this.selectedTool = tool;
    // Clear selection when switching tools
    if (tool !== 'lasso') {
      this.clearSelection();
    }
  }

  togglePan() {
    this.isPanning = !this.isPanning;
    // Pan mode logic
  }

  onCollectionChange(collectionName: string) {
    this.collectionChange.emit(collectionName);
  }

  onSearchChange() {
    this.performSearch();
  }

  getSearchResultsCount(): number {
    return this.searchResults.size;
  }

  private initializeCanvas() {
    this.canvas = this.canvasRef.nativeElement;
    this.ctx = this.canvas.getContext('2d')!;
    
    // Initialize pastel color palette
    this.initializePastelColors();
    this.color = d3.scaleOrdinal(this.pastelColors);
    
    // Set up mouse events
    this.setupMouseEvents();
    
    // Set up zoom
    this.setupZoom();
  }

  private initializePastelColors() {
    // Get CSS custom properties for pastel colors
    const getProperty = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    
    this.pastelColors = [
      getProperty('--color-pastel-blue'),
      getProperty('--color-pastel-purple'),
      getProperty('--color-pastel-pink'),
      getProperty('--color-pastel-coral'),
      getProperty('--color-pastel-peach'),
      getProperty('--color-pastel-yellow'),
      getProperty('--color-pastel-mint'),
      getProperty('--color-pastel-sage'),
      getProperty('--color-pastel-lavender'),
      getProperty('--color-pastel-rose'),
      getProperty('--color-pastel-cream'),
      getProperty('--color-pastel-seafoam')
    ].filter(color => color !== ''); // Filter out any empty values
    
    // Fallback colors if CSS variables aren't available
    if (this.pastelColors.length === 0) {
      this.pastelColors = [
        '#a8d8ea', '#aa96da', '#fcbad3', '#ffb3ba',
        '#ffdfba', '#ffffba', '#baffc9', '#bae1ff',
        '#e0aaff', '#ffc9de', '#fff2cc', '#c7f0db'
      ];
    }
    
    // Initialize cluster color palette - more vibrant but still soft
    this.clusterPalette = [
      '#4A90E2', // Blue
      '#7B68EE', // Purple  
      '#FF6B6B', // Red
      '#4ECDC4', // Teal
      '#45B7D1', // Sky blue
      '#96CEB4', // Mint
      '#FFEAA7', // Yellow
      '#DDA0DD', // Plum
      '#98D8C8', // Seafoam
      '#F7DC6F', // Gold
      '#BB8FCE', // Lavender
      '#85C1E9', // Light blue
      '#F8C471', // Orange
      '#82E0AA', // Green
      '#F1948A', // Coral
      '#AED6F1'  // Powder blue
    ];
    
    this.clusterColors = d3.scaleOrdinal(this.clusterPalette);
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
        return -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002);
      })
      .filter((event) => {
        // Don't zoom if we're dragging, using lasso, or if it's a double-click on a node
        if (this.isDragging || this.selectedTool === 'lasso') return false;
        
        // Check if it's a double-click and if there's a node at this position
        if (event.detail === 2) {
          const rect = this.canvas.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          const node = this.getNodeAtPosition(x, y);
          if (node) return false; // Prevent zoom on node double-click
        }
        
        return true;
      })
      .on('zoom', (event) => {
        if (event.sourceEvent) {
          event.sourceEvent.preventDefault();
        }
        this.transform = event.transform;
        this.render();
      });

    (this as any).zoomBehavior = zoom;
    d3.select(this.canvas).call(zoom as any);
  }

  private initializeSimulation() {
    const nodeCount = this.data.nodes.length;
    const chargeStrength = nodeCount > 1000 ? -30 : nodeCount > 500 ? -80 : -200;
    const linkDistance = nodeCount > 1000 ? 50 : nodeCount > 500 ? 80 : 120;
    
    // Set up group centers for clustering
    this.setupGroupCenters();
    
    this.simulation = d3.forceSimulation<GraphNode>(this.data.nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(this.data.links)
        .id((d) => d.id)
        .distance(linkDistance)
        .strength(0.3)) // Weaker link force for better clustering
      .force('charge', d3.forceManyBody().strength(chargeStrength))
      .force('center', d3.forceCenter(this.width / 2, this.height / 2))
      .force('collision', d3.forceCollide().radius(15)) // Larger collision radius for spacing
      .force('cluster', this.createClusteringForce()) // Custom clustering force
      .alphaDecay(0.015) // Slower decay for better settling
      .velocityDecay(0.6); // More damping

    this.simulation.on('tick', () => this.render());
    this.animate();
  }

  private setupGroupCenters() {
    // Calculate centers for each group
    const groups = Array.from(new Set(this.data.nodes.map(n => n.group)));
    const angleStep = (2 * Math.PI) / groups.length;
    const centerRadius = Math.min(this.width, this.height) * 0.25;
    
    groups.forEach((group, i) => {
      const angle = i * angleStep;
      const x = this.width / 2 + Math.cos(angle) * centerRadius;
      const y = this.height / 2 + Math.sin(angle) * centerRadius;
      this.groupCenters.set(group, { x, y });
    });
  }

  private createClusteringForce() {
    const strength = 0.1;
    return (alpha: number) => {
      this.data.nodes.forEach(node => {
        const center = this.groupCenters.get(node.group);
        if (center && node.x !== undefined && node.y !== undefined) {
          node.vx = (node.vx || 0) + (center.x - node.x) * strength * alpha;
          node.vy = (node.vy || 0) + (center.y - node.y) * strength * alpha;
        }
      });
    };
  }

  private updateGraph() {
    if (!this.simulation) return;
    
    // Recalculate group centers for new data
    this.setupGroupCenters();
    
    this.simulation.nodes(this.data.nodes);
    this.simulation.force('link', d3.forceLink<GraphNode, GraphLink>(this.data.links)
      .id((d) => d.id));
    
    // Update clustering force with new group centers
    this.simulation.force('cluster', this.createClusteringForce());
    
    // Restart simulation and set up auto-fit when it settles
    this.simulation.alpha(1).restart();
    
    // Listen for simulation to settle and then auto-fit
    if (this.data.nodes.length > 0) {
      const autoFitHandler = () => {
        if (this.simulation.alpha() < 0.01) {
          this.simulation.on('tick.autofit', null); // Remove this listener
          setTimeout(() => this.fitToScreen(), 200); // Small delay for final positioning
        }
      };
      this.simulation.on('tick.autofit', autoFitHandler);
    }
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
    
    ctx.save();
    ctx.clearRect(0, 0, this.width, this.height);
    
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);
    
    const scale = transform.k;
    const showLabels = scale > this.LOD_THRESHOLD_LABELS;
    const showSmallNodes = scale > this.LOD_THRESHOLD_SMALL_NODES;
    
    // Render cluster background circles first (behind everything)
    this.renderClusterCircles(ctx, scale);
    
    // Render links with curves
    if (this.data.links.length < 5000 || scale > 0.5) {
      ctx.globalAlpha = Math.min(0.4, scale * 0.8);
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-gray-400').trim() || '#999';
      ctx.lineWidth = Math.max(0.5, 2 / scale);
      
      this.data.links.forEach(link => {
        const source = link.source as GraphNode;
        const target = link.target as GraphNode;
        
        if (source.x !== undefined && source.y !== undefined && 
            target.x !== undefined && target.y !== undefined) {
          
          // Calculate curve control point
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          
          // Create a gentle curve
          const curvature = 0.2;
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;
          
          // Perpendicular offset for curve
          const offsetX = -dy * curvature;
          const offsetY = dx * curvature;
          
          const controlX = midX + offsetX;
          const controlY = midY + offsetY;
          
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.quadraticCurveTo(controlX, controlY, target.x, target.y);
          ctx.stroke();
        }
      });
    }
    
    // Render nodes with enhanced styling
    ctx.globalAlpha = 1;
    
    if (this.data.nodes.length > this.MAX_NODES_FULL_RENDER && !showSmallNodes) {
      // Simple rendering for very large datasets when zoomed out
      this.data.nodes.forEach(node => {
        if (node.x !== undefined && node.y !== undefined) {
          // Highlight search results even in simple mode
          if (this.searchResults.has(node.id)) {
            ctx.fillStyle = '#ff6b6b';
            ctx.fillRect(node.x - 3, node.y - 3, 6, 6);
          } else {
            ctx.fillStyle = this.color(node.group);
            ctx.fillRect(node.x - 2, node.y - 2, 4, 4);
          }
        }
      });
    } else {
      // Enhanced node rendering
      this.data.nodes.forEach(node => {
        if (node.x === undefined || node.y === undefined) return;
        
        const baseSize = Math.max(this.MIN_NODE_SIZE, 8 / Math.sqrt(scale));
        const nodeSize = baseSize + (Math.random() * 2 - 1); // Slight size variation
        const fillColor = this.color(node.group);
        
        // Draw node shadow
        if (showSmallNodes) {
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
          ctx.beginPath();
          ctx.arc(node.x + 1, node.y + 1, nodeSize, 0, 2 * Math.PI);
          ctx.fill();
        }
        
        ctx.globalAlpha = 0.9;
        
        // Draw main node
        ctx.beginPath();
        ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI);
        ctx.fillStyle = fillColor;
        ctx.fill();
        
        // Draw node border
        if (showSmallNodes) {
          // Highlight selected nodes or search results
          if (this.selectedNodes.has(node.id)) {
            ctx.strokeStyle = '#007bff';
            ctx.lineWidth = Math.max(3, 4 / scale);
          } else if (this.searchResults.has(node.id)) {
            ctx.strokeStyle = '#ff6b6b';
            ctx.lineWidth = Math.max(3, 4 / scale);
          } else {
            ctx.strokeStyle = this.getDarkerColor(fillColor);
            ctx.lineWidth = Math.max(1, 2 / scale);
          }
          ctx.stroke();
          
          // Add inner highlight
          ctx.globalAlpha = 0.6;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.lineWidth = Math.max(0.5, 1 / scale);
          ctx.beginPath();
          ctx.arc(node.x - nodeSize * 0.3, node.y - nodeSize * 0.3, nodeSize * 0.4, 0, Math.PI);
          ctx.stroke();
        }
        
        ctx.globalAlpha = 1;
        
        // Draw labels for nearby nodes or search results
        if (showLabels && (this.isNodeNearMouse(node) || this.searchResults.has(node.id))) {
          ctx.fillStyle = this.searchResults.has(node.id) ? '#ff6b6b' : 
            getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary').trim() || '#333';
          ctx.font = `${Math.max(10, 14 / scale)}px Arial`;
          ctx.textAlign = 'left';
          ctx.fillText(node.label, node.x + nodeSize + 4, node.y + 4);
        }
      });
    }
    
    if (this.dragNode && this.dragNode.x !== undefined && this.dragNode.y !== undefined) {
      ctx.beginPath();
      ctx.arc(this.dragNode.x, this.dragNode.y, 8 / scale, 0, 2 * Math.PI);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 3 / scale;
      ctx.stroke();
    }
    
    // Draw cluster labels
    this.renderClusterLabels(ctx, scale);
    
    // Draw lasso selection path
    if (this.isLassoActive && this.lassoPath.length > 1) {
      ctx.strokeStyle = '#007bff';
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([5 / scale, 5 / scale]);
      ctx.beginPath();
      ctx.moveTo(this.lassoPath[0].x, this.lassoPath[0].y);
      for (let i = 1; i < this.lassoPath.length; i++) {
        ctx.lineTo(this.lassoPath[i].x, this.lassoPath[i].y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    ctx.restore();
  }

  private getDarkerColor(color: string): string {
    // Convert pastel color to its darker variant using CSS variables
    const colorMap: {[key: string]: string} = {
      '#a8d8ea': '--color-pastel-blue-dark',
      '#aa96da': '--color-pastel-purple-dark',
      '#fcbad3': '--color-pastel-pink-dark',
      '#ffb3ba': '--color-pastel-coral-dark',
      '#ffdfba': '--color-pastel-peach-dark',
      '#ffffba': '--color-pastel-yellow-dark',
      '#baffc9': '--color-pastel-mint-dark',
      '#bae1ff': '--color-pastel-sage-dark',
      '#e0aaff': '--color-pastel-lavender-dark',
      '#ffc9de': '--color-pastel-rose-dark',
      '#fff2cc': '--color-pastel-cream-dark',
      '#c7f0db': '--color-pastel-seafoam-dark'
    };

    const darkVar = colorMap[color.toLowerCase()];
    if (darkVar) {
      const darkColor = getComputedStyle(document.documentElement).getPropertyValue(darkVar).trim();
      if (darkColor) return darkColor;
    }

    // Fallback: manually darken the color
    const rgb = this.hexToRgb(color);
    if (rgb) {
      return `rgb(${Math.max(0, rgb.r - 30)}, ${Math.max(0, rgb.g - 30)}, ${Math.max(0, rgb.b - 30)})`;
    }
    
    return color;
  }

  private hexToRgb(hex: string): {r: number, g: number, b: number} | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
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
    
    if (this.selectedTool === 'lasso') {
      // Start lasso selection
      const point = this.transform.invert([x, y]);
      this.isLassoActive = true;
      this.lassoPath = [{ x: point[0], y: point[1] }];
      d3.select(this.canvas).on('.zoom', null);
      return;
    }
    
    const node = this.getNodeAtPosition(x, y);
    if (node) {
      event.stopPropagation();
      
      // Check for double-click to trigger node details
      if (event.detail === 2) {
        this.onNodeDoubleClick(node);
        return;
      }
      
      this.isDragging = true;
      this.dragNode = node;
      this.simulation.alphaTarget(0.3).restart();
      node.fx = node.x;
      node.fy = node.y;
      
      d3.select(this.canvas).on('.zoom', null);
    }
  }

  private onMouseMove(event: MouseEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const point = this.transform.invert([x, y]);
    this.mousePos.x = point[0];
    this.mousePos.y = point[1];
    
    if (this.isLassoActive) {
      // Add point to lasso path
      this.lassoPath.push({ x: point[0], y: point[1] });
      this.render();
    } else if (this.isDragging && this.dragNode) {
      this.dragNode.fx = point[0];
      this.dragNode.fy = point[1];
      this.render();
    }
    
    // Update cursor based on tool
    if (this.selectedTool === 'lasso') {
      this.canvas.style.cursor = 'crosshair';
    } else {
      const node = this.getNodeAtPosition(x, y);
      this.canvas.style.cursor = node ? 'pointer' : (this.isPanning ? 'move' : 'grab');
    }
  }

  private onMouseUp() {
    if (this.isLassoActive) {
      // Complete lasso selection
      this.completeLassoSelection();
      this.isLassoActive = false;
      this.lassoPath = [];
      
      const zoomBehavior = (this as any).zoomBehavior;
      if (zoomBehavior) {
        d3.select(this.canvas).call(zoomBehavior);
      }
      this.render();
    } else if (this.dragNode) {
      this.simulation.alphaTarget(0);
      this.dragNode.fx = null;
      this.dragNode.fy = null;
      
      const zoomBehavior = (this as any).zoomBehavior;
      if (zoomBehavior) {
        d3.select(this.canvas).call(zoomBehavior);
      }
    }
    this.isDragging = false;
    this.dragNode = null;
  }

  private onNodeDoubleClick(node: GraphNode) {
    if (this.selectedCollection) {
      this.nodeClick.emit({
        nodeId: node.id,
        collectionName: this.selectedCollection
      });
    }
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
    let validNodes = 0;
    
    this.data.nodes.forEach(node => {
      if (node.x !== undefined && node.y !== undefined && 
          isFinite(node.x) && isFinite(node.y)) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x);
        maxY = Math.max(maxY, node.y);
        validNodes++;
      }
    });
    
    if (validNodes === 0) return;
    
    const width = Math.max(maxX - minX, 50); // Minimum width
    const height = Math.max(maxY - minY, 50); // Minimum height
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    
    // Add padding and ensure reasonable scale limits
    const scale = Math.min(8, Math.max(0.1, 0.8 / Math.max(width / this.width, height / this.height)));
    const translate = [this.width / 2 - scale * midX, this.height / 2 - scale * midY];
    
    d3.select(this.canvas)
      .transition()
      .duration(1000)
      .call(zoomBehavior.transform, 
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
  }

  private renderClusterCircles(ctx: CanvasRenderingContext2D, scale: number) {
    if (!this.data.clusters || !this.data.clusters.length) return;
    
    // Calculate cluster boundaries
    const clusterBounds = this.calculateClusterBounds();
    
    // Draw background circles for each cluster
    this.data.clusters.forEach(cluster => {
      const bounds = clusterBounds.get(cluster.id);
      if (!bounds || bounds.nodeCount === 0) return;
      
      // Calculate cluster center and radius - tight, data-driven bounds
      const centerX = bounds.sumX / bounds.nodeCount;
      const centerY = bounds.sumY / bounds.nodeCount;
      const radius = Math.max(bounds.radius/4, 8); // Use actual statistical bounds, tiny minimum
      
      // Create radial gradient - color in center, transparent at edges
      const clusterColor = this.clusterColors(cluster.id.toString());
      const opacity = Math.min(0.3, scale * 0.7); // Slightly higher for gradient effect
      
      // Create radial gradient
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      
      // Convert hex color to RGB for alpha gradient
      const rgb = this.hexToRgb(clusterColor);
      if (rgb) {
        gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`); // Color in center
        gradient.addColorStop(0.7, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity * 0.4})`); // Fade
        gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`); // Transparent at edge
      } else {
        // Fallback if color parsing fails - use CSS color with opacity
        gradient.addColorStop(0, clusterColor);
        gradient.addColorStop(0.7, clusterColor + '80'); // Semi-transparent
        gradient.addColorStop(1, clusterColor + '00'); // Transparent
      }
      
      // Draw cluster circle with gradient
      ctx.save();
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    });
  }

  private renderClusterLabels(ctx: CanvasRenderingContext2D, scale: number) {
    if (!this.data.clusters || !this.data.clusters.length) return;
    
    // Calculate cluster centers based on node positions
    const clusterCenters = this.calculateClusterCenters();
    
    // Draw cluster labels based on zoom level - more granular with more clusters
    this.data.clusters.forEach(cluster => {
      // Check if cluster should be visible at current zoom level - adjusted for more clusters
      const minZoomLevel = [0.08, 0.04, 0.015, 0.008][cluster.level]; // More visible thresholds for granular clusters
      if (scale < minZoomLevel) return;
      
      const center = clusterCenters.get(cluster.id);
      if (!center || center.count === 0) return;
      
      const avgX = center.x / center.count;
      const avgY = center.y / center.count;
      
      // Calculate label properties based on cluster size and zoom - more visible at far zoom
      const baseFontSize = Math.min(32, Math.max(16, cluster.size * 0.8));
      const fontSize = Math.max(12, baseFontSize / Math.sqrt(scale)); // Ensure minimum readable size
      const opacity = Math.min(1, Math.max(0.6, scale * 5)) * (cluster.level === 0 ? 1 : 0.9);
      
      // Draw cluster label
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.font = `${fontSize}px var(--font-family-base)`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Draw text shadow for better visibility
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 3 / scale;
      ctx.strokeText(cluster.label, avgX, avgY - 20 / scale);
      
      // Draw main text
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-text-primary').trim() || '#333';
      ctx.fillText(cluster.label, avgX, avgY - 20 / scale);
      
      // Draw sublabels if zoomed in enough - more granular display for more clusters
      if (scale > 0.2 && cluster.sublabels && cluster.sublabels.length > 0) {
        const subFontSize = Math.max(10, fontSize * 0.7); // Ensure minimum readable size
        ctx.font = `${subFontSize}px var(--font-family-base)`;
        ctx.globalAlpha = opacity * 0.8;
        
        cluster.sublabels.forEach((sublabel, i) => {
          const yOffset = (i + 1) * (15 / scale);
          ctx.fillText(sublabel, avgX, avgY - 20 / scale + yOffset);
        });
      }
      
      ctx.restore();
    });
  }
  
  private calculateClusterCenters(): Map<number, {x: number, y: number, count: number}> {
    const centers = new Map<number, {x: number, y: number, count: number}>();
    
    // Initialize centers
    if (this.data.clusters) {
      this.data.clusters.forEach(cluster => {
        centers.set(cluster.id, { x: 0, y: 0, count: 0 });
      });
    }
    
    // Calculate centers based on node positions
    this.data.nodes.forEach(node => {
      if (node.clusterId !== undefined && node.x !== undefined && node.y !== undefined) {
        const center = centers.get(node.clusterId);
        if (center) {
          center.x += node.x;
          center.y += node.y;
          center.count++;
        }
      }
    });
    
    return centers;
  }
  
  private calculateClusterBounds(): Map<number, {sumX: number, sumY: number, nodeCount: number, radius: number}> {
    const bounds = new Map<number, {sumX: number, sumY: number, nodeCount: number, radius: number}>();
    
    // Initialize bounds for each cluster
    if (this.data.clusters) {
      this.data.clusters.forEach(cluster => {
        bounds.set(cluster.id, { sumX: 0, sumY: 0, nodeCount: 0, radius: 0 });
      });
    }
    
    // First pass: calculate centers
    this.data.nodes.forEach(node => {
      if (node.clusterId !== undefined && node.x !== undefined && node.y !== undefined) {
        const bound = bounds.get(node.clusterId);
        if (bound) {
          bound.sumX += node.x;
          bound.sumY += node.y;
          bound.nodeCount++;
        }
      }
    });
    
    // Second pass: calculate radius using standard deviation approach for tighter bounds
    bounds.forEach((bound, clusterId) => {
      if (bound.nodeCount === 0) return;
      
      const centerX = bound.sumX / bound.nodeCount;
      const centerY = bound.sumY / bound.nodeCount;
      
      let sumSquaredDistances = 0;
      let maxDistance = 0;
      
      this.data.nodes.forEach(node => {
        if (node.clusterId === clusterId && node.x !== undefined && node.y !== undefined) {
          const distance = Math.sqrt(
            Math.pow(node.x - centerX, 2) + Math.pow(node.y - centerY, 2)
          );
          sumSquaredDistances += distance * distance;
          maxDistance = Math.max(maxDistance, distance);
        }
      });
      
      // Use 1.5 * standard deviation for tighter, more accurate clustering bounds
      const variance = sumSquaredDistances / bound.nodeCount;
      const stdDev = Math.sqrt(variance);
      const dataRadius = Math.min(stdDev * 1.5, maxDistance * 0.7); // Much tighter bounds
      
      bound.radius = Math.max(dataRadius, 8); // Very small minimum radius
    });
    
    return bounds;
  }

  private clearSelection() {
    this.selectedNodes.clear();
    this.selectionChange.emit([]);
    this.render();
  }

  private completeLassoSelection() {
    if (this.lassoPath.length < 3) return;
    
    // Clear previous selection
    this.selectedNodes.clear();
    
    // Check which nodes are inside the lasso polygon
    this.data.nodes.forEach(node => {
      if (node.x !== undefined && node.y !== undefined) {
        if (this.isPointInPolygon(node.x, node.y, this.lassoPath)) {
          this.selectedNodes.add(node.id);
        }
      }
    });
    
    // Emit selected nodes
    const selectedNodesList = this.data.nodes.filter(node => this.selectedNodes.has(node.id));
    this.selectionChange.emit(selectedNodesList);
  }

  private isPointInPolygon(x: number, y: number, polygon: {x: number, y: number}[]): boolean {
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      
      const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }

  private performSearch() {
    this.searchResults.clear();
    
    if (!this.searchText || this.searchText.trim().length === 0) {
      this.render();
      return;
    }
    
    const searchTerm = this.searchText.toLowerCase().trim();
    
    // Search through nodes
    this.data.nodes.forEach(node => {
      // Search in label
      if (node.label && node.label.toLowerCase().includes(searchTerm)) {
        this.searchResults.add(node.id);
        return;
      }
      
      // Search in metadata
      if (node.payload?.metadata) {
        const metadata = node.payload.metadata;
        
        // Search in title
        if (metadata.title && metadata.title.toLowerCase().includes(searchTerm)) {
          this.searchResults.add(node.id);
          return;
        }
        
        // Search in domain
        if (metadata.domain && metadata.domain.toLowerCase().includes(searchTerm)) {
          this.searchResults.add(node.id);
          return;
        }
        
        // Search in summary
        if (metadata.summary && metadata.summary.toLowerCase().includes(searchTerm)) {
          this.searchResults.add(node.id);
          return;
        }
        
        // Search in tags
        if (metadata.tags && Array.isArray(metadata.tags)) {
          const hasMatchingTag = metadata.tags.some((tag: string) => 
            tag.toLowerCase().includes(searchTerm)
          );
          if (hasMatchingTag) {
            this.searchResults.add(node.id);
            return;
          }
        }
      }
    });
    
    // Trigger re-render to show search results
    this.render();
    
    // Optionally zoom to fit search results
    if (this.searchResults.size > 0) {
      this.zoomToSearchResults();
    }
  }

  private zoomToSearchResults() {
    const searchNodes = this.data.nodes.filter(node => this.searchResults.has(node.id));
    
    if (searchNodes.length === 0) return;
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    searchNodes.forEach(node => {
      if (node.x !== undefined && node.y !== undefined) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x);
        maxY = Math.max(maxY, node.y);
      }
    });
    
    if (minX === Infinity) return;
    
    // Add padding
    const padding = 100;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Calculate scale to fit search results
    const scale = Math.min(
      this.width / width,
      this.height / height,
      2 // Max zoom level for search
    );
    
    const zoomBehavior = (this as any).zoomBehavior;
    if (zoomBehavior) {
      d3.select(this.canvas)
        .transition()
        .duration(750)
        .call(zoomBehavior.transform, 
          d3.zoomIdentity
            .translate(this.width / 2, this.height / 2)
            .scale(scale)
            .translate(-centerX, -centerY)
        );
    }
  }
}