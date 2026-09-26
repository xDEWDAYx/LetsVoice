/**
 * Keep module requests opaque to webpack so optional native dependencies
 * are resolved only when the feature is actually used.
 */
export function requireAtRuntime<T = unknown>(moduleName: string): T {
  // eslint-disable-next-line no-eval
  const runtimeRequire = eval('require') as (id: string) => unknown;
  return runtimeRequire(moduleName) as T;
}
