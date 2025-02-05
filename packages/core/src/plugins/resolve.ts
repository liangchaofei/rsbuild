import type {
  ChainIdentifier,
  NormalizedEnvironmentConfig,
  RspackChain,
} from '@rsbuild/shared';
import { reduceConfigs } from 'reduce-configs';
import { castArray } from '../helpers';
import { ensureAbsolutePath } from '../helpers/path';
import type { RsbuildPlugin } from '../types';

// compatible with legacy packages with type="module"
// https://github.com/webpack/webpack/issues/11467
function applyFullySpecified({
  chain,
  CHAIN_ID,
}: {
  chain: RspackChain;
  config: NormalizedEnvironmentConfig;
  CHAIN_ID: ChainIdentifier;
}) {
  chain.module
    .rule(CHAIN_ID.RULE.MJS)
    .test(/\.m?js/)
    .resolve.set('fullySpecified', false);
}

function applyExtensions({ chain }: { chain: RspackChain }) {
  const extensions = [
    // most projects are using TypeScript, resolve .ts(x) files first to reduce resolve time.
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.json',
  ];

  chain.resolve.extensions.merge(extensions);
}

function applyAlias({
  chain,
  config,
  rootPath,
}: {
  chain: RspackChain;
  config: NormalizedEnvironmentConfig;
  rootPath: string;
}) {
  const { alias } = config.source;

  if (!alias) {
    return;
  }

  const mergedAlias = reduceConfigs({
    initial: {},
    config: alias,
  });

  /**
   * Format alias value:
   * - Relative paths need to be turned into absolute paths.
   * - Absolute paths or a package name are not processed.
   */
  for (const name of Object.keys(mergedAlias)) {
    const values = castArray(mergedAlias[name]);
    const formattedValues = values.map((value) => {
      if (typeof value === 'string' && value.startsWith('.')) {
        return ensureAbsolutePath(rootPath, value);
      }
      return value;
    });

    chain.resolve.alias.set(
      name,
      (formattedValues.length === 1 ? formattedValues[0] : formattedValues) as
        | string
        | string[],
    );
  }
}

export const pluginResolve = (): RsbuildPlugin => ({
  name: 'rsbuild:resolve',

  setup(api) {
    api.modifyBundlerChain({
      order: 'pre',
      handler: (chain, { environment, CHAIN_ID }) => {
        const { config } = environment;

        applyExtensions({ chain });

        applyAlias({
          chain,
          config,
          rootPath: api.context.rootPath,
        });

        // in some cases (modern.js), get error when fullySpecified rule after js rule
        applyFullySpecified({ chain, config, CHAIN_ID });
      },
    });

    api.modifyRspackConfig(async (rspackConfig, { environment }) => {
      const { tsconfigPath, config } = environment;

      if (tsconfigPath && config.source.aliasStrategy === 'prefer-tsconfig') {
        rspackConfig.resolve ||= {};

        if (typeof rspackConfig.resolve.tsConfig === 'string') {
          return;
        }

        rspackConfig.resolve.tsConfig = {
          configFile: tsconfigPath,
          ...rspackConfig.resolve.tsConfig,
        };
      }
    });
  },
});
