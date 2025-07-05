# Context Visibility Base

A monorepo project for visualizing and editing Agent Knowledge Base using a D3.js Network Graph to display QDrant Vector Database relations.

## Project Structure

```
context-visibility-base/
├── apps/
│   ├── frontend/          # Angular application
│   └── backend/           # Node.js REST API
├── package.json           # Root package.json with workspace configuration
└── README.md
```

## Features

- **Angular Frontend**: Interactive web interface with D3.js network graph visualization
- **Node.js Backend**: REST API for QDrant vector database integration
- **D3.js Network Graph**: Dynamic visualization of vector database relations
- **QDrant Integration**: Cloud-based vector database connectivity
- **Monorepo Architecture**: Organized workspace for both frontend and backend

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm 8+
- QDrant Cloud account (optional, for production)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd context-visibility-base
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
# Copy the example environment file
cp apps/backend/.env.example apps/backend/.env

# Edit the .env file with your QDrant credentials
```

### Development

Start both frontend and backend in development mode:
```bash
npm run dev
```

This will start:
- Backend API server on `http://localhost:3001`
- Frontend development server on `http://localhost:4200`

### Individual Services

Start backend only:
```bash
npm run dev:backend
```

Start frontend only:
```bash
npm run dev:frontend
```

## Backend API

The backend provides REST endpoints for QDrant integration:

- `GET /health` - Health check endpoint
- `GET /api/collections` - List all collections
- `GET /api/collections/:name/points` - Get points from a collection
- `GET /api/collections/:name/search` - Search points in a collection

## Frontend Features

- **Collection Selection**: Browse and select QDrant collections
- **Interactive Graph**: D3.js powered network visualization
- **Real-time Updates**: Dynamic graph updates when switching collections
- **Responsive Design**: Works on desktop and mobile devices

## Configuration

### Backend Environment Variables

Create `apps/backend/.env` with:

```env
PORT=3001
QDRANT_HOST=your-qdrant-cloud-url
QDRANT_PORT=6333
QDRANT_API_KEY=your-api-key
```

### QDrant Cloud Setup

1. Create a QDrant Cloud account
2. Create a new cluster
3. Get your API key and cluster URL
4. Update the backend `.env` file with your credentials

## Build and Deploy

Build both applications:
```bash
npm run build
```

Build individual applications:
```bash
npm run build:frontend
npm run build:backend
```

## Testing

Run tests for both applications:
```bash
npm run test
```

## Linting

Run linting for both applications:
```bash
npm run lint
```

## License

MIT