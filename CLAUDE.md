# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Starting Development
- `npm install` - Install all dependencies for the monorepo
- `npm run dev` - Start both frontend (port 4200) and backend (port 3001) concurrently
- `npm run dev:frontend` - Start only the Angular frontend
- `npm run dev:backend` - Start only the Node.js backend

### Building
- `npm run build` - Build both frontend and backend
- `npm run build:frontend` - Build only the frontend (outputs to apps/frontend/dist/frontend)
- `npm run build:backend` - Build only the backend (TypeScript compilation)

### Testing and Linting
- `npm run test` - Run tests for both applications
- `npm run lint` - Run ESLint for both applications
- Frontend tests: `cd apps/frontend && npm test` (Karma/Jasmine)
- Backend tests: `cd apps/backend && npm test` (Jest)

### Running Individual Frontend Tests
- `cd apps/frontend && ng test --include='**/specific-test.spec.ts'`

## Architecture Overview

This is a monorepo containing two applications that work together to visualize vector database relationships:

### Frontend (Angular 17 + D3.js)
- **Location**: `/apps/frontend`
- **Key Components**:
  - `network-graph-fullscreen.component.ts` - Advanced D3.js network visualization with clustering
    - Tag-based cluster analysis and hierarchical labels
    - Colored background circles for cluster boundaries
    - Zoom-level dependent label visibility
    - Canvas-based rendering for performance with 10k+ nodes
  - `qdrant.service.ts` - Service for API communication with backend
- **Architecture**: Standalone Angular components with signal-based state management
- **Styling**: SCSS with component-scoped styles, Phosphor icons, glassmorphism UI
- **DEOCOUPLE HTML AND STYLING FROM TS COMPONENTNS**: Important! Never everything into one file.

### Backend (Node.js + Express)
- **Location**: `/apps/backend`
- **Entry Point**: `src/index.ts`
- **API Endpoints**:
  - `GET /health` - Health check
  - `GET /api/collections` - List QDrant collections
  - `GET /api/collections/:name/points` - Get points with pagination (lightweight metadata only)
  - `GET /api/collections/:name/points/:id` - **NEW**: Get full content for specific point by ID
  - `GET /api/collections/:name/search` - Search within collection
  - `GET /api/collections/:name/clustered` - Get similarity-based clustered data with tag analysis
    - **Default**: 16 clusters (increased from 8 for better granularity)
    - **Optimized**: Returns lightweight nodes (title, domain, tags, summary only)
    - Returns nodes, links, cluster labels, and hierarchical zoom levels
    - Analyzes tags within vector-similarity clusters with uniqueness scoring
    - Dynamic thresholds optimized for granular clustering
- **Dependencies**: Express, Helmet (security), CORS, QDrant JS client

### Environment Configuration
Before running the backend, create `/apps/backend/.env`:
```
PORT=3001
QDRANT_HOST=your-qdrant-cloud-url
QDRANT_PORT=6333
QDRANT_API_KEY=your-api-key
```

### Key Integration Points
1. Frontend calls backend API on port 3001
2. Backend connects to QDrant cloud instance using credentials from .env
3. D3.js visualizes vector relationships from QDrant collections
4. CORS is enabled for local development

### Development Workflow
1. Ensure QDrant credentials are configured in backend .env
2. Run `npm install` from root directory
3. Use `npm run dev` to start both services
4. Frontend hot reloads on file changes
5. Backend restarts automatically with tsx watch mode

## Data Schema Reference

### QDrant Document Structure
Documents in the vector store follow this structure:

```json
{
  "content": "Full text content of the document...",
  "metadata": {
    "source": "https://example.com/page",
    "blobType": "text/plain",
    "loc": {
      "lines": {
        "from": 1,
        "to": 29
      }
    },
    "indexedAt": "2025-07-05T15:49:11.474+02:00",
    "domain": "example.com",
    "domainId": "unique-domain-id",
    "siteId": "unique-site-id",
    "richness": 0.9,
    "tags": [
      "keyword1",
      "keyword2",
      "category"
    ],
    "title": "Document Title",
    "summary": "Brief description of the document content and purpose"
  }
}
```

### Key Metadata Fields
- **source**: Original URL of the document
- **domain/domainId/siteId**: Hierarchical identifiers for content organization
- **indexedAt**: Timestamp when document was processed
- **richness**: Content quality score (0-1)
- **tags**: Array of relevant keywords and categories
- **title**: Display name for the document
- **summary**: Concise description of content and purpose
- **loc.lines**: Line range information for text segments

## Cluster Visualization Features

### Tag-Based Clustering with Uniqueness Scoring
The system performs intelligent clustering analysis prioritizing distinctive tags:
1. **Vector Similarity**: K-means clustering on document embeddings
2. **Global Tag Analysis**: Counts tag frequency across entire dataset to identify common vs unique tags
3. **Uniqueness Scoring**: `localRelevance × (0.7 + globalRarity × 0.3)`
   - **Local Relevance**: How important the tag is within the cluster
   - **Global Rarity**: How uncommon the tag is across all documents (1 - globalFrequency)
   - **Weighted Score**: Favors tags that are both locally relevant and globally distinctive
4. **Smart Filtering (Optimized for 16 Clusters)**: 
   - Excludes very common tags (present in >95% of documents)
   - Requires minimum 15% local relevance within cluster (more lenient for granular clusters)
   - Minimum 10% of cluster size threshold (down from 15%)
   - Prioritizes tags with high uniqueness scores over just frequency
5. **Duplicate Handling**: Automatically renames duplicate cluster labels using secondary tags

### Hierarchical Zoom Levels with Uniqueness Boost (16 Clusters)
Clusters have visibility levels optimized for granular clustering:
- **Level 0 (Always Visible ≥ 0.08)**: 
  - High uniqueness (>0.7) + 2+ nodes, OR
  - Good uniqueness (>0.5) + 3+ nodes, OR
  - Medium uniqueness (>0.4) + 5+ nodes, OR  
  - Traditional: 8+ nodes + 40%+ relevance + uniqueness bonus
- **Level 1 (Wide Zoom ≥ 0.04)**: 4+ nodes + 25%+ relevance + uniqueness considerations
- **Level 2 (Medium Zoom ≥ 0.015)**: 2+ nodes + 20%+ relevance + uniqueness considerations  
- **Level 3 (Close Zoom ≥ 0.008)**: Small/common clusters with lower uniqueness scores

### Visual Elements
1. **Radial Gradient Circles**: Elegant cluster boundaries with soft edges
   - Unique color per cluster from 16-color palette
   - **Radial Gradient**: Color in center fading to transparent at edges
   - **Gradient Stops**: Center (30% opacity) → 70% fade → Edge (transparent)
   - **No Borders**: Clean, modern appearance without hard edges
   - **Data-Driven Sizing**: Radius = 1.5 × standard deviation of node distances from center
   - **Statistical Bounds**: Captures ~86% of cluster nodes with tight, accurate boundaries
   - **Minimum Radius**: 8px for visibility
2. **Floating Labels**: Cluster names positioned at cluster centroids
   - Primary tag label always shown
   - Secondary tags shown at zoom > 0.2 (more granular display for 16 clusters)
   - Font size scales with cluster importance and zoom level
3. **Rendering Order**: Circles → Links → Nodes → Labels (back to front)