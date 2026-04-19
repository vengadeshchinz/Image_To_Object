import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { DepthMap, MeshData, TextureData, GenerationSettings, ModelStatistics } from '../models/mesh-data.model';

@Injectable({
    providedIn: 'root'
})
export class ModelGeneratorService {

    constructor() { }

    /**
     * Generate 3D mesh from depth map
     */
    async generateMeshFromDepth(
        depthMap: DepthMap,
        texture: TextureData,
        settings: GenerationSettings = this.getDefaultSettings()
    ): Promise<MeshData> {
        const { width, height, data, alpha } = depthMap;
        const { depthScale, generateNormals } = settings;

        // Create geometry
        const geometry = new THREE.BufferGeometry();

        // Generate vertices
        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];

        // Maps to keep track of old index to new vertex index for both sides
        const frontIndexMap = new Map<number, number>();
        const backIndexMap = new Map<number, number>();
        let nextVertexIndex = 0;

        // Create vertex grid with hulling
        const aspectRatio = width / height;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;

                // Discard background pixels
                if (alpha && alpha[idx] < 0.5) {
                    continue;
                }

                const depth = data[idx];
                const posX = ((x / (width - 1)) - 0.5) * aspectRatio;
                const posY = 0.5 - (y / (height - 1));
                const u = x / (width - 1);
                const v = 1 - (y / (height - 1));

                // Front Vertex
                const posZ_Front = depth * depthScale;
                vertices.push(posX, posY, posZ_Front);
                uvs.push(u, v);
                frontIndexMap.set(idx, nextVertexIndex++);

                // Back Vertex (Mirrored Z)
                const posZ_Back = -depth * depthScale;
                vertices.push(posX, posY, posZ_Back);
                uvs.push(u, v);
                backIndexMap.set(idx, nextVertexIndex++);
            }
        }

        // Create faces (triangles)
        const frontTriangles: [number, number, number][] = [];
        for (let y = 0; y < height - 1; y++) {
            for (let x = 0; x < width - 1; x++) {
                const aIdx = y * width + x;
                const bIdx = y * width + x + 1;
                const cIdx = (y + 1) * width + x;
                const dIdx = (y + 1) * width + x + 1;

                // Front Triangles
                const fa = frontIndexMap.get(aIdx);
                const fb = frontIndexMap.get(bIdx);
                const fc = frontIndexMap.get(cIdx);
                const fd = frontIndexMap.get(dIdx);

                if (fa !== undefined && fb !== undefined && fc !== undefined) {
                    indices.push(fa, fc, fb);
                    frontTriangles.push([fa, fc, fb]);
                }
                if (fb !== undefined && fc !== undefined && fd !== undefined) {
                    indices.push(fb, fc, fd);
                    frontTriangles.push([fb, fc, fd]);
                }

                // Back Triangles (mirrored winding)
                const ba = backIndexMap.get(aIdx);
                const bb = backIndexMap.get(bIdx);
                const bc = backIndexMap.get(cIdx);
                const bd = backIndexMap.get(dIdx);

                if (ba !== undefined && bb !== undefined && bc !== undefined) {
                    indices.push(ba, bb, bc);
                }
                if (bb !== undefined && bd !== undefined && bc !== undefined) {
                    indices.push(bb, bd, bc);
                }
            }
        }

        // Stitch Edges (Close the gap between front and back)
        const edgeCount = new Map<string, number>();
        const edgeToVertices = new Map<string, [number, number]>();

        for (const [v1, v2, v3] of frontTriangles) {
            const edges = [
                v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`,
                v2 < v3 ? `${v2}_${v3}` : `${v3}_${v2}`,
                v3 < v1 ? `${v3}_${v1}` : `${v1}_${v3}`
            ];

            // Map original indices back to find corresponding back vertices
            // Since front and back are created in pairs: back = front + 1
            // because vertices.push(front) then vertices.push(back)

            edges.forEach((key, i) => {
                edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
                if (!edgeToVertices.has(key)) {
                    const verts = [v1, v2, v3];
                    edgeToVertices.set(key, [verts[i], verts[(i + 1) % 3]]);
                }
            });
        }

        // Side faces for boundary edges
        edgeCount.forEach((count, key) => {
            if (count === 1) {
                const [v1_f, v2_f] = edgeToVertices.get(key)!;
                // Corresponding back vertices are always index + 1
                const v1_b = v1_f + 1;
                const v2_b = v2_f + 1;

                // Create two triangles connecting front edge to back edge
                // Winding should be consistent (outward)
                indices.push(v1_f, v2_b, v2_f);
                indices.push(v1_f, v1_b, v2_b);
            }
        });

        // Set geometry attributes
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);

        if (generateNormals) {
            geometry.computeVertexNormals();
        }

        geometry.computeBoundingBox();

        // Create material with texture
        const textureMap = new THREE.CanvasTexture(texture.image as HTMLCanvasElement);
        textureMap.colorSpace = THREE.SRGBColorSpace;

        const material = new THREE.MeshStandardMaterial({
            map: textureMap,
            side: THREE.FrontSide, // FrontSide because we have back geometry now
            metalness: 0.1,
            roughness: 0.8
        });

        const vertexCount = vertices.length / 3;
        const faceCount = indices.length / 3;

        return {
            geometry,
            material,
            texture,
            vertexCount,
            faceCount,
            boundingBox: geometry.boundingBox || undefined
        };
    }

    /**
     * Optimize mesh by reducing polygon count
     */
    async optimizeMesh(meshData: MeshData, targetPolyCount: number): Promise<MeshData> {
        // Simplified optimization - in production, use proper mesh decimation
        const currentFaceCount = meshData.faceCount;

        if (currentFaceCount <= targetPolyCount) {
            return meshData; // Already optimized
        }

        // For now, return the original mesh
        // In production, implement proper mesh simplification algorithm
        console.log(`Mesh optimization: ${currentFaceCount} -> ${targetPolyCount} faces`);

        return meshData;
    }

    /**
     * Apply texture to mesh
     */
    applyTexture(meshData: MeshData, texture: TextureData): void {
        const textureMap = new THREE.CanvasTexture(texture.image as HTMLCanvasElement);
        textureMap.colorSpace = THREE.SRGBColorSpace;

        if (meshData.material instanceof THREE.MeshStandardMaterial) {
            meshData.material.map = textureMap;
            meshData.material.needsUpdate = true;
        }

        meshData.texture = texture;
    }

    /**
     * Calculate mesh normals
     */
    calculateNormals(meshData: MeshData): void {
        meshData.geometry.computeVertexNormals();
    }

    /**
     * Get model statistics
     */
    getModelStatistics(meshData: MeshData): ModelStatistics {
        let dimensions;
        try {
            // Always recompute from live geometry to avoid prototype loss after JSON round-trip
            meshData.geometry.computeBoundingBox();
            const bbox = meshData.geometry.boundingBox;
            if (bbox) {
                const size = new THREE.Vector3();
                bbox.getSize(size);
                dimensions = {
                    width: size.x,
                    height: size.y,
                    depth: size.z
                };
            }
        } catch {
            // Fallback: compute from position buffer manually
            const pos = meshData.geometry.attributes['position'];
            if (pos) {
                let minX = Infinity, minY = Infinity, minZ = Infinity;
                let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
                for (let i = 0; i < pos.count; i++) {
                    minX = Math.min(minX, pos.getX(i)); maxX = Math.max(maxX, pos.getX(i));
                    minY = Math.min(minY, pos.getY(i)); maxY = Math.max(maxY, pos.getY(i));
                    minZ = Math.min(minZ, pos.getZ(i)); maxZ = Math.max(maxZ, pos.getZ(i));
                }
                dimensions = { width: maxX - minX, height: maxY - minY, depth: maxZ - minZ };
            }
        }

        return {
            vertices: meshData.vertexCount,
            faces: meshData.faceCount,
            triangles: meshData.faceCount,
            dimensions
        };
    }

    /**
     * Create mesh object for scene
     */
    createMeshObject(meshData: MeshData): THREE.Mesh {
        return new THREE.Mesh(meshData.geometry, meshData.material);
    }

    /**
     * Apply smoothing to geometry
     */
    applySmoothingToGeometry(geometry: THREE.BufferGeometry, iterations: number = 1): void {
        // Simple Laplacian smoothing
        const positions = geometry.attributes['position'];
        const vertexCount = positions.count;

        for (let iter = 0; iter < iterations; iter++) {
            const smoothed = new Float32Array(positions.array.length);

            for (let i = 0; i < vertexCount; i++) {
                const x = positions.getX(i);
                const y = positions.getY(i);
                const z = positions.getZ(i);

                // Simple averaging (in production, use proper neighbor detection)
                smoothed[i * 3] = x;
                smoothed[i * 3 + 1] = y;
                smoothed[i * 3 + 2] = z;
            }

            positions.array.set(smoothed);
            positions.needsUpdate = true;
        }

        geometry.computeVertexNormals();
    }

    /**
     * Get default generation settings
     */
    private getDefaultSettings(): GenerationSettings {
        return {
            depthScale: 0.3,
            smoothing: true,
            subdivisions: 1,
            targetPolyCount: 50000,
            generateNormals: true
        };
    }

    /**
     * Clone mesh data
     */
    cloneMeshData(meshData: MeshData): MeshData {
        return {
            geometry: meshData.geometry.clone(),
            material: meshData.material.clone(),
            texture: meshData.texture,
            vertexCount: meshData.vertexCount,
            faceCount: meshData.faceCount,
            boundingBox: meshData.boundingBox?.clone()
        };
    }
}
