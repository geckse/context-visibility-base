import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface QdrantCollection {
  name: string;
  status: string;
  vectors_count: number;
  points_count: number;
  config: any;
}

export interface QdrantPoint {
  id: string | number;
  payload: any;
  vector?: number[];
}

export interface QdrantSearchResult {
  id: string | number;
  payload: any;
  score: number;
}

@Injectable({
  providedIn: 'root'
})
export class QdrantService {
  private apiUrl = 'http://localhost:3001/api';

  constructor(private http: HttpClient) {}

  getCollections(): Observable<{ collections: QdrantCollection[] }> {
    return this.http.get<{ collections: QdrantCollection[] }>(`${this.apiUrl}/collections`);
  }

  getPoints(collectionName: string, limit: number = 10000, offset: number = 0): Observable<{
    points: QdrantPoint[],
    next_page_offset?: number
  }> {
    return this.http.get<{
      points: QdrantPoint[],
      next_page_offset?: number
    }>(`${this.apiUrl}/collections/${collectionName}/points?limit=${limit}&offset=${offset}`);
  }

  searchPoints(collectionName: string, query: any, limit: number = 10): Observable<QdrantSearchResult[]> {
    return this.http.get<QdrantSearchResult[]>(
      `${this.apiUrl}/collections/${collectionName}/search?query=${encodeURIComponent(JSON.stringify(query))}&limit=${limit}`
    );
  }

  getClusteredData(collectionName: string, limit: number = 1000, clusters: number = 16): Observable<{
    nodes: any[],
    links: any[],
    clusters: any[],
    clusterCenters: any[],
    clusterStats: {
      totalClusters: number,
      avgClusterSize: number,
      linkCount: number
    }
  }> {
    return this.http.get<{
      nodes: any[],
      links: any[],
      clusters: any[],
      clusterCenters: any[],
      clusterStats: {
        totalClusters: number,
        avgClusterSize: number,
        linkCount: number
      }
    }>(`${this.apiUrl}/collections/${collectionName}/clustered?limit=${limit}&clusters=${clusters}`);
  }

  getPointDetails(collectionName: string, pointId: string): Observable<{
    id: string,
    label: string,
    content: string,
    metadata: any,
    payload: any
  }> {
    return this.http.get<{
      id: string,
      label: string,
      content: string,
      metadata: any,
      payload: any
    }>(`${this.apiUrl}/collections/${collectionName}/points/${pointId}`);
  }
}