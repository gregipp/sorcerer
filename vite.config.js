import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import legacy from '@vitejs/plugin-legacy';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Custom plugin to inline patches as embedded JSON
const inlinePatchesPlugin = () => {
  return {
    name: 'inline-patches',
    transformIndexHtml(html, { mode }) {
      if (mode !== 'static') return html;

      // Read all patch files and embed them as script tags with type="application/json"
      const patchFiles = [
        'patches/classic_theremin.json',
        'patches/bright_saw_lead.json',
        'patches/brutal_brass_bass.json',
      ];

      const patchScripts = patchFiles
        .map((file, index) => {
          try {
            const content = readFileSync(resolve(file), 'utf-8');
            const filename = file.split('/').pop();
            return `    <script type="application/json" data-patch="${filename}" id="patch-${index}">${content}</script>`;
          } catch (e) {
            console.warn(`Failed to load patch ${file}:`, e);
            return null;
          }
        })
        .filter(Boolean)
        .join('\n');

      // Insert patches after the body tag
      return html.replace(
        '<body>',
        `<body>\n  <!-- Embedded Patches -->\n${patchScripts}\n`
      );
    },
  };
};

export default defineConfig(({ mode }) => {
  const isStatic = mode === 'static';
  const isDynamic = mode === 'dynamic';

  console.log(`Building in ${mode} mode...`);

  return {
    root: '.',
    base: './',

    build: {
      outDir: isStatic ? 'dist/static' : 'dist/dynamic',
      emptyOutDir: true,
      minify: isStatic ? 'terser' : false,

      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
        },

        output: {
          // For dynamic build, preserve module structure
          entryFileNames: isDynamic ? 'js/[name].js' : '[name].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name.endsWith('.css')) {
              return isDynamic ? 'css/[name][extname]' : '[name][extname]';
            }
            return '[name][extname]';
          },
        },
      },

      // Copy patches directory for dynamic build
      copyPublicDir: isDynamic,

      terserOptions: {
        compress: {
          drop_console: false, // Keep console logs for debugging
          drop_debugger: true,
        },
        format: {
          comments: false,
        },
      },
    },

    plugins: [
      // For static build, inline everything into a single file
      isStatic &&
        viteSingleFile({
          removeViteModuleLoader: true,
          inlinePattern: ['**/*.js', '**/*.css'],
          // v2 configuration options
          deleteInlinedFiles: true,
          useRecommendedBuildConfig: true,
        }),

      // Inline patches for static build
      isStatic && inlinePatchesPlugin(),

      // Legacy browser support
      legacy({
        targets: ['defaults', 'not IE 11'],
        renderLegacyChunks: false,
      }),
    ].filter(Boolean),

    server: {
      port: 3000,
      host: true,
      open: true,
    },

    preview: {
      port: 3001,
      host: true,
      open: true,
    },

    publicDir: isDynamic ? 'patches' : false,

    resolve: {
      alias: {
        '@': resolve(__dirname, './js'),
      },
    },
  };
});
