import { Injectable } from '@angular/core';
import { MeshData, ProcessingProgress, ImageUpload, ExportOptions } from '../models/mesh-data.model';

export interface StoredProject {
    id: string;
    name: string;
    timestamp: number;
    imagePreview: string;
    meshData?: any; // Serialized mesh data
    exportOptions?: ExportOptions;
}

@Injectable({
    providedIn: 'root'
})
export class StorageService {
    private readonly STORAGE_KEY = 'img2obj_projects';
    private readonly MAX_PROJECTS = 10;

    constructor() { }

    /**
     * Save project to local storage
     */
    saveProject(project: StoredProject): void {
        try {
            const projects = this.getAllProjects();

            // Check if project exists
            const existingIndex = projects.findIndex(p => p.id === project.id);

            if (existingIndex >= 0) {
                projects[existingIndex] = project;
            } else {
                projects.unshift(project);

                // Limit number of stored projects
                if (projects.length > this.MAX_PROJECTS) {
                    projects.pop();
                }
            }

            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(projects));
        } catch (error) {
            console.error('Error saving project:', error);
        }
    }

    /**
     * Get all stored projects
     */
    getAllProjects(): StoredProject[] {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Error loading projects:', error);
            return [];
        }
    }

    /**
     * Get project by ID
     */
    getProject(id: string): StoredProject | null {
        const projects = this.getAllProjects();
        return projects.find(p => p.id === id) || null;
    }

    /**
     * Delete project
     */
    deleteProject(id: string): void {
        try {
            const projects = this.getAllProjects();
            const filtered = projects.filter(p => p.id !== id);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
        } catch (error) {
            console.error('Error deleting project:', error);
        }
    }

    /**
     * Clear all projects
     */
    clearAllProjects(): void {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
        } catch (error) {
            console.error('Error clearing projects:', error);
        }
    }

    /**
     * Generate unique project ID
     */
    generateProjectId(): string {
        return `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Save processing progress
     */
    saveProgress(projectId: string, progress: ProcessingProgress): void {
        try {
            const key = `${this.STORAGE_KEY}_progress_${projectId}`;
            localStorage.setItem(key, JSON.stringify(progress));
        } catch (error) {
            console.error('Error saving progress:', error);
        }
    }

    /**
     * Get processing progress
     */
    getProgress(projectId: string): ProcessingProgress | null {
        try {
            const key = `${this.STORAGE_KEY}_progress_${projectId}`;
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error loading progress:', error);
            return null;
        }
    }

    /**
     * Clear processing progress
     */
    clearProgress(projectId: string): void {
        try {
            const key = `${this.STORAGE_KEY}_progress_${projectId}`;
            localStorage.removeItem(key);
        } catch (error) {
            console.error('Error clearing progress:', error);
        }
    }

    /**
     * Get storage usage info
     */
    getStorageInfo(): { used: number; available: number; percentage: number } {
        try {
            let used = 0;
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key)) {
                    used += localStorage[key].length + key.length;
                }
            }

            // Approximate available storage (5MB typical limit)
            const available = 5 * 1024 * 1024;
            const percentage = (used / available) * 100;

            return { used, available, percentage };
        } catch (error) {
            console.error('Error getting storage info:', error);
            return { used: 0, available: 0, percentage: 0 };
        }
    }
}
