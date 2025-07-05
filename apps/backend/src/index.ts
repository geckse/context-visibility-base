import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { QdrantClient } from '@qdrant/js-client-rest';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());

const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_HOST || 'http://localhost:6333',
  apiKey: process.env.QDRANT_API_KEY
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/collections', async (_req, res) => {
  try {
    const collections = await qdrantClient.getCollections();
    res.json(collections);
  } catch (error) {
    console.error('Error fetching collections:', error);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

app.get('/api/collections/:collectionName/points', async (req, res) => {
  try {
    const { collectionName } = req.params;
    const { limit = 10000, offset = 0 } = req.query;
    
    // Cap the limit at 10000 for performance
    const maxLimit = Math.min(parseInt(limit as string), 10000);
    
    const points = await qdrantClient.scroll(collectionName, {
      limit: maxLimit,
      offset: parseInt(offset as string),
      with_payload: true,
      with_vector: false
    });
    
    res.json(points);
  } catch (error) {
    console.error('Error fetching points:', error);
    res.status(500).json({ error: 'Failed to fetch points' });
  }
});

app.get('/api/collections/:collectionName/search', async (req, res) => {
  try {
    const { collectionName } = req.params;
    const { query, limit = 10000 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    
    const searchResults = await qdrantClient.search(collectionName, {
      vector: query as any,
      limit: parseInt(limit as string),
      with_payload: true
    });
    
    res.json(searchResults);
  } catch (error) {
    console.error('Error searching points:', error);
    res.status(500).json({ error: 'Failed to search points' });
  }
});

app.get('/api/collections/:collectionName/clustered', async (req, res) => {
  try {
    const { collectionName } = req.params;
    const { limit = 1000, clusters = 16 } = req.query; // Increased default clusters for better granularity
    
    // Get points with vectors for clustering
    const points = await qdrantClient.scroll(collectionName, {
      limit: parseInt(limit as string),
      with_payload: true,
      with_vector: true
    });
    
    if (!points.points || points.points.length === 0) {
      return res.json({ clusters: [], links: [] });
    }
    
    // Perform clustering based on vector similarity
    const clusteredData = performVectorClustering(points.points, parseInt(clusters as string));
    
    res.json(clusteredData);
  } catch (error) {
    console.error('Error clustering points:', error);
    res.status(500).json({ error: 'Failed to cluster points' });
  }
});

app.get('/api/collections/:collectionName/points/:pointId', async (req, res) => {
  try {
    const { collectionName, pointId } = req.params;
    
    // Get specific point with full content
    const result = await qdrantClient.retrieve(collectionName, {
      ids: [pointId],
      with_payload: true,
      with_vector: false
    });
    
    if (!result || result.length === 0) {
      return res.status(404).json({ error: 'Point not found' });
    }
    
    const point = result[0];
    
    // Return full point data including content
    res.json({
      id: point.id.toString(),
      label: (point.payload as any)?.metadata?.title || (point.payload as any)?.title || (point.payload as any)?.name || `Point ${point.id}`,
      content: (point.payload as any)?.content || '',
      metadata: (point.payload as any)?.metadata || {},
      payload: point.payload
    });
  } catch (error) {
    console.error('Error fetching point details:', error);
    res.status(500).json({ error: 'Failed to fetch point details' });
  }
});

// Enhanced clustering with tag analysis
function performVectorClustering(points: any[], numClusters: number) {
  // Simple k-means-like clustering using cosine similarity
  const vectors = points.map((p: any) => p.vector);
  
  // Initialize cluster centers randomly
  const clusterCenters = [];
  for (let i = 0; i < numClusters; i++) {
    const randomPoint = vectors[Math.floor(Math.random() * vectors.length)];
    clusterCenters.push([...randomPoint]);
  }
  
  // Assign points to clusters based on cosine similarity
  const assignments = new Array(points.length);
  const maxIterations = 10;
  
  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign each point to nearest cluster center
    for (let i = 0; i < points.length; i++) {
      let bestCluster = 0;
      let bestSimilarity = -1;
      
      for (let j = 0; j < numClusters; j++) {
        const similarity = cosineSimilarity(vectors[i], clusterCenters[j]);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestCluster = j;
        }
      }
      assignments[i] = bestCluster;
    }
    
    // Update cluster centers
    for (let j = 0; j < numClusters; j++) {
      const clusterPoints = [];
      for (let i = 0; i < points.length; i++) {
        if (assignments[i] === j) {
          clusterPoints.push(vectors[i]);
        }
      }
      
      if (clusterPoints.length > 0) {
        // Calculate centroid
        const centroid = new Array(vectors[0].length).fill(0);
        for (const point of clusterPoints) {
          for (let k = 0; k < point.length; k++) {
            centroid[k] += point[k];
          }
        }
        for (let k = 0; k < centroid.length; k++) {
          centroid[k] /= clusterPoints.length;
        }
        clusterCenters[j] = centroid;
      }
    }
  }
  
  // Analyze tags within each cluster
  const clusterTags = analyzeClusterTags(points, assignments, numClusters);
  
  // Build result with cluster assignments - lightweight without full content
  const clusteredNodes = points.map((point: any, index: number) => ({
    id: point.id.toString(),
    label: point.payload?.metadata?.title || point.payload?.title || point.payload?.name || `Point ${point.id}`,
    group: point.payload?.metadata?.domain || `cluster_${assignments[index]}`,
    clusterId: assignments[index],
    // Only include essential metadata, not full content
    payload: {
      metadata: {
        title: point.payload?.metadata?.title,
        domain: point.payload?.metadata?.domain,
        tags: point.payload?.metadata?.tags,
        summary: point.payload?.metadata?.summary
      }
    },
    similarity: 0 // Will be calculated for links
  }));
  
  // Generate links based on similarity within and between clusters
  const links = [];
  const maxLinks = Math.min(clusteredNodes.length * 3, 5000);
  
  for (let i = 0; i < points.length && links.length < maxLinks; i++) {
    // Find most similar points for this node
    const similarities = [];
    for (let j = 0; j < points.length; j++) {
      if (i !== j) {
        const sim = cosineSimilarity(vectors[i], vectors[j]);
        similarities.push({ index: j, similarity: sim });
      }
    }
    
    // Sort by similarity and take top connections
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topConnections = similarities.slice(0, Math.min(5, similarities.length));
    
    for (const conn of topConnections) {
      // Only create link if similarity is above threshold
      if (conn.similarity > 0.5) {
        links.push({
          source: clusteredNodes[i].id,
          target: clusteredNodes[conn.index].id,
          value: conn.similarity * 10,
          similarity: conn.similarity
        });
      }
    }
  }
  
  // Calculate cluster centers in 2D space for label positioning
  const clusterCenters2D = calculateClusterCenters2D(clusteredNodes, assignments, numClusters);
  
  return {
    nodes: clusteredNodes,
    links: links,
    clusters: clusterTags,
    clusterCenters: clusterCenters2D,
    clusterStats: {
      totalClusters: numClusters,
      avgClusterSize: Math.round(clusteredNodes.length / numClusters),
      linkCount: links.length
    }
  };
}

// Analyze tags within clusters to find common themes with uniqueness scoring
function analyzeClusterTags(points: any[], assignments: number[], numClusters: number) {
  const clusterTagCounts: Map<string, number>[] = new Array(numClusters);
  
  // Initialize cluster tag maps
  for (let i = 0; i < numClusters; i++) {
    clusterTagCounts[i] = new Map<string, number>();
  }
  
  // First pass: count all tags globally to determine commonness
  const globalTagCounts = new Map<string, number>();
  points.forEach((point) => {
    const tags = point.payload?.metadata?.tags || [];
    tags.forEach((tag: string) => {
      globalTagCounts.set(tag, (globalTagCounts.get(tag) || 0) + 1);
    });
  });
  
  // Count tags per cluster
  points.forEach((point, index) => {
    const clusterId = assignments[index];
    const tags = point.payload?.metadata?.tags || [];
    
    tags.forEach((tag: string) => {
      const count = clusterTagCounts[clusterId].get(tag) || 0;
      clusterTagCounts[clusterId].set(tag, count + 1);
    });
  });
  
  // Process tags to find representative labels for each cluster
  const clusterInfo = [];
  for (let i = 0; i < numClusters; i++) {
    const tagMap = clusterTagCounts[i];
    const clusterSize = assignments.filter(a => a === i).length;
    
    if (tagMap.size === 0 || clusterSize === 0) {
      clusterInfo.push({
        id: i,
        label: `Cluster ${i + 1}`,
        size: clusterSize,
        tags: [],
        level: 0
      });
      continue;
    }
    
    // Calculate uniqueness scores and sort by relevance, not just frequency
    const tagScores = Array.from(tagMap.entries())
      .map(([tag, clusterCount]) => {
        const globalCount = globalTagCounts.get(tag) || 0;
        const localRelevance = clusterCount / clusterSize; // How relevant in this cluster
        const globalRarity = 1 - (globalCount / points.length); // How unique globally
        const uniquenessScore = localRelevance * (0.7 + globalRarity * 0.3); // Weighted score
        
        return {
          tag,
          clusterCount,
          globalCount,
          localRelevance,
          globalRarity,
          uniquenessScore
        };
      })
      .filter(score => 
        score.clusterCount >= Math.max(1, clusterSize * 0.1) && // More lenient threshold for smaller clusters
        score.globalRarity > 0.05 && // Less strict on common tags (present in >95% of docs)
        score.localRelevance > 0.15   // Slightly lower relevance requirement for granular clusters
      )
      .sort((a, b) => b.uniquenessScore - a.uniquenessScore); // Sort by uniqueness, not frequency
    
    if (tagScores.length === 0) {
      clusterInfo.push({
        id: i,
        label: `Cluster ${i + 1}`,
        size: clusterSize,
        tags: [],
        level: 3 // Low priority for clusters without distinctive tags
      });
      continue;
    }
    
    // Process tag for clean label using uniqueness-scored tags
    const primaryTag = processTagForLabel(tagScores[0].tag);
    const secondaryTags = tagScores.slice(1, 3).map(t => processTagForLabel(t.tag));
    
    clusterInfo.push({
      id: i,
      label: primaryTag,
      sublabels: secondaryTags,
      size: clusterSize,
      tagCount: tagScores[0].clusterCount,
      uniquenessScore: tagScores[0].uniquenessScore,
      tags: tagScores.map(t => ({ tag: t.tag, count: t.clusterCount, uniqueness: t.uniquenessScore })),
      level: determineClusterLevelWithUniqueness(clusterSize, tagScores[0].clusterCount, tagScores[0].uniquenessScore)
    });
  }
  
  // Post-process to handle duplicate labels by combining or renaming
  const labelCounts = new Map<string, number>();
  clusterInfo.forEach(cluster => {
    labelCounts.set(cluster.label, (labelCounts.get(cluster.label) || 0) + 1);
  });
  
  // Rename duplicate labels to be more specific
  clusterInfo.forEach(cluster => {
    const count = labelCounts.get(cluster.label) || 1;
    if (count > 1) {
      // Add the most unique secondary tag to distinguish
      if (cluster.sublabels && cluster.sublabels.length > 0) {
        cluster.label = `${cluster.label} - ${cluster.sublabels[0]}`;
      } else {
        // Fallback to cluster ID
        cluster.label = `${cluster.label} ${cluster.id + 1}`;
      }
    }
  });
  
  return clusterInfo;
}

// Process tag into clean, readable label
function processTagForLabel(tag: string): string {
  // Remove common words and clean up
  const stopWords = ['and', 'or', 'the', 'a', 'an', 'for', 'with', 'in', 'on', 'at'];
  
  return tag
    .split(/[\s-_]+/)
    .filter(word => !stopWords.includes(word.toLowerCase()))
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .slice(0, 2) // Keep only first 2 words
    .join(' ');
}

// Determine cluster visibility level based on size, relevance, and uniqueness - adjusted for more clusters
function determineClusterLevelWithUniqueness(clusterSize: number, tagCount: number, uniquenessScore: number): number {
  const relevance = tagCount / clusterSize;
  
  // Boost visibility for highly unique clusters (more lenient for smaller clusters)
  if (uniquenessScore > 0.7 && clusterSize >= 2) return 0; // Always show very unique clusters
  if (uniquenessScore > 0.5 && clusterSize >= 3) return 0; // Show unique small clusters
  if (uniquenessScore > 0.4 && clusterSize >= 5) return 0; // Show medium unique clusters
  
  // Traditional size-based levels with uniqueness bonus (adjusted for smaller clusters)
  if (clusterSize >= 8 && relevance >= 0.4) return uniquenessScore > 0.3 ? 0 : 1;
  if (clusterSize >= 4 && relevance >= 0.25) return uniquenessScore > 0.25 ? 1 : 2;
  if (clusterSize >= 2 && relevance >= 0.2) return uniquenessScore > 0.15 ? 2 : 3;
  
  return 3; // Low priority for common/small clusters
}


// Calculate 2D positions for cluster centers
function calculateClusterCenters2D(nodes: any[], assignments: number[], numClusters: number) {
  const centers = new Array(numClusters).fill(null).map(() => ({ x: 0, y: 0, count: 0 }));
  
  // This will be calculated by D3 force simulation, so we provide initial positions
  nodes.forEach((node, index) => {
    const clusterId = assignments[index];
    if (node.x !== undefined && node.y !== undefined) {
      centers[clusterId].x += node.x;
      centers[clusterId].y += node.y;
      centers[clusterId].count++;
    }
  });
  
  // Average positions
  return centers.map((center, id) => ({
    id,
    x: center.count > 0 ? center.x / center.count : 0,
    y: center.count > 0 ? center.y / center.count : 0
  }));
}

// Cosine similarity calculation
function cosineSimilarity(vecA: number[], vecB: number[]) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});