import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { MeshData } from '../models/mesh-data.model';

@Injectable({
    providedIn: 'root'
})
export class SharedDataService {
    private meshDataSubject = new BehaviorSubject<MeshData | null>(null);
    public meshData$: Observable<MeshData | null> = this.meshDataSubject.asObservable();

    private originalImageSubject = new BehaviorSubject<string | null>(null);
    public originalImage$: Observable<string | null> = this.originalImageSubject.asObservable();

    constructor() { }

    setMeshData(meshData: MeshData | null): void {
        this.meshDataSubject.next(meshData);
    }

    getMeshData(): MeshData | null {
        return this.meshDataSubject.value;
    }

    setOriginalImage(imageSrc: string | null): void {
        this.originalImageSubject.next(imageSrc);
    }

    getOriginalImage(): string | null {
        return this.originalImageSubject.value;
    }

    clearAll(): void {
        this.meshDataSubject.next(null);
        this.originalImageSubject.next(null);
    }
}
