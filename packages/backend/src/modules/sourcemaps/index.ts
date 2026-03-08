export { sourcemapsRoutes } from './routes.js';
export { SourceMapsService, type SourceMapRecord } from './service.js';
export { type SourceMapStorage, FilesystemStorage, createStorage } from './storage.js';

import { db } from '../../database/index.js';
import { SourceMapsService } from './service.js';
import { createStorage } from './storage.js';

export const sourceMapsService = new SourceMapsService(db, createStorage());
