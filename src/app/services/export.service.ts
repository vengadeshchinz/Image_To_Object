import { Injectable } from '@angular/core';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { MeshData, ExportOptions, ExportFormat, ExportQuality } from '../models/mesh-data.model';

@Injectable({
    providedIn: 'root'
})
export class ExportService {

    constructor() { }

    /**
     * Export mesh in specified format
     */
    async exportMesh(meshData: MeshData, options: ExportOptions): Promise<void> {
        try {
            switch (options.format) {
                case ExportFormat.GLTF:
                case ExportFormat.GLB:
                    await this.exportGLTF(meshData, options);
                    break;
                case ExportFormat.BABYLON:
                    await this.exportBabylon(meshData, options);
                    break;
                case ExportFormat.OBJ:
                    await this.exportOBJ(meshData, options);
                    break;
                case ExportFormat.STL:
                    await this.exportSTL(meshData, options);
                    break;
                case ExportFormat.FBX:
                    await this.exportFBX(meshData, options);
                    break;
                default:
                    throw new Error(`Unsupported export format: ${options.format}`);
            }
        } catch (error) {
            console.error('Export error:', error);
            throw error;
        }
    }

    /**
     * Export as glTF/GLB format
     */
    async exportGLTF(meshData: MeshData, options: ExportOptions): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const mesh = new THREE.Mesh(meshData.geometry, meshData.material);
            const exporter = new GLTFExporter();

            const exportOptions = {
                binary: options.format === ExportFormat.GLB,
                embedImages: options.includeTextures,
                maxTextureSize: options.textureResolution || 2048
            };

            exporter.parse(
                mesh,
                (result) => {
                    let blob: Blob;

                    if (options.format === ExportFormat.GLB) {
                        // Binary glTF
                        blob = new Blob([result as ArrayBuffer], { type: 'application/octet-stream' });
                    } else {
                        // JSON glTF
                        const output = JSON.stringify(result, null, 2);
                        blob = new Blob([output], { type: 'application/json' });
                    }

                    const extension = options.format === ExportFormat.GLB ? '.glb' : '.gltf';
                    saveAs(blob, `${options.fileName}${extension}`);
                    resolve(blob);
                },
                (error) => {
                    reject(error);
                },
                exportOptions
            );
        });
    }

    /**
     * Export as Babylon.js format
     */
    async exportBabylon(meshData: MeshData, options: ExportOptions): Promise<Blob> {
        // Convert Three.js mesh to Babylon.js format
        const babylonData = this.convertToBabylonFormat(meshData, options);
        const json = JSON.stringify(babylonData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });

        saveAs(blob, `${options.fileName}.babylon`);
        return blob;
    }

    /**
     * Export as OBJ format
     */
    async exportOBJ(meshData: MeshData, options: ExportOptions): Promise<Blob> {
        const objContent = this.generateOBJ(meshData);
        const mtlContent = this.generateMTL(meshData, options);

        if (options.includeTextures && meshData.texture) {
            // Create ZIP with OBJ, MTL, and texture
            const zip = new JSZip();
            zip.file(`${options.fileName}.obj`, objContent);
            zip.file(`${options.fileName}.mtl`, mtlContent);

            // Add texture
            const textureBlob = await this.canvasToBlob(meshData.texture.image as HTMLCanvasElement);
            zip.file(`${options.fileName}_texture.png`, textureBlob);

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            saveAs(zipBlob, `${options.fileName}.zip`);
            return zipBlob;
        } else {
            // Just save OBJ and MTL
            const combined = `# OBJ File\nmtllib ${options.fileName}.mtl\n\n${objContent}`;
            const blob = new Blob([combined], { type: 'text/plain' });
            saveAs(blob, `${options.fileName}.obj`);
            return blob;
        }
    }

    /**
     * Export as STL format
     */
    async exportSTL(meshData: MeshData, options: ExportOptions): Promise<Blob> {
        const stlContent = options.binary
            ? this.generateBinarySTL(meshData)
            : this.generateASCIISTL(meshData, options.fileName);

        const blob = new Blob([stlContent], {
            type: options.binary ? 'application/octet-stream' : 'text/plain'
        });

        saveAs(blob, `${options.fileName}.stl`);
        return blob;
    }

    /**
     * Export as FBX format (simplified)
     */
    async exportFBX(meshData: MeshData, options: ExportOptions): Promise<Blob> {
        // FBX export is complex - for now, export as glTF with FBX extension
        // In production, use a proper FBX exporter library
        console.warn('FBX export is simplified. Consider using external conversion tools for production.');

        const gltfOptions = { ...options, format: ExportFormat.GLB };
        return this.exportGLTF(meshData, gltfOptions);
    }

    /**
     * Generate OBJ file content
     */
    private generateOBJ(meshData: MeshData): string {
        const { geometry } = meshData;
        const positions = geometry.attributes['position'];
        const uvs = geometry.attributes['uv'];
        const indices = geometry.index;

        let obj = '# Generated by Image-to-3D Converter\n\n';

        // Vertices
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);
            obj += `v ${x} ${y} ${z}\n`;
        }

        obj += '\n';

        // Texture coordinates
        if (uvs) {
            for (let i = 0; i < uvs.count; i++) {
                const u = uvs.getX(i);
                const v = uvs.getY(i);
                obj += `vt ${u} ${v}\n`;
            }
            obj += '\n';
        }

        // Faces
        obj += 'usemtl material0\n';
        if (indices) {
            for (let i = 0; i < indices.count; i += 3) {
                const a = indices.getX(i) + 1;
                const b = indices.getX(i + 1) + 1;
                const c = indices.getX(i + 2) + 1;

                if (uvs) {
                    obj += `f ${a}/${a} ${b}/${b} ${c}/${c}\n`;
                } else {
                    obj += `f ${a} ${b} ${c}\n`;
                }
            }
        }

        return obj;
    }

    /**
     * Generate MTL file content
     */
    private generateMTL(meshData: MeshData, options: ExportOptions): string {
        let mtl = '# Generated by Image-to-3D Converter\n\n';
        mtl += 'newmtl material0\n';
        mtl += 'Ka 1.0 1.0 1.0\n';
        mtl += 'Kd 1.0 1.0 1.0\n';
        mtl += 'Ks 0.0 0.0 0.0\n';
        mtl += 'Ns 10.0\n';

        if (options.includeTextures && meshData.texture) {
            mtl += `map_Kd ${options.fileName}_texture.png\n`;
        }

        return mtl;
    }

    /**
     * Generate ASCII STL content
     */
    private generateASCIISTL(meshData: MeshData, name: string): string {
        const { geometry } = meshData;
        const positions = geometry.attributes['position'];
        const indices = geometry.index;

        let stl = `solid ${name}\n`;

        if (indices) {
            for (let i = 0; i < indices.count; i += 3) {
                const a = indices.getX(i);
                const b = indices.getX(i + 1);
                const c = indices.getX(i + 2);

                const v1 = new THREE.Vector3(positions.getX(a), positions.getY(a), positions.getZ(a));
                const v2 = new THREE.Vector3(positions.getX(b), positions.getY(b), positions.getZ(b));
                const v3 = new THREE.Vector3(positions.getX(c), positions.getY(c), positions.getZ(c));

                const normal = new THREE.Vector3();
                const edge1 = new THREE.Vector3().subVectors(v2, v1);
                const edge2 = new THREE.Vector3().subVectors(v3, v1);
                normal.crossVectors(edge1, edge2).normalize();

                stl += `  facet normal ${normal.x} ${normal.y} ${normal.z}\n`;
                stl += `    outer loop\n`;
                stl += `      vertex ${v1.x} ${v1.y} ${v1.z}\n`;
                stl += `      vertex ${v2.x} ${v2.y} ${v2.z}\n`;
                stl += `      vertex ${v3.x} ${v3.y} ${v3.z}\n`;
                stl += `    endloop\n`;
                stl += `  endfacet\n`;
            }
        }

        stl += `endsolid ${name}\n`;
        return stl;
    }

    /**
     * Generate binary STL content
     */
    private generateBinarySTL(meshData: MeshData): ArrayBuffer {
        const { geometry } = meshData;
        const indices = geometry.index;
        const positions = geometry.attributes['position'];

        const triangles = indices ? indices.count / 3 : 0;
        const buffer = new ArrayBuffer(84 + (triangles * 50));
        const view = new DataView(buffer);

        // Header (80 bytes)
        const header = 'Generated by Image-to-3D Converter';
        for (let i = 0; i < 80; i++) {
            view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
        }

        // Number of triangles
        view.setUint32(80, triangles, true);

        // Triangle data
        let offset = 84;
        if (indices) {
            for (let i = 0; i < indices.count; i += 3) {
                const a = indices.getX(i);
                const b = indices.getX(i + 1);
                const c = indices.getX(i + 2);

                const v1 = new THREE.Vector3(positions.getX(a), positions.getY(a), positions.getZ(a));
                const v2 = new THREE.Vector3(positions.getX(b), positions.getY(b), positions.getZ(b));
                const v3 = new THREE.Vector3(positions.getX(c), positions.getY(c), positions.getZ(c));

                const normal = new THREE.Vector3();
                const edge1 = new THREE.Vector3().subVectors(v2, v1);
                const edge2 = new THREE.Vector3().subVectors(v3, v1);
                normal.crossVectors(edge1, edge2).normalize();

                // Normal
                view.setFloat32(offset, normal.x, true); offset += 4;
                view.setFloat32(offset, normal.y, true); offset += 4;
                view.setFloat32(offset, normal.z, true); offset += 4;

                // Vertices
                view.setFloat32(offset, v1.x, true); offset += 4;
                view.setFloat32(offset, v1.y, true); offset += 4;
                view.setFloat32(offset, v1.z, true); offset += 4;

                view.setFloat32(offset, v2.x, true); offset += 4;
                view.setFloat32(offset, v2.y, true); offset += 4;
                view.setFloat32(offset, v2.z, true); offset += 4;

                view.setFloat32(offset, v3.x, true); offset += 4;
                view.setFloat32(offset, v3.y, true); offset += 4;
                view.setFloat32(offset, v3.z, true); offset += 4;

                // Attribute byte count
                view.setUint16(offset, 0, true); offset += 2;
            }
        }

        return buffer;
    }

    /**
     * Convert Three.js mesh to Babylon.js format
     */
    private convertToBabylonFormat(meshData: MeshData, options: ExportOptions): any {
        const { geometry, material } = meshData;
        const positions = geometry.attributes['position'];
        const uvs = geometry.attributes['uv'];
        const normals = geometry.attributes['normal'];
        const indices = geometry.index;

        return {
            producer: {
                name: 'Image-to-3D Converter',
                version: '1.0',
                exporter_version: '1.0'
            },
            autoClear: true,
            clearColor: [0, 0, 0],
            ambientColor: [0, 0, 0],
            gravity: [0, -9.81, 0],
            meshes: [{
                name: options.fileName,
                id: 'mesh1',
                position: [0, 0, 0],
                rotation: [0, 0, 0],
                scaling: [1, 1, 1],
                isVisible: true,
                isEnabled: true,
                checkCollisions: false,
                billboardMode: 0,
                receiveShadows: false,
                positions: Array.from(positions.array),
                normals: normals ? Array.from(normals.array) : [],
                uvs: uvs ? Array.from(uvs.array) : [],
                indices: indices ? Array.from(indices.array) : [],
                materialId: 'material1'
            }],
            materials: [{
                name: 'material1',
                id: 'material1',
                ambient: [1, 1, 1],
                diffuse: [1, 1, 1],
                specular: [0, 0, 0],
                emissive: [0, 0, 0],
                alpha: 1,
                backFaceCulling: false
            }]
        };
    }

    /**
     * Convert canvas to blob
     */
    private canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to convert canvas to blob'));
                }
            }, 'image/png');
        });
    }
}
