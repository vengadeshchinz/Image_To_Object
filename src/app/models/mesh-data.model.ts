import * as THREE from 'three';

/**
 * Represents depth map data extracted from an image
 */
export interface DepthMap {
  width: number;
  height: number;
  data: Float32Array;
  alpha?: Float32Array; // 0-1 mask data (1 = object, 0 = background)
  min: number;
  max: number;
}

/**
 * Represents texture data for 3D models
 */
export interface TextureData {
  image: HTMLImageElement | HTMLCanvasElement;
  width: number;
  height: number;
  format: string;
}

/**
 * Material properties for 3D models
 */
export interface MaterialProperties {
  color?: string;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  transparent?: boolean;
  side?: THREE.Side;
}

/**
 * 3D Mesh data structure
 */
export interface MeshData {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  texture?: TextureData;
  vertexCount: number;
  faceCount: number;
  boundingBox?: THREE.Box3;
}

/**
 * Export quality levels
 */
export enum ExportQuality {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  ULTRA = 'ultra'
}

/**
 * Supported export formats
 */
export enum ExportFormat {
  GLTF = 'gltf',
  GLB = 'glb',
  BABYLON = 'babylon',
  OBJ = 'obj',
  STL = 'stl',
  FBX = 'fbx'
}

/**
 * Export configuration options
 */
export interface ExportOptions {
  format: ExportFormat;
  quality: ExportQuality;
  includeTextures: boolean;
  textureResolution?: number;
  compress: boolean;
  fileName: string;
  binary?: boolean; // For formats that support both binary and ASCII
}

/**
 * Processing status for image-to-3D conversion
 */
export enum ProcessingStatus {
  IDLE = 'idle',
  UPLOADING = 'uploading',
  PROCESSING_IMAGE = 'processing_image',
  GENERATING_DEPTH = 'generating_depth',
  CREATING_MESH = 'creating_mesh',
  APPLYING_TEXTURE = 'applying_texture',
  OPTIMIZING = 'optimizing',
  COMPLETE = 'complete',
  ERROR = 'error'
}

/**
 * Processing progress information
 */
export interface ProcessingProgress {
  status: ProcessingStatus;
  progress: number; // 0-100
  message: string;
  error?: string;
}

/**
 * Image upload data
 */
export interface ImageUpload {
  file: File;
  preview: string;
  width: number;
  height: number;
  size: number;
}

/**
 * Model statistics
 */
export interface ModelStatistics {
  vertices: number;
  faces: number;
  triangles: number;
  fileSize?: number;
  dimensions?: {
    width: number;
    height: number;
    depth: number;
  };
}

/**
 * 3D Generation settings
 */
export interface GenerationSettings {
  depthScale: number; // How much to extrude based on depth
  smoothing: boolean;
  subdivisions: number;
  targetPolyCount?: number;
  generateNormals: boolean;
}
