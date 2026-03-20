import { defineConfig } from 'vitest/config';
import path from 'path';

// Unit test config - no DB required, no globalSetup
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        // No globalSetup, no setupFiles - pure unit tests
        include: ['src/**/*.test.ts'],
        testTimeout: 10000,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
