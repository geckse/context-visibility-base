# Context Knowledge Holosphere

A sophisticated vector database visualization system that transforms high-dimensional knowledge representations into an interactive 3D holographic experience. Built with Angular, D3.js, and QDrant vector database.

![Context Knowledge Holosphere](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Overview

Context Knowledge Holosphere provides an intuitive way to explore and interact with vector embeddings stored in QDrant. It creates a visual knowledge graph where similar concepts cluster together, making it easy to discover relationships and patterns in your data.

### Key Features

- **Interactive 3D Visualization**: Explore your vector database as an immersive network graph
- **Smart Clustering**: Automatic tag-based clustering with hierarchical zoom levels
- **Real-time Search**: Keyword-based search with visual highlighting
- **Lasso Selection**: Select multiple nodes for batch operations
- **Glassmorphism UI**: Modern, elegant interface with smooth animations
- **Performance Optimized**: Handles 10,000+ nodes with canvas-based rendering

## The Idea

Traditional vector databases are powerful but opaque - it's hard to understand what's inside them or how different pieces of knowledge relate. Context Knowledge Holosphere solves this by:

1. **Visual Representation**: Each vector becomes a node in 3D space
2. **Spatial Relationships**: Similar vectors cluster together naturally
3. **Interactive Exploration**: Zoom, pan, and explore your knowledge base
4. **Contextual Understanding**: See tags, summaries, and relationships at a glance

## Technical Approach

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Angular App   │────▶│   Express API   │────▶│     QDrant      │
│   (Frontend)    │     │   (Backend)     │     │  Vector Store   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                        │
        │                        │
        ▼                        ▼
┌─────────────────┐     ┌─────────────────┐
│   D3.js Force   │     │   K-means       │
│   Simulation    │     │   Clustering    │
└─────────────────┘     └─────────────────┘
```

### Core Technologies

- **Frontend**: Angular 17 with standalone components
- **Visualization**: D3.js force simulation with canvas rendering
- **Backend**: Express.js with TypeScript
- **Vector Database**: QDrant for similarity search
- **Styling**: SCSS with CSS custom properties
- **Icons**: Phosphor Icons (thin variant)
- **Build**: Nx monorepo structure

### Key Algorithms

1. **K-means Clustering**: Groups similar vectors based on cosine similarity
2. **Tag Analysis**: Identifies unique tags for cluster labeling
3. **Force Simulation**: Creates organic layouts with attractive/repulsive forces
4. **Point-in-Polygon**: Enables lasso selection of nodes

## Project Structure

```
context-visibility-base/
├── apps/
│   ├── backend/          # Express API server
│   │   ├── src/
│   │   │   └── index.ts  # Main API endpoints
│   │   └── package.json
│   │
│   └── frontend/         # Angular application
│       ├── src/
│       │   ├── app/
│       │   │   ├── components/
│       │   │   │   └── network-graph-fullscreen/
│       │   │   └── services/
│       │   │       └── qdrant.service.ts
│       │   └── styles.scss
│       └── package.json
│
├── CLAUDE.md            # Development documentation
├── package.json         # Root package.json
└── README.md           # This file
```

## Tech Stack

### Frontend
- Angular 17 (standalone components)
- D3.js v7 (force simulation & zoom)
- TypeScript 5.2
- SCSS with glassmorphism design
- Phosphor Icons
- RxJS for reactive programming

### Backend
- Node.js with Express
- TypeScript
- QDrant JavaScript client
- CORS enabled
- Environment variables with dotenv

### Development Tools
- Nx monorepo
- ESLint & Prettier
- npm workspaces

## Installation

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- QDrant instance (local or cloud)

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/context-visibility-base.git
cd context-visibility-base
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
# Create .env file in apps/backend/
cp apps/backend/.env.example apps/backend/.env

# Edit with your QDrant configuration
QDRANT_HOST=http://localhost:6333
QDRANT_API_KEY=your-api-key-if-needed
PORT=3001
```

4. Start QDrant (if running locally):
```bash
docker run -p 6333:6333 qdrant/qdrant
```

## Running the Application

### Development Mode

Start both frontend and backend in development mode:
```bash
npm run dev
```

This will start:
- Backend API on http://localhost:3001
- Frontend app on http://localhost:4200

### Production Build

Build for production:
```bash
npm run build
```

### Individual Services

Run backend only:
```bash
npm run dev:backend
```

Run frontend only:
```bash
npm run dev:frontend
```

## Usage

1. **Select a Collection**: Choose a QDrant collection from the dropdown
2. **Explore**: Use mouse to pan and zoom the visualization
3. **Search**: Type keywords to highlight matching nodes
4. **Select**: Use the lasso tool to select multiple nodes
5. **Inspect**: Double-click any node to view detailed information

### Controls

- **Pan**: Click and drag on empty space
- **Zoom**: Scroll wheel or zoom buttons
- **Select Node**: Click on a node
- **View Details**: Double-click a node
- **Lasso Select**: Click lasso tool, then draw around nodes
- **Search**: Type in the search box (searches titles, tags, summaries)

## API Endpoints

### Backend API

- `GET /health` - Health check
- `GET /api/collections` - List all QDrant collections
- `GET /api/collections/:name/points` - Get points from a collection
- `GET /api/collections/:name/clustered` - Get clustered visualization data
- `GET /api/collections/:name/points/:id` - Get detailed point information

## Configuration

### Clustering Parameters

Adjust in `apps/backend/src/index.ts`:
- `numClusters`: Number of clusters (default: 16)
- `maxIterations`: K-means iterations (default: 10)
- `linkThreshold`: Similarity threshold for links (default: 0.5)

### Visualization Settings

Modify in `network-graph-fullscreen.component.ts`:
- `chargeStrength`: Node repulsion force
- `linkDistance`: Ideal link length
- `LOD_THRESHOLD_LABELS`: Zoom level for labels
- `MAX_NODES_FULL_RENDER`: Performance threshold

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -am 'Add your feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- QDrant team for the excellent vector database
- D3.js community for visualization tools
- Angular team for the modern framework
- Phosphor Icons for beautiful iconography

## Future Enhancements

- [ ] Semantic search using embeddings
- [ ] 3D visualization mode
- [ ] Collaborative filtering
- [ ] Export/import visualizations
- [ ] Real-time updates via WebSocket
- [ ] Advanced filtering options
- [ ] Custom clustering algorithms
- [ ] VR/AR support

---

Built with ❤️ for exploring the depths of knowledge