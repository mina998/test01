// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import markdoc from '@astrojs/markdoc';
import keystatic from '@keystatic/astro';

// Keystatic injects on-demand /keystatic routes. Local storage only works in
// `astro dev`, so production stays fully static for Cloudflare Pages.
const isDev = process.argv.includes('dev');

// https://astro.build/config
export default defineConfig({
    session: false,
    output: 'static',
    integrations: [react(), markdoc(), ...(isDev ? [keystatic()] : [])]
});
