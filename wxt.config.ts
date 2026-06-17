import {defineConfig} from 'wxt';
import preact from '@preact/preset-vite';
import {resolve} from 'path';
import fs from 'fs';


const packageJson = JSON.parse(fs.readFileSync(resolve(__dirname, 'package.json'), 'utf-8'));


// See https://wxt.dev/api/config.html
export default defineConfig({
    modules: ['@wxt-dev/webextension-polyfill'],
    vite: () => ({
        plugins: [preact()],
        define: {
            'process.env.APP_VERSION': JSON.stringify(packageJson.version),
        }
    }),
    manifest: {
        name: 'bilingual translate',
        short_name: 'bilingual translate',
        permissions: ['storage', 'contextMenus', 'offscreen'],
    },

});
