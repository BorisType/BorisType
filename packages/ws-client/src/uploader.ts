import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Evaluator } from './evaluator.js';

/**
 * Описание файла для загрузки
 */
class FileDescription {
    /** Абсолютный путь к файлу */
    path: string;
    /** Относительный путь от базовой директории */
    relative: string;
    /** MD5 хеш относительного пути (в верхнем регистре) */
    hash: string;
    /** Размер файла в байтах */
    size: number;

    constructor(filePath: string, basePath: string) {
        this.path = filePath;
        this.relative = path.relative(basePath, filePath).replace(/\\/g, '/');
        this.hash = crypto.createHash('md5').update(this.relative).digest('hex').toUpperCase();
        this.size = fs.statSync(filePath).size;
    }
}

/**
 * Информация о чанке файла
 */
class ChunkInfo {
    /** Путь к файлу */
    path: string;
    /** Начало чанка в файле (байты) */
    chunkStart: number;
    /** Конец чанка в файле (байты) */
    chunkEnd: number;
    /** Хеш файла */
    hash: string;
    /** Индекс чанка */
    index: number;

    constructor(filePath: string, chunkStart: number, chunkEnd: number, hash: string, index: number) {
        this.path = filePath;
        this.chunkStart = chunkStart;
        this.chunkEnd = chunkEnd;
        this.hash = hash;
        this.index = index;
    }

    toString(): string {
        return `[ ${this.hash} : '${this.path}' : (${this.index}) ${this.chunkStart}-${this.chunkEnd} ]`;
    }
}

/**
 * Результат подготовки загрузки
 */
interface PrepareResponse {
    dest_path: string;
    temp_path: string;
    chunk_path: string;
}

/**
 * Результат финализации загрузки
 */
interface FinishResponse {
    error: boolean;
    message?: string;
    value?: string[];
}

/**
 * Callback для отслеживания прогресса загрузки
 * @param uploadedBytes - количество загруженных байт
 * @param totalBytes - общий размер всех файлов
 */
export type UploadProgressCallback = (uploadedBytes: number, totalBytes: number) => void;

/**
 * Опции для создания загрузчика
 */
export interface WshcmUploaderOptions {
    /** Evaluator для выполнения кода на сервере (lifecycle управляется снаружи) */
    evaluator: Evaluator;
    /** Путь к загружаемому файлу или директории */
    path: string;
    /** Путь назначения на сервере */
    destination: string;
    /** Размер чанка в байтах (по умолчанию 4MB) */
    chunkSize?: number;
}

/**
 * Загрузчик файлов для WSHCM
 * 
 * Позволяет загружать файлы и директории на сервер WebSoft HCM
 * с разбиением на чанки и последующей сборкой на сервере.
 * 
 * @example
 * ```typescript
 * const evaluator = client.createEvaluator();
 * await evaluator.initialize();
 * 
 * const uploader = new WshcmUploader({
 *   evaluator,
 *   path: './myfile.txt',
 *   destination: 'x-local://wt/uploaded/',
 *   chunkSize: 4 * 1024 * 1024 // 4MB
 * });
 * 
 * await uploader.prepare();
 * await uploader.upload((uploaded, total) => {
 *   console.log(`Progress: ${(uploaded / total * 100).toFixed(2)}%`);
 * });
 * const urls = await uploader.finish();
 * 
 * await evaluator.close();
 * ```
 */
export class WshcmUploader {
    private evaluator: Evaluator;
    private chunkSize: number;
    
    private uploadPath: string;
    private destination: string;
    
    private isDir = false;
    private isFile = false;
    private isGlob = false;
    private totalSize = 0;
    
    /** Базовый путь для вычисления relative paths */
    private basePath: string = '';
    /** Имя для finish скрипта (пустое для glob режима) */
    private uploadName: string = '';
    
    private files: FileDescription[] = [];
    
    // Пути на сервере
    private destPath: string = '';
    private tempPath: string = '';
    private chunkPath1: string = '';
    private chunkPath2: string = '';

    /**
     * Создает новый загрузчик файлов
     * 
     * Lifecycle evaluator-а управляется вызывающим кодом —
     * uploader не вызывает evaluator.close().
     */
    constructor(options: WshcmUploaderOptions) {
        this.evaluator = options.evaluator;
        this.uploadPath = options.path;
        this.destination = options.destination;
        this.chunkSize = options.chunkSize || 4 * 1024 * 1024; // 4MB по умолчанию
    }

    /**
     * Подготавливает загрузку: сканирует файлы, создает структуру на сервере
     * 
     * Поддерживаемые форматы path:
     * - `file.txt` — загрузка одного файла
     * - `dir/` — загрузка директории (как вложенная папка)
     * - `dir/*` — загрузка содержимого директории (без вложенной папки)
     */
    async prepare(): Promise<void> {
        // Проверяем glob-паттерн (dir/* или dir\*)
        if (this.uploadPath.endsWith('/*') || this.uploadPath.endsWith('\\*')) {
            this.isGlob = true;
            const dirPath = this.uploadPath.slice(0, -2);
            
            if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
                throw new Error(`Glob pattern requires existing directory: ${dirPath}`);
            }
            
            this.basePath = dirPath;
            this.uploadName = '';  // пустое имя сигнализирует glob-режим на сервере
            this.scanDirectory(dirPath, dirPath);
        } else {
            // Обычный режим: файл или директория
            const stats = fs.statSync(this.uploadPath);
            
            if (stats.isDirectory()) {
                this.isDir = true;
                this.basePath = path.dirname(this.uploadPath);
                this.uploadName = path.basename(this.uploadPath);
                this.scanDirectory(this.uploadPath, this.basePath);
            } else if (stats.isFile()) {
                this.isFile = true;
                this.basePath = path.dirname(this.uploadPath);
                this.uploadName = path.basename(this.uploadPath);
                const fileDesc = new FileDescription(this.uploadPath, this.basePath);
                this.files.push(fileDesc);
            } else {
                throw new Error('Path is not a file or directory');
            }
        }

        // Сортируем файлы по размеру (от меньших к большим) для эффективного батчинга
        this.files.sort((a, b) => a.size - b.size);

        // Вычисляем общий размер
        this.totalSize = this.files.reduce((sum, file) => sum + file.size, 0);

        // Читаем скрипт подготовки
        const prepareScript = fs.readFileSync(
            path.join(import.meta.dirname, '..', 'resources', 'upload_prepare.bs'),
            'utf-8'
        );

        // Заменяем переменную
        const script = prepareScript.replace('{{destination}}', this.destination);

        // Выполняем на сервере
        const response = await this.evaluator.eval(script) as PrepareResponse;

        // Сохраняем пути
        this.destPath = response.dest_path.replace(/\\/g, '\\\\');
        this.tempPath = response.temp_path.replace(/\\/g, '\\\\');
        
        const [part1, part2] = response.chunk_path.split('RELATIVE_PATH_HASH');
        this.chunkPath1 = part1.replace(/\\/g, '\\\\');
        this.chunkPath2 = part2.replace(/\\/g, '\\\\');

        // Создаем директории для чанков на сервере
        const obtainDirCode = this.files
            .map(file => `ObtainDirectory('${this.chunkPath1}${file.hash}', true);`)
            .join('\n');
        
        await this.evaluator.eval(obtainDirCode);
    }

    /**
     * Загружает файлы на сервер по частям (чанкам)
     * Мелкие чанки группируются в батчи для оптимизации
     * @param callback - функция для отслеживания прогресса
     */
    async upload(callback?: UploadProgressCallback): Promise<void> {
        const chunks: ChunkInfo[] = [];

        // Создаем список всех чанков (файлы уже отсортированы по размеру)
        for (const file of this.files) {
            this.chunksFromFile(file, chunks);
        }

        // Группируем чанки в батчи
        const batches = this.batchChunks(chunks);

        let uploadedBytes = 0;

        // Загружаем батчи
        for (const batch of batches) {
            uploadedBytes += await this.uploadBatch(batch);
            
            if (callback) {
                callback(uploadedBytes, this.totalSize);
            }
        }
    }

    /**
     * Финализирует загрузку: собирает чанки и перемещает файлы в целевую директорию
     * @returns массив URL загруженных файлов
     */
    async finish(): Promise<string[]> {
        // Читаем скрипт финализации
        const finishScript = fs.readFileSync(
            path.join(import.meta.dirname, '..', 'resources', 'upload_finish.bs'),
            'utf-8'
        );

        // Заменяем переменные
        const filePaths = JSON.stringify(this.files.map(f => f.relative));

        let script = finishScript;
        script = script.replace('{{file_name}}', this.uploadName);
        script = script.replace('{{dest_path}}', this.destPath);
        script = script.replace('{{temp_path}}', this.tempPath);
        script = script.replace('{{file_paths}}', filePaths);

        // Выполняем на сервере
        const response = await this.evaluator.eval(script) as FinishResponse;

        if (response.error) {
            throw new Error(response.message || 'Upload finish failed');
        }

        return response.value || [];
    }

    /**
     * Сканирует директорию рекурсивно и добавляет файлы в список
     */
    private scanDirectory(dirPath: string, basePath: string): void {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                this.scanDirectory(fullPath, basePath);
            } else if (entry.isFile()) {
                const fileDesc = new FileDescription(fullPath, basePath);
                this.files.push(fileDesc);
            }
        }
    }

    /**
     * Разбивает файл на чанки
     */
    private chunksFromFile(file: FileDescription, chunks: ChunkInfo[]): void {
        let index = 0;

        for (let start = 0; start < file.size; start += this.chunkSize) {
            const end = Math.min(start + this.chunkSize, file.size);
            chunks.push(new ChunkInfo(file.path, start, end, file.hash, index));
            index++;
        }
    }

    /**
     * Группирует чанки в батчи для оптимизации загрузки
     * Суммарный размер данных в батче не превышает chunkSize
     */
    private batchChunks(chunks: ChunkInfo[]): ChunkInfo[][] {
        const batches: ChunkInfo[][] = [];
        let currentBatch: ChunkInfo[] = [];
        let currentSize = 0;

        for (const chunk of chunks) {
            const chunkSize = chunk.chunkEnd - chunk.chunkStart;

            // Если батч переполнится — закрываем его
            if (currentSize + chunkSize > this.chunkSize && currentBatch.length > 0) {
                batches.push(currentBatch);
                currentBatch = [];
                currentSize = 0;
            }

            currentBatch.push(chunk);
            currentSize += chunkSize;
        }

        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        }

        return batches;
    }

    /**
     * Загружает батч чанков одним запросом
     * @returns размер загруженных данных в байтах
     */
    private async uploadBatch(batch: ChunkInfo[]): Promise<number> {
        const statements: string[] = [];
        let totalSize = 0;

        for (const chunk of batch) {
            const size = chunk.chunkEnd - chunk.chunkStart;
            const buffer = Buffer.alloc(size);
            const fd = await fs.promises.open(chunk.path, 'r');
            await fd.read(buffer, 0, size, chunk.chunkStart);
            await fd.close();

            const encoded = buffer.toString('base64');
            const serverPath = `${this.chunkPath1}${chunk.hash}${this.chunkPath2}_${chunk.index}`;
            statements.push(`PutFileData('${serverPath}', Base64Decode('${encoded}'))`);
            totalSize += size;
        }

        await this.evaluator.eval(statements.join('\n'));
        return totalSize;
    }
}
