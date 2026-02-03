/**
 * JAR Downloader - Downloads and caches Minecraft client JARs.
 *
 * This module handles downloading Minecraft client JARs from Mojang's servers,
 * verifying SHA1 checksums, and caching them locally to avoid re-downloads.
 *
 * @module asset-pipeline/jar-downloader
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import type {
  ResolvedVersion,
  JarDownloaderOptions,
  JarDownloadResult,
  DownloadProgressCallback,
} from './types.js';

const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.minecraft-assets-cache', 'jars');

/**
 * JarDownloader handles downloading, verifying, and caching Minecraft client JARs.
 */
export class JarDownloader {
  private readonly cacheDir: string;
  private readonly skipVerification: boolean;

  constructor(options: JarDownloaderOptions = {}) {
    this.cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
    this.skipVerification = options.skipVerification ?? false;
  }

  /**
   * Gets the path where a JAR would be cached.
   */
  getJarPath(version: string): string {
    return path.join(this.cacheDir, `${version}.jar`);
  }

  /**
   * Checks if a JAR is already cached and valid.
   */
  async isCached(version: ResolvedVersion): Promise<boolean> {
    const jarPath = this.getJarPath(version.id);

    if (!fs.existsSync(jarPath)) {
      return false;
    }

    if (this.skipVerification) {
      return true;
    }

    // Verify SHA1
    const hash = await this.computeSha1(jarPath);
    return hash === version.clientJarSha1;
  }

  /**
   * Computes SHA1 hash of a file.
   */
  private async computeSha1(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha1');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Downloads the client JAR for a resolved version.
   * If already cached and valid, returns the cached path immediately.
   *
   * @param version - Resolved version info from VersionResolver
   * @param onProgress - Optional progress callback
   */
  async download(
    version: ResolvedVersion,
    onProgress?: DownloadProgressCallback
  ): Promise<JarDownloadResult> {
    const jarPath = this.getJarPath(version.id);

    // Check cache first
    if (await this.isCached(version)) {
      const stats = fs.statSync(jarPath);
      return {
        jarPath,
        cached: true,
        size: stats.size,
      };
    }

    // Ensure cache directory exists
    await fs.promises.mkdir(this.cacheDir, { recursive: true });

    // Download to a temp file first, then rename (atomic)
    const tempPath = `${jarPath}.download`;

    try {
      const response = await fetch(version.clientJarUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to download JAR: ${response.status} ${response.statusText}`
        );
      }

      const contentLength = parseInt(
        response.headers.get('content-length') || '0',
        10
      );

      // Stream to file with progress tracking
      if (!response.body) {
        throw new Error('Response body is null');
      }

      const fileStream = fs.createWriteStream(tempPath);
      let downloaded = 0;

      // Convert web ReadableStream to Node.js Readable
      const reader = response.body.getReader();
      const nodeStream = new Readable({
        async read() {
          const { done, value } = await reader.read();
          if (done) {
            this.push(null);
          } else {
            downloaded += value.length;
            if (onProgress && contentLength > 0) {
              onProgress(downloaded, contentLength);
            }
            this.push(Buffer.from(value));
          }
        },
      });

      await pipeline(nodeStream, fileStream);

      // Verify SHA1
      if (!this.skipVerification) {
        const hash = await this.computeSha1(tempPath);
        if (hash !== version.clientJarSha1) {
          await fs.promises.unlink(tempPath);
          throw new Error(
            `SHA1 mismatch for ${version.id}: expected ${version.clientJarSha1}, got ${hash}`
          );
        }
      }

      // Atomic rename
      await fs.promises.rename(tempPath, jarPath);

      const stats = fs.statSync(jarPath);
      return {
        jarPath,
        cached: false,
        size: stats.size,
      };
    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(tempPath)) {
        await fs.promises.unlink(tempPath).catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Lists all cached JAR versions.
   */
  async listCached(): Promise<string[]> {
    if (!fs.existsSync(this.cacheDir)) {
      return [];
    }

    const files = await fs.promises.readdir(this.cacheDir);
    return files
      .filter((f) => f.endsWith('.jar'))
      .map((f) => f.replace('.jar', ''));
  }

  /**
   * Removes a cached JAR.
   */
  async removeFromCache(version: string): Promise<void> {
    const jarPath = this.getJarPath(version);
    if (fs.existsSync(jarPath)) {
      await fs.promises.unlink(jarPath);
    }
  }

  /**
   * Clears all cached JARs.
   */
  async clearCache(): Promise<void> {
    if (!fs.existsSync(this.cacheDir)) {
      return;
    }

    const files = await fs.promises.readdir(this.cacheDir);
    await Promise.all(
      files
        .filter((f) => f.endsWith('.jar'))
        .map((f) => fs.promises.unlink(path.join(this.cacheDir, f)))
    );
  }

  /**
   * Gets the total size of cached JARs in bytes.
   */
  async getCacheSize(): Promise<number> {
    if (!fs.existsSync(this.cacheDir)) {
      return 0;
    }

    const files = await fs.promises.readdir(this.cacheDir);
    let total = 0;
    for (const file of files) {
      if (file.endsWith('.jar')) {
        const stats = await fs.promises.stat(path.join(this.cacheDir, file));
        total += stats.size;
      }
    }
    return total;
  }
}

// Default singleton instance
let defaultDownloader: JarDownloader | null = null;

/**
 * Gets the default JarDownloader instance.
 */
export function getJarDownloader(options?: JarDownloaderOptions): JarDownloader {
  if (!defaultDownloader || options) {
    defaultDownloader = new JarDownloader(options);
  }
  return defaultDownloader;
}
