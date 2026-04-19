import { Injectable } from '@angular/core';
import * as tf from '@tensorflow/tfjs';
import { DepthMap, ImageUpload, TextureData } from '../models/mesh-data.model';

@Injectable({
    providedIn: 'root'
})
export class ImageProcessorService {
    private depthModel: any = null;
    private modelLoaded = false;

    constructor() {
        this.initializeModel();
    }

    /**
     * Initialize TensorFlow.js depth estimation model
     */
    private async initializeModel(): Promise<void> {
        try {
            // Set TensorFlow backend
            await tf.ready();
            console.log('TensorFlow.js initialized');
            // Note: In production, you would load a proper depth estimation model
            // For now, we'll use a simplified approach
            this.modelLoaded = true;
        } catch (error) {
            console.error('Error initializing depth model:', error);
        }
    }

    /**
     * Upload and validate image
     */
    async uploadImage(file: File): Promise<ImageUpload> {
        return new Promise((resolve, reject) => {
            if (!file.type.startsWith('image/')) {
                reject(new Error('Invalid file type. Please upload an image.'));
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    resolve({
                        file,
                        preview: e.target?.result as string,
                        width: img.width,
                        height: img.height,
                        size: file.size
                    });
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target?.result as string;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * Generate depth map from image using simplified algorithm
     * In production, this would use a proper depth estimation model like MiDaS
     */
    async generateDepthMap(imageElement: HTMLImageElement, maskThreshold: number = 0.1, invertDepth: boolean = false): Promise<DepthMap> {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        // Resize for processing (smaller = faster)
        const maxDim = 512;
        const scale = Math.min(maxDim / imageElement.width, maxDim / imageElement.height);
        canvas.width = Math.floor(imageElement.width * scale);
        canvas.height = Math.floor(imageElement.height * scale);

        ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Simplified depth estimation based on luminance
        let depthData = new Float32Array(canvas.width * canvas.height);
        let alphaData = new Float32Array(canvas.width * canvas.height);

        for (let i = 0; i < imageData.data.length; i += 4) {
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];

            // Calculate luminance as depth proxy
            let depth = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

            if (invertDepth) {
                depth = 1.0 - depth;
            }

            const idx = i / 4;
            depthData[idx] = depth;

            // Simple background masking: object is usually different from the threshold
            // If invertDepth is true, we assume object is lighter, so we mask values below threshold
            // If invertDepth is false, we assume object is darker, so we mask values above threshold (uncommon for depth)
            // Let's use a simpler logic: alpha is 1 if depth > threshold (after inversion)
            alphaData[idx] = depth > maskThreshold ? 1.0 : 0.0;
        }

        // Apply smoothing to reduce spikes
        depthData = (this as any).smoothDepthData(depthData, canvas.width, canvas.height, 2);
        alphaData = (this as any).smoothDepthData(alphaData, canvas.width, canvas.height, 1);

        // Calculate min/max for the smoothed data
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < depthData.length; i++) {
            if (depthData[i] < min) min = depthData[i];
            if (depthData[i] > max) max = depthData[i];
        }

        return {
            width: canvas.width,
            height: canvas.height,
            data: depthData,
            alpha: alphaData,
            min,
            max
        };
    }

    /**
     * Simple box blur for Float32Array depth data
     */
    private smoothDepthData(data: Float32Array, width: number, height: number, passes: number): Float32Array {
        let current = data;
        for (let p = 0; p < passes; p++) {
            const next = new Float32Array(width * height);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    let sum = 0;
                    let count = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const nx = x + kx;
                            const ny = y + ky;
                            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                                sum += current[ny * width + nx];
                                count++;
                            }
                        }
                    }
                    next[y * width + x] = sum / count;
                }
            }
            current = next;
        }
        return current;
    }

    /**
     * Extract texture from image
     */
    async extractTexture(imageElement: HTMLImageElement): Promise<TextureData> {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        canvas.width = imageElement.width;
        canvas.height = imageElement.height;
        ctx.drawImage(imageElement, 0, 0);

        return {
            image: canvas,
            width: canvas.width,
            height: canvas.height,
            format: 'image/png'
        };
    }

    /**
     * Optimize image for processing
     */
    async optimizeImage(imageElement: HTMLImageElement, maxSize: number = 2048): Promise<HTMLCanvasElement> {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        let width = imageElement.width;
        let height = imageElement.height;

        if (width > maxSize || height > maxSize) {
            const scale = Math.min(maxSize / width, maxSize / height);
            width = Math.floor(width * scale);
            height = Math.floor(height * scale);
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(imageElement, 0, 0, width, height);

        return canvas;
    }

    /**
     * Convert image URL to HTMLImageElement
     */
    async loadImage(url: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = url;
        });
    }

    /**
     * Apply filters to enhance depth perception
     */
    applyDepthEnhancement(depthMap: DepthMap, strength: number = 1.0): DepthMap {
        const enhanced = new Float32Array(depthMap.data.length);
        const range = depthMap.max - depthMap.min;

        for (let i = 0; i < depthMap.data.length; i++) {
            // Normalize and apply contrast enhancement
            const normalized = (depthMap.data[i] - depthMap.min) / range;
            const enhanced_value = Math.pow(normalized, 1 / (1 + strength * 0.5));
            enhanced[i] = enhanced_value;
        }

        return {
            ...depthMap,
            data: enhanced,
            min: 0,
            max: 1
        };
    }
}
