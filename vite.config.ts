import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	resolve: {
		alias: {
			'$root': '/src/lib/index.js',
		}
	},
	plugins: [sveltekit()]
});
