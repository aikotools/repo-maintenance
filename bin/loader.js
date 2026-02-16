/**
 * Node.js ESM loader that adds .js extension to extensionless relative imports.
 * Required because tsc with module:"preserve" emits imports as written in source.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !specifier.match(/\.\w+$/)) {
    return nextResolve(specifier + '.js', context)
  }
  return nextResolve(specifier, context)
}
